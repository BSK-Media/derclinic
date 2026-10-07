"use client";

import * as React from "react";
import Image from "next/image";
import { ProcedureConsentPanel } from "@/components/procedure-consent-panel";

// Treść strony zgody na zabieg: nagłówek, podsumowanie wizyty i panel podpisu.
// Używana zarówno przez gościa (link z maila), jak i w panelu klienta.
export function ConsentContent({ token, withLogo = true }: { token: string; withLogo?: boolean }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {withLogo ? <Image src="/derclinic-logo.webp" alt="DerClinic" width={56} height={56} priority /> : null}
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Zgoda na zabieg</h1>
          <p className="text-sm text-zinc-500">Podpisz zgodę elektronicznie i wgraj ją do systemu.</p>
        </div>
      </div>
      <ConsentSummary token={token} />
      <ProcedureConsentPanel token={token} />
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
