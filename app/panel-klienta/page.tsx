import Image from "next/image";
import { redirect } from "next/navigation";
import { getPatientAuth } from "@/lib/patient-auth";
import { prisma } from "@/lib/db";
import { LogoutButton } from "./LogoutButton";
import { PatientDashboardTabs } from "./PatientDashboardTabs";

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
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      startsAt: true,
      status: true,
      priceFinal: true,
      priceEstimate: true,
      customServiceName: true,
      service: { select: { name: true } },
      specialist: { select: { name: true } },
      location: { select: { name: true } },
    },
  });

  const now = new Date();
  const upcoming = appointments
    .filter((a) => a.startsAt.getTime() >= now.getTime() && a.status !== "CANCELED")
    .map((a) => ({ ...a, startsAt: a.startsAt.toISOString() }));
  const past = appointments
    .filter((a) => a.startsAt.getTime() < now.getTime() || a.status === "CANCELED")
    .map((a) => ({ ...a, startsAt: a.startsAt.toISOString() }));

  // Program punktowy — przelicznik naliczania punktów zostanie dodany później.
  // Na razie zawsze pokazujemy 0, żeby zakładka nie sugerowała nieistniejącego salda.
  const points = 0;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Image src="/derclinic-logo.webp" alt="DerClinic" width={140} height={35} />
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Witaj</div>
          <div className="mt-1 text-xl font-semibold text-zinc-900">{patient.name}</div>
          <div className="mt-1 text-sm text-zinc-500">
            {patient.phone ?? "—"} {patient.email ? `• ${patient.email}` : ""}
          </div>
        </div>

        <PatientDashboardTabs
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
      </main>
    </div>
  );
}
