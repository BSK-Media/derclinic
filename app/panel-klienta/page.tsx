import { redirect } from "next/navigation";
import { consentToken } from "@/lib/consent-link";
import { getPatientAuth } from "@/lib/patient-auth";
import { prisma } from "@/lib/db";
import { PatientDashboard } from "./PatientDashboard";

export const dynamic = "force-dynamic";

const VALID_TABS = ["home", "upcoming", "history", "profile", "points", "consents"] as const;

function formatMemberSince(date: Date) {
  return date.toLocaleDateString("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function PatientDashboardPage(
  props: {
    searchParams: Promise<{ tab?: string; google?: string; facebook?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const auth = await getPatientAuth();
  if (!auth) redirect("/panel-klienta/logowanie");

  const [patient, appointments, loyaltyTransactions] = await Promise.all([
    prisma.patient.findUnique({
      where: { id: auth.id },
      select: {
        name: true,
        phone: true,
        email: true,
        createdAt: true,
        loyaltyPoints: true,
        googleSub: true,
        facebookId: true,
        passwordHash: true,
        location: { select: { name: true } },
      },
    }),
    prisma.appointment.findMany({
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
        consentStatus: true,
        consentForfeitedAt: true,
        service: { select: { name: true } },
        specialist: { select: { name: true } },
        location: { select: { name: true } },
        payments: { select: { amount: true } },
      },
    }),
    prisma.loyaltyPointsTransaction.findMany({
      where: { patientId: auth.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        createdAt: true,
        type: true,
        points: true,
        note: true,
        appointment: {
          select: { customServiceName: true, service: { select: { name: true } } },
        },
      },
    }),
  ]);
  if (!patient) redirect("/panel-klienta/logowanie");

  const now = new Date();
  // Rosnąco — najbliższa wizyta jest pierwsza na liście "nadchodzące".
  const upcoming = appointments
    .filter((a) => a.startsAt.getTime() >= now.getTime() && a.status !== "CANCELED")
    .map(({ consentForfeitedAt, ...a }) => ({
      ...a,
      startsAt: a.startsAt.toISOString(),
      consentForfeited: Boolean(consentForfeitedAt),
      consentToken: consentToken(a.id),
    }));
  // Malejąco — w historii najpierw najświeższa wizyta.
  const past = appointments
    .filter((a) => a.startsAt.getTime() < now.getTime() || a.status === "CANCELED")
    .map(({ consentForfeitedAt, ...a }) => ({
      ...a,
      startsAt: a.startsAt.toISOString(),
      consentForfeited: Boolean(consentForfeitedAt),
      consentToken: consentToken(a.id),
    }))
    .reverse();

  // Program punktowy: 1 pkt za każde wydane 10 zł, 1 pkt = 1 zł rabatu.
  // Saldo trzymane na Patient.loyaltyPoints, pełna historia w
  // LoyaltyPointsTransaction (patrz lib/loyalty.ts).
  const points = patient.loyaltyPoints;
  const loyaltyHistory = loyaltyTransactions.map((t) => ({
    id: t.id,
    createdAt: t.createdAt.toISOString(),
    type: t.type,
    points: t.points,
    note: t.note,
    serviceName: t.appointment?.customServiceName || t.appointment?.service?.name || null,
  }));

  return (
    <PatientDashboard
      initialTab={
        VALID_TABS.includes(searchParams?.tab as (typeof VALID_TABS)[number])
          ? (searchParams!.tab as (typeof VALID_TABS)[number])
          : "home"
      }
      profile={{
        name: patient.name,
        phone: patient.phone,
        email: patient.email,
        locationName: patient.location?.name ?? null,
        memberSince: formatMemberSince(patient.createdAt),
        googleLinked: Boolean(patient.googleSub),
        facebookLinked: Boolean(patient.facebookId),
        hasPassword: Boolean(patient.passwordHash),
      }}
      googleError={typeof searchParams?.google === "string" ? searchParams.google : null}
      facebookError={typeof searchParams?.facebook === "string" ? searchParams.facebook : null}
      upcoming={upcoming}
      past={past}
      points={points}
      loyaltyHistory={loyaltyHistory}
    />
  );
}
