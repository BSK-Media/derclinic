const CONSENT_LABELS: Record<string, string> = {
  RODO: "RODO",
  MARKETING: "Komunikacja marketingowa",
};

function formatDate(date: Date) {
  return date.toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ConsentState = { type: string; granted: boolean; grantedAt: Date | null; revokedAt: Date | null };
type ConsentEvent = { id: string; type: string; granted: boolean; createdAt: Date };

function StatusBadge({ granted }: { granted: boolean }) {
  return granted ? (
    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
      Aktywna
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      Wycofana / brak
    </span>
  );
}

// Zgoda na wizerunek NIE jest tu pokazywana — jest wyrażana osobno przy
// każdej wizycie (patrz Appointment.imageConsent) i widoczna w karcie danej
// wizyty, nie ma sensownego "bieżącego stanu" na poziomie całego pacjenta.
export function PatientConsents({ state, events }: { state: ConsentState[]; events: ConsentEvent[] }) {
  return (
    <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
      <div className="border-b p-4">
        <div className="font-medium">Zgody</div>
        <div className="text-xs text-zinc-500">RODO i komunikacja marketingowa — pełna historia zmian poniżej.</div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {(["RODO", "MARKETING"] as const).map((type) => {
          const row = state.find((s) => s.type === type);
          const granted = row?.granted ?? false;
          return (
            <div key={type} className="rounded-xl border p-3 dark:bg-zinc-950">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{CONSENT_LABELS[type]}</span>
                <StatusBadge granted={granted} />
              </div>
              {granted && row?.grantedAt ? (
                <div className="text-xs text-zinc-500">Wyrażona: {formatDate(row.grantedAt)}</div>
              ) : !granted && row?.revokedAt ? (
                <div className="text-xs text-zinc-500">Wycofana: {formatDate(row.revokedAt)}</div>
              ) : (
                <div className="text-xs text-zinc-400">Pacjent jeszcze nie podjął decyzji.</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Historia</div>
        {events.length === 0 ? (
          <div className="text-sm text-zinc-500">Brak historii zmian zgód.</div>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3">
                <span className="text-zinc-700 dark:text-zinc-300">
                  {CONSENT_LABELS[event.type] ?? event.type} —{" "}
                  <span className={event.granted ? "font-medium text-emerald-700" : "font-medium text-red-600"}>
                    {event.granted ? "wyrażona" : "wycofana"}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-zinc-400">{formatDate(event.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
