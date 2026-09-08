import { redirect } from "next/navigation";
import { getPatientAuth } from "@/lib/patient-auth";
import { prisma } from "@/lib/db";
import { PatientDashboard } from "./PatientDashboard";

export const dynamic = "force-dynamic";

function formatMemberSince(date: Date) {
  return date.toLocaleDateString("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function PatientDashboardPage() {
  const auth = await getPatientAuth();
  if (!auth) redirect("/panel-klienta/logowanie");

  const patient = await prisma.patient.findUnique({
    where: { id: auth.id },
    select: {
      name: true,
      phone: true,
      email: true,
      createdAt: true,
      location: { select: { name: true } },
    },
  });
  if (!patient) redirect("/panel-klienta/logowanie");

  const appointments = await prisma.appointment.findMany({
    where: { patientId: auth.id, deletedAt: null },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      status: true,
      priceFinal: true,
      priceEstimate: true,
      customServiceName: true,
      serviceId: true,
      specialistId: true,
      service: { select: { name: true } },
      specialist: { select: { name: true } },
      location: { select: { name: true } },
    },
  });

  const now = new Date();
  // Rosnąco — najbliższa wizyta jest pierwsza na liście "nadchodzące".
  const upcoming = appointments
    .filter((a) => a.startsAt.getTime() >= now.getTime() && a.status !== "CANCELED")
    .map((a) => ({ ...a, startsAt: a.startsAt.toISOString() }));
  // Malejąco — w historii najpierw najświeższa wizyta.
  const past = appointments
    .filter((a) => a.startsAt.getTime() < now.getTime() || a.status === "CANCELED")
    .map((a) => ({ ...a, startsAt: a.startsAt.toISOString() }))
    .reverse();

  // Program punktowy — przelicznik naliczania punktów zostanie dodany później.
  // Na razie zawsze pokazujemy 0, żeby ekran nie sugerował nieistniejącego salda.
  const points = 0;

  return (
    <PatientDashboard
      profile={{
        name: patient.name,
        phone: patient.phone,
        email: patient.email,
        locationName: patient.location?.name ?? null,
        memberSince: formatMemberSince(patient.createdAt),
      }}
      upcoming={upcoming}
      past={past}
      points={points}
    />
  );
}
