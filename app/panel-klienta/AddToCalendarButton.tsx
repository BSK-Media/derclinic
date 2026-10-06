"use client";

import * as React from "react";
import { CalendarPlus } from "lucide-react";

// Android: Google Kalendarz (link otwiera aplikację). iPhone, komputery i
// reszta: plik .ics — Safari na iPhonie od razu pokazuje „Dodaj do kalendarza".
// Przed hydracją (i bez JS) działa wariant .ics.
export function AddToCalendarButton({ appointmentId, className }: { appointmentId: string; className?: string }) {
  const [android, setAndroid] = React.useState(false);
  React.useEffect(() => {
    setAndroid(/android/i.test(navigator.userAgent));
  }, []);

  const base = `/api/patient/appointments/${appointmentId}/calendar`;
  return (
    <a
      href={android ? `${base}?format=google` : base}
      {...(android ? { target: "_blank", rel: "noopener" } : {})}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
      }
    >
      <CalendarPlus className="h-3.5 w-3.5" /> Dodaj do kalendarza
    </a>
  );
}
