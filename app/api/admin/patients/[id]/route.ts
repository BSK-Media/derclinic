import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit, diffFields } from "@/lib/audit";

const PatchSchema = z.object({
  name: z.string().trim().min(2, "Podaj imię i nazwisko").max(100).optional(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .email("Podaj poprawny adres e-mail")
    .max(200)
    .optional()
    .or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
  // Ręczne ustawienie hasła do panelu klienta przez recepcję/admina — np. gdy
  // wysyłka maili resetujących nie działa. Nigdy nie zwracamy hasha w
  // odpowiedzi (patrz `select` przy update poniżej).
  password: z.string().min(6, "Hasło musi mieć co najmniej 6 znaków").max(200).optional(),
});

const PATIENT_SAFE_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  note: true,
} as const;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const visiblePatient = await prisma.patient.findFirst({
    where: { id: params.id, ...scopedLocationWhere(user!) },
    select: { id: true, name: true, phone: true, email: true, note: true },
  });
  if (!visiblePatient) return NextResponse.json({ ok: false, message: "Nie znaleziono pacjenta" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" },
      { status: 400 },
    );
  }

  const updated = await prisma.patient.update({
    where: { id: params.id },
    data: {
      name: parsed.data.name,
      phone:
        parsed.data.phone === undefined ? undefined : parsed.data.phone ? parsed.data.phone : null,
      email:
        parsed.data.email === undefined ? undefined : parsed.data.email ? parsed.data.email : null,
      note: parsed.data.note === undefined ? undefined : parsed.data.note ? parsed.data.note : null,
      ...(parsed.data.password
        ? {
            passwordHash: await bcrypt.hash(parsed.data.password, 10),
            // Ręczne ustawienie hasła unieważnia ewentualny wcześniej wysłany link do resetu.
            passwordResetTokenHash: null,
            passwordResetExpiresAt: null,
          }
        : {}),
    },
    select: PATIENT_SAFE_SELECT,
  });

  const changes = diffFields(
    { name: visiblePatient.name, phone: visiblePatient.phone, email: visiblePatient.email, note: visiblePatient.note },
    { name: updated.name, phone: updated.phone, email: updated.email, note: updated.note },
  );
  const fieldLabels: Record<string, string> = { name: "imię i nazwisko", phone: "telefon", email: "e-mail" };
  const parts = Object.entries(changes ?? {}).map(([key, change]) =>
    key === "note" ? "zmieniono notatkę" : `${fieldLabels[key]}: ${change.from ?? "—"} → ${change.to ?? "—"}`,
  );
  if (parsed.data.password) parts.push("ustawiono nowe hasło do panelu klienta");
  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "Patient",
    entityId: updated.id,
    summary: `Zmiana danych pacjenta ${visiblePatient.name}: ${parts.length ? parts.join("; ") : "bez zmian wartości"}`,
    // hasła nigdy nie trafiają do dziennika — zapisujemy tylko fakt zmiany
    data: { changes, passwordChanged: parsed.data.password ? true : undefined },
  });

  return NextResponse.json({ ok: true, patient: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const visiblePatient = await prisma.patient.findFirst({
    where: { id: params.id, ...scopedLocationWhere(user!) },
    select: { id: true, name: true, phone: true, email: true },
  });
  if (!visiblePatient) return NextResponse.json({ ok: false, message: "Nie znaleziono pacjenta" }, { status: 404 });

  // Usunięcie pacjenta kasuje kaskadowo jego wizyty — zapisujemy ich liczbę
  // razem z migawką danych, bo po usunięciu nie da się tego odtworzyć.
  const appointmentsDeleted = await prisma.appointment.count({ where: { patientId: params.id } });
  await prisma.patient.delete({ where: { id: params.id } });
  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "Patient",
    entityId: params.id,
    summary: `Trwałe usunięcie pacjenta ${visiblePatient.name}${visiblePatient.phone ? ` (${visiblePatient.phone})` : ""} wraz z wizytami (${appointmentsDeleted})`,
    data: {
      name: visiblePatient.name,
      phone: visiblePatient.phone,
      email: visiblePatient.email,
      appointmentsDeleted,
    },
  });

  return NextResponse.json({ ok: true });
}
