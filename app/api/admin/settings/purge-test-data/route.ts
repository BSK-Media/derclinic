import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

// JEDNORAZOWE czyszczenie danych testowych — do usunięcia w następnym commicie.
// Kasuje WSZYSTKICH pacjentów i WSZYSTKIE wizyty (wraz z danymi zależnymi: zdjęcia, zgody,
// płatności za wizyty itd. — kaskadowo). Tylko administrator.

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const [patients, appointments] = await Promise.all([prisma.patient.count(), prisma.appointment.count()]);
  return NextResponse.json({ ok: true, patients, appointments });
}

const Body = z.object({ confirm: z.literal("USUŃ") });

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  if (!Body.safeParse(await req.json().catch(() => null)).success) {
    return NextResponse.json({ ok: false, message: "Brak potwierdzenia" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const appointments = await tx.appointment.deleteMany({});
    const patients = await tx.patient.deleteMany({});
    return { appointments: appointments.count, patients: patients.count };
  });

  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "Patient",
    entityId: "all",
    summary: `Jednorazowe usunięcie danych testowych: pacjenci ${result.patients}, wizyty ${result.appointments}`,
  });

  return NextResponse.json({ ok: true, ...result });
}
