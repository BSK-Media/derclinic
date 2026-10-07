"use client";

import * as React from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { ProcedureConsentPanel } from "@/components/procedure-consent-panel";

// Strona zgody na zabieg otwierana z linku (potwierdzenie rezerwacji, mail,
// powiadomienie push, panel klienta). Token w adresie wskazuje wizytę —
// dzięki temu zgodę może złożyć także gość bez konta.
export default function ConsentPage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(String(params?.token ?? ""));

  return (
    <div className="min-h-screen bg-zinc-50 p-4">
      <div className="mx-auto max-w-xl space-y-5 py-6">
        <div className="flex items-center gap-3">
          <Image src="/derclinic-logo.webp" alt="DerClinic" width={56} height={56} priority />
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Zgoda na zabieg</h1>
            <p className="text-sm text-zinc-500">Podpisz zgodę elektronicznie i wgraj ją do systemu.</p>
          </div>
        </div>
        <ConsentSummary token={token} />
        <ProcedureConsentPanel token={token} />
      </div>
    </div>
  );
}

function ConsentSummary({ token }: { token: string }) {
  const [info, setInfo] = React.useState<{ serviceName: string; specialistName: string; startsAt: string } | null>(null);
  React.useEffect(() => {
    fetch(`/api/consent/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => data?.ok && setInfo(data.appointment))
      .catch(() => null);
  }, [token]);
  if (!info) return null;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm">
      <div className="font-semibold text-zinc-900">{info.serviceName}</div>
      <div className="text-zinc-500">
        {info.specialistName} ·{" "}
        {new Date(info.startsAt).toLocaleString("pl-PL", {
          timeZone: "Europe/Warsaw",
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}
