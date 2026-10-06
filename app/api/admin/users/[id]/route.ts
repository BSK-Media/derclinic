import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit, diffFields } from "@/lib/audit";
import { validatePassword } from "@/lib/password-policy";
import { STAFF_BCRYPT_COST } from "@/lib/staff-credentials";
import { requireStepUp } from "@/lib/mfa";
import { revokeAllStaffSessions } from "@/lib/session-core";
import { canManageAccount } from "@/lib/roles";

const PatchSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["ADMIN", "MANAGER", "RECEPTION", "SPECIALIST"]).optional(),
  email: z.string().email().optional().or(z.literal("")).optional(),
  payoutPercent: z.number().int().min(0).max(100).optional(),
  phone: z.string().optional().or(z.literal("")).optional(),
  specialistCode: z.number().int().optional(),
  isVisible: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  avatarUrl: z
    .string()
    .refine((v) => v === "" || v.startsWith("data:image/") || /^https?:\/\//.test(v), "Niepoprawne zdjęcie")
    .optional()
    .or(z.literal(""))
    .optional(),
  jobTitle: z.string().optional().or(z.literal("")).optional(),
  locationId: z.string().min(1).optional(),
  specialization: z.string().optional().or(z.literal("")).optional(),
  sourceProfileUrl: z.string().url().optional().or(z.literal("")).optional(),
  password: z.string().min(1).max(500).optional(),
});

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  // Zmiana roli albo hasła to operacja wysokiego ryzyka — wymaga ponownego MFA.
  const sensitive = parsed.data.role !== undefined || Boolean(parsed.data.password);
  if (sensitive) {
    const stepUp = requireStepUp(user!);
    if (stepUp) return stepUp;
  }

  const before = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      login: true,
      name: true,
      role: true,
      email: true,
      payoutPercent: true,
      phone: true,
      specialistCode: true,
      isVisible: true,
      isAvailable: true,
      jobTitle: true,
      locationId: true,
      specialization: true,
      sourceProfileUrl: true,
    },
  });

  if (!before) return NextResponse.json({ ok: false, message: "Nie znaleziono pracownika" }, { status: 404 });

  // Manager zarządza tylko kontami niższych ról ze swojej lokalizacji, nie
  // zmienia ról ani lokalizacji — to zostaje po stronie administratora.
  if (user!.role !== "ADMIN") {
    if (!canManageAccount(user!, before)) {
      return NextResponse.json({ ok: false, message: "Brak uprawnień do tego konta." }, { status: 403 });
    }
    if (
      parsed.data.role !== undefined ||
      (parsed.data.locationId !== undefined && parsed.data.locationId !== before.locationId)
    ) {
      return NextResponse.json(
        { ok: false, message: "Rolę i lokalizację konta zmienia administrator." },
        { status: 403 },
      );
    }
  }

  // Administrator nie może sam sobie odebrać uprawnień — dzięki temu w systemie
  // zawsze zostaje co najmniej jeden administrator (ten, który wykonuje zmianę).
  // Odebrać je może mu tylko inny administrator.
  if (params.id === user!.id && parsed.data.role !== undefined && parsed.data.role !== "ADMIN") {
    return NextResponse.json(
      {
        ok: false,
        message: "Nie możesz odebrać sobie uprawnień administratora — może to zrobić inny administrator.",
      },
      { status: 400 },
    );
  }

  const data: any = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.email !== undefined) data.email = parsed.data.email ? parsed.data.email : null;
  if (parsed.data.payoutPercent !== undefined) data.payoutPercent = parsed.data.payoutPercent;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone || null;
  if (parsed.data.specialistCode !== undefined) data.specialistCode = parsed.data.specialistCode;
  if (parsed.data.isVisible !== undefined) data.isVisible = parsed.data.isVisible;
  if (parsed.data.isAvailable !== undefined) data.isAvailable = parsed.data.isAvailable;
  if (parsed.data.avatarUrl !== undefined) data.avatarUrl = parsed.data.avatarUrl || null;
  if (parsed.data.jobTitle !== undefined) data.jobTitle = parsed.data.jobTitle || null;
  if (parsed.data.locationId !== undefined) {
    const assignedLocation = await prisma.location.findFirst({
      where: { id: parsed.data.locationId, isActive: true },
      select: { id: true, name: true },
    });
    if (!assignedLocation) {
      return NextResponse.json({ ok: false, message: "Wybierz prawidłową lokalizację" }, { status: 400 });
    }
    data.locationId = assignedLocation.id;
    data.location = assignedLocation.name;
  }
  if (parsed.data.specialization !== undefined) data.specialization = parsed.data.specialization || null;
  if (parsed.data.sourceProfileUrl !== undefined) data.sourceProfileUrl = parsed.data.sourceProfileUrl || null;
  if (parsed.data.password) {
    const passwordIssue = validatePassword(parsed.data.password, {
      login: before?.login,
      name: parsed.data.name ?? before?.name,
      email: before?.email,
    });
    if (passwordIssue) return NextResponse.json({ ok: false, message: passwordIssue }, { status: 400 });
    data.passwordHash = await bcrypt.hash(parsed.data.password, STAFF_BCRYPT_COST);
    // Hasło nadane innemu pracownikowi jest tymczasowe — zmieni je przy logowaniu.
    data.mustChangePassword = params.id !== user!.id;
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, login: true, name: true, role: true, email: true, payoutPercent: true, phone: true, specialistCode: true, isVisible: true, isAvailable: true, avatarUrl: true, jobTitle: true, location: true, locationId: true, assignedLocation: { select: { id: true, name: true } }, specialization: true },
  });

  // Nowa rola lub hasło unieważniają aktywne sesje tego pracownika
  // (przy zmianie własnego hasła zostaje bieżąca sesja administratora).
  const roleChanged = data.role !== undefined && data.role !== before?.role;
  if (roleChanged || data.passwordHash) {
    await revokeAllStaffSessions(
      params.id,
      roleChanged ? "role_change" : "password_set_by_admin",
      params.id === user!.id ? user!.sessionId : undefined,
    );
  }

  if (data.locationId) {
    await prisma.specialistWarehouse.deleteMany({
      where: {
        specialistId: params.id,
        warehouse: { locationId: { not: data.locationId } },
      },
    });
  }

  // Hasło i zdjęcie nie trafiają do dziennika — zapisujemy tylko fakt zmiany.
  const { passwordHash: _passwordHash, avatarUrl: _avatarUrl, location: _location, ...auditable } = data;
  const changes = before ? diffFields(before, auditable) : undefined;
  const parts = Object.entries(changes ?? {}).map(
    ([key, change]) => `${key}: ${change.from ?? "—"} → ${change.to ?? "—"}`,
  );
  if (data.passwordHash) parts.push("ustawiono nowe hasło");
  if (data.avatarUrl !== undefined) parts.push("zmieniono zdjęcie profilowe");
  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "User",
    entityId: updated.id,
    summary: `Zmiana konta pracownika „${updated.login}" (${updated.name}): ${parts.length ? parts.join("; ") : "bez zmian wartości"}`,
    data: {
      changes,
      passwordChanged: data.passwordHash ? true : undefined,
      avatarChanged: data.avatarUrl !== undefined ? true : undefined,
    },
  });

  return NextResponse.json({ ok: true, user: updated });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  if (params.id === user!.id) return NextResponse.json({ ok: false, message: "Nie możesz usunąć własnego konta." }, { status: 400 });
  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { login: true, name: true, role: true },
  });
  await prisma.user.delete({ where: { id: params.id } });
  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "User",
    entityId: params.id,
    summary: target
      ? `Trwałe usunięcie konta pracownika „${target.login}" (${target.name}, rola ${target.role})`
      : "Trwałe usunięcie konta pracownika",
    // Wpisy dziennika tego pracownika zostają (brak klucza obcego) — tu jego migawka.
    data: target ?? undefined,
  });

  return NextResponse.json({ ok: true });
}
