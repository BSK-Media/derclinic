"use client";

import * as React from "react";
import { CalendarPlus } from "lucide-react";

// iPhone i iPad: plik .ics — Safari od razu pokazuje „Dodaj do kalendarza"
// (natywny Kalendarz). Wszędzie indziej (Android, komputery): od razu Google
// Kalendarz z wypełnionym wydarzeniem; plik .ics zostaje jako drugi link dla
// Outlooka i kalendarza Apple. Przed hydracją (i bez JS) działa wariant .ics.
function isApple() {
  const ua = navigator.userAgent;
  // iPadOS 13+ podaje się za Macintosh, ale ma ekran dotykowy.
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

export function AddToCalendarButton({ appointmentId, className }: { appointmentId: string; className?: string }) {
  const [google, setGoogle] = React.useState(false);
  React.useEffect(() => {
    setGoogle(!isApple());
  }, []);

  const base = `/api/patient/appointments/${appointmentId}/calendar`;
  const buttonClass =
    className ??
    "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50";

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <a
        href={google ? `${base}?format=google` : base}
        {...(google ? { target: "_blank", rel: "noopener" } : {})}
        className={buttonClass}
      >
        <CalendarPlus className="h-3.5 w-3.5" /> {google ? "Dodaj do Kalendarza Google" : "Dodaj do kalendarza"}
      </a>
      {google ? (
        <a href={base} className="text-[11px] text-zinc-400 underline-offset-2 hover:underline">
          plik .ics
        </a>
      ) : null}
    </span>
  );
}
