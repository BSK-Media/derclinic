import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit, diffFields } from "@/lib/audit";

const PatchSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["ADMIN", "RECEPTION", "SPECIALIST"]).optional(),
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
  password: z.string().min(4).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

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
  if (parsed.data.password) data.passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const updated = await prisma.user.update({
    where: { id: params.id },
    data,
    select: { id: true, login: true, name: true, role: true, email: true, payoutPercent: true, phone: true, specialistCode: true, isVisible: true, isAvailable: true, avatarUrl: true, jobTitle: true, location: true, locationId: true, assignedLocation: { select: { id: true, name: true } }, specialization: true },
  });

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

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  if (params.id === user!.id) return NextResponse.json({ ok: false, message: "Nie możesz usunąć własnego konta." }, { status: 400 });

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
