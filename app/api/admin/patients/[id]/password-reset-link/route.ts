import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";
import { generatePasswordResetToken, PASSWORD_RESET_TOKEN_TTL_MS } from "@/lib/patient-auth";
import { appBaseUrl, sendTrackedEmail } from "@/lib/email-notifications";
import { passwordResetEmail } from "@/lib/email-templates";
import { logAudit } from "@/lib/audit";
import { RATE_LIMITS, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

// Recepcja/admin wysyła klientowi link do ustawienia nowego hasła na adres
// e-mail z jego karty — ten sam link, który klient dostaje po kliknięciu
// "Zapomniałem hasła". Dla karty bez konta link pozwala ustawić pierwsze hasło.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const patient = await prisma.patient.findFirst({
    where: { id: params.id, ...scopedLocationWhere(user!) },
    select: { id: true, name: true, email: true },
  });
  if (!patient) return NextResponse.json({ ok: false, message: "Nie znaleziono pacjenta" }, { status: 404 });
  if (!patient.email) {
    return NextResponse.json(
      { ok: false, message: "Ten klient nie ma adresu e-mail w karcie — uzupełnij go albo ustaw hasło ręcznie." },
      { status: 400 },
    );
  }

  // Ten sam limit co przy samodzielnym resecie — chroni skrzynkę klienta.
  const limit = await hitRateLimit(RATE_LIMITS.forgotPasswordAccount, patient.email);
  if (!limit.allowed) {
    return tooManyRequests(limit, "Na ten adres wysłano już kilka linków w ostatniej godzinie. Spróbuj później.");
  }

  const { token, tokenHash } = generatePasswordResetToken();
  await prisma.patient.update({
    where: { id: patient.id },
    data: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
    },
  });

  const result = await sendTrackedEmail({
    ...passwordResetEmail({
      patientName: patient.name,
      resetUrl: `${appBaseUrl(req)}/panel-klienta/reset-hasla?token=${token}`,
    }),
    type: "PASSWORD_RESET",
    to: patient.email,
    patientId: patient.id,
  });

  await logAudit({
    actorId: user!.id,
    action: "PASSWORD_RESET_REQUEST",
    entity: "PatientAccount",
    entityId: patient.id,
    summary: `Wysłanie klientowi ${patient.name} linku do resetu hasła (${patient.email}) — ${
      result.ok ? "wysłano" : "nie wysłano"
    }`,
    data: { sent: result.ok, error: result.ok ? undefined : result.error },
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: `Nie udało się wysłać wiadomości: ${result.error}` },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, email: patient.email });
}
