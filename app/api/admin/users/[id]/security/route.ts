import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { requireStepUp, resetUserMfa } from "@/lib/mfa";
import { revokeAllStaffSessions } from "@/lib/session-core";
import { canManageAccount } from "@/lib/roles";

const BodySchema = z.object({ action: z.enum(["reset_mfa", "revoke_sessions"]) });

// Procedura administracyjna (audyt F-04/F-07):
//  * reset_mfa — usuwa aplikację, klucze i kody odzyskiwania pracownika (np. zgubiony
//    telefon); przy następnym logowaniu musi skonfigurować MFA od nowa,
//  * revoke_sessions — natychmiast wylogowuje pracownika ze wszystkich urządzeń.
// Oba wymagają ponownego MFA administratora i trafiają do dziennika.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;
  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, login: true, name: true, role: true, locationId: true },
  });
  if (!target) return NextResponse.json({ ok: false, message: "Nie znaleziono pracownika" }, { status: 404 });

  // Manager może tylko wylogować konto niższej roli ze swojej lokalizacji;
  // reset MFA zostaje po stronie administratora.
  if (user!.role !== "ADMIN") {
    if (parsed.data.action === "reset_mfa" || !canManageAccount(user!, target)) {
      return NextResponse.json({ ok: false, message: "Brak uprawnień do tej operacji." }, { status: 403 });
    }
  }

  if (parsed.data.action === "reset_mfa") {
    if (target.id === user!.id) {
      return NextResponse.json(
        {
          ok: false,
          message: "Nie możesz zresetować własnego MFA — użyj kodu odzyskiwania albo poproś innego administratora.",
        },
        { status: 400 },
      );
    }
    const revoked = await resetUserMfa(target.id);
    await logAudit({
      actorId: user!.id,
      action: "MFA_RESET",
      entity: "User",
      entityId: target.id,
      summary: `ALERT BEZPIECZEŃSTWA: administrator zresetował logowanie dwuskładnikowe konta „${target.login}" (${target.name}); unieważniono ${revoked} sesji`,
      data: { revokedSessions: revoked },
    });
    return NextResponse.json({ ok: true, revokedSessions: revoked });
  }

  const revoked = await revokeAllStaffSessions(
    target.id,
    "admin_revoked",
    target.id === user!.id ? user!.sessionId : undefined,
  );
  await logAudit({
    actorId: user!.id,
    action: "SESSION_REVOKE",
    entity: "User",
    entityId: target.id,
    summary: `Administrator wylogował pracownika „${target.login}" (${target.name}) ze wszystkich urządzeń (${revoked} sesji)`,
    data: { revokedSessions: revoked },
  });
  return NextResponse.json({ ok: true, revokedSessions: revoked });
}
