import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPatientAuth } from "@/lib/patient-auth";
import { prisma } from "@/lib/db";
import { PatientPageShell } from "@/app/panel-klienta/PatientPageShell";
import { ConsentContent } from "./ConsentContent";

export const dynamic = "force-dynamic";

// Strona zgody na zabieg otwierana z linku (potwierdzenie rezerwacji, mail,
// powiadomienie push, panel klienta). Token w adresie wskazuje wizytę —
// dzięki temu zgodę może złożyć także gość bez konta. Zalogowany pacjent
// widzi ją w układzie panelu klienta (nagłówek, menu, powrót).
export default async function ConsentPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const token = decodeURIComponent(String(params.token ?? ""));

  const auth = await getPatientAuth();
  const [patient, upcomingCount] = auth
    ? await Promise.all([
        prisma.patient.findUnique({ where: { id: auth.id }, select: { name: true } }),
        prisma.appointment.count({
          where: { patientId: auth.id, deletedAt: null, status: { not: "CANCELED" }, startsAt: { gte: new Date() } },
        }),
      ])
    : [null, 0];

  if (patient) {
    return (
      <div data-light-only className="contents">
      <PatientPageShell patientName={patient.name} upcomingCount={upcomingCount}>
        <Link
          href="/panel-klienta?tab=upcoming"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" /> Wróć do panelu
        </Link>
        <div className="max-w-xl">
          <ConsentContent token={token} withLogo={false} />
        </div>
      </PatientPageShell>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <div className="mx-auto max-w-xl py-6">
        <ConsentContent token={token} />
      </div>
    </div>
  );
}
