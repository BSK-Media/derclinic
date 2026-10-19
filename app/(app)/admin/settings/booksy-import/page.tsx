"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { useConfirm } from "@/components/confirm-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// TYMCZASOWA strona: jednorazowy import historii z Booksy. Zostanie usunięta w kolejnym wdrożeniu.

const ARCHIVE = "ARCHIVE";

type MappingRow = {
  booksy: string;
  count: number;
  kind: "exact" | "similar" | "none";
  suggestedId: string | null;
  suggestedName: string | null;
  selected: string;
};
type SegmentRow = { segment: string; label: string; count: number };
type Result = {
  ok: boolean;
  message?: string;
  applied: {
    patientsDone: number;
    appointmentsDone: number;
    paymentsDone: number;
    archivalUsers: number;
    archivalServices: number;
  } | null;
  summary: Record<string, unknown>;
  serviceMapping: MappingRow[];
  services: { id: string; name: string }[];
  staffers: { name: string; count: number; archival: boolean }[];
  segmentsPreview: SegmentRow[];
  segmentsAfter: SegmentRow[] | null;
};

async function gzip(file: File): Promise<Blob> {
  const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

export default function BooksyImportPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [clients, setClients] = React.useState<File | null>(null);
  const [appointments, setAppointments] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState<null | "dry" | "apply">(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const [dryDone, setDryDone] = React.useState(false);
  // Nasze wybory: nazwa z Booksy -> id usługi albo ARCHIVE. Brak wpisu = ustawienie domyślne.
  const [decisions, setDecisions] = React.useState<Record<string, string>>({});
  const [tab, setTab] = React.useState<"similar" | "none" | "exact">("similar");

  async function run(apply: boolean) {
    if (!clients || !appointments) return toast.error("Wybierz oba pliki: clients.csv i appointments.csv");
    if (apply) {
      const ok = await confirm({
        title: "Zapisać import do bazy?",
        message:
          "Zostaną dodani pacjenci i wizyty z Booksy (z płatnościami gotówką, zgodami marketingowymi i przyszłymi wizytami) oraz usługi archiwalne. Upewnij się, że masz kopię bazy w Neon. Import można bezpiecznie powtórzyć — nic się nie zdubluje.",
        confirmLabel: "Zapisz do bazy",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(apply ? "apply" : "dry");
    try {
      const form = new FormData();
      form.set("clients", await gzip(clients), "clients.csv.gz");
      form.set("appointments", await gzip(appointments), "appointments.csv.gz");
      form.set("decisions", JSON.stringify(decisions));
      if (apply) form.set("apply", "1");
      const response = await fetch("/api/admin/settings/booksy-import", { method: "POST", body: form });
      const out: Result = await response
        .json()
        .catch(() => ({ ok: false, message: "Brak odpowiedzi serwera (możliwy limit czasu)" }) as Result);
      if (!response.ok || !out.ok) return toast.error(out.message || "Import nie powiódł się");
      setResult(out);
      if (apply) toast.success("Zapisano import");
      else setDryDone(true);
    } finally {
      setBusy(null);
    }
  }

  function choose(booksy: string, value: string) {
    setDecisions((current) => ({ ...current, [booksy]: value }));
  }

  function bulk(kind: "similar" | "none", value: "ARCHIVE" | "SUGGESTED") {
    if (!result) return;
    setDecisions((current) => {
      const next = { ...current };
      for (const row of result.serviceMapping) {
        if (row.kind !== kind) continue;
        if (value === "ARCHIVE") next[row.booksy] = ARCHIVE;
        else if (row.suggestedId) next[row.booksy] = row.suggestedId;
      }
      return next;
    });
  }

  if (user && user.role !== "ADMIN") {
    return <div className="mx-auto max-w-3xl p-6 text-sm text-slate-500">Dostęp tylko dla administratora.</div>;
  }

  const rows = (result?.serviceMapping ?? []).filter((row) => row.kind === tab);
  const counts = {
    similar: (result?.serviceMapping ?? []).filter((r) => r.kind === "similar").length,
    none: (result?.serviceMapping ?? []).filter((r) => r.kind === "none").length,
    exact: (result?.serviceMapping ?? []).filter((r) => r.kind === "exact").length,
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <Link href="/admin/settings" className="text-sm text-slate-500 hover:underline">← Ustawienia</Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Import historii z Booksy</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Jednorazowy, tymczasowy import klientów i wizyt. Najpierw uruchom próbę — niczego nie zapisuje. Potem sprawdź
          mapowanie usług i zapisz do bazy.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">
            clients.csv
            <input type="file" accept=".csv" onChange={(e) => setClients(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
          </label>
          <label className="space-y-1 text-sm font-medium">
            appointments.csv
            <input type="file" accept=".csv" onChange={(e) => setAppointments(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => run(false)} disabled={busy !== null}>
            {busy === "dry" ? "Liczę…" : dryDone ? "Przelicz próbę ponownie" : "1. Próba (bez zapisu)"}
          </Button>
          <Button onClick={() => run(true)} disabled={busy !== null || !dryDone}>
            {busy === "apply" ? "Zapisuję… (to potrwa kilka minut)" : "2. Zapisz do bazy"}
          </Button>
        </div>
        {!dryDone ? <p className="text-xs text-slate-500">Zapis odblokuje się po udanej próbie.</p> : null}
      </Card>

      {result ? (
        <>
          {result.applied ? (
            <Card className="border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
              <strong>Zapisano:</strong> pacjenci {result.applied.patientsDone}, wizyty {result.applied.appointmentsDone}, płatności{" "}
              {result.applied.paymentsDone}, usługi archiwalne {result.applied.archivalServices}, konta archiwalne{" "}
              {result.applied.archivalUsers}. Segmenty RFM i listy newslettera zostały przeliczone.
            </Card>
          ) : null}

          <Card className="p-4">
            <div className="mb-2 font-semibold">Podsumowanie</div>
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(result.summary, null, 2)}</pre>
          </Card>

          <Card className="p-4">
            <div className="mb-1 font-semibold">
              {result.segmentsAfter ? "Segmenty pacjentów w całym systemie (po imporcie)" : "Podgląd segmentów pacjentów z importu"}
            </div>
            <p className="mb-2 text-xs text-slate-500">
              {result.segmentsAfter
                ? "Zaimportowani pacjenci trafili do segmentów RFM i na automatyczne listy newslettera."
                : "Wyliczone tylko z historii z Booksy według bieżących ustawień RFM. Po zapisie segmenty trafią automatycznie na listy newslettera („RFM ·”) i do filtrów pacjentów."}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(result.segmentsAfter ?? result.segmentsPreview).map((s) => (
                <div key={s.segment} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                  <div className="text-xs text-slate-500">{s.label}</div>
                  <div className="text-xl font-semibold">{s.count}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-2 font-semibold">Specjaliści</div>
            <table className="w-full text-sm">
              <tbody>
                {result.staffers.map((s) => (
                  <tr key={s.name} className="border-t border-slate-200 dark:border-white/10">
                    <td className="py-1 pr-3">{s.name}</td>
                    <td className="py-1 pr-3 text-right">{s.count}</td>
                    <td className="py-1 text-xs text-slate-500">{s.archival ? "nowe konto archiwalne (wyłączone)" : "istniejące konto"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="space-y-3 p-4">
            <div>
              <div className="font-semibold">Mapowanie usług</div>
              <p className="text-xs text-slate-500">
                Dokładne nazwy trafiają na usługi aplikacji. Dla podobnych wybierz właściwą usługę z listy albo utwórz usługę
                archiwalną (widoczną tylko w historii wizyt, niedostępną w rezerwacjach). Usługi bez odpowiednika domyślnie
                stają się archiwalne. Po zmianie wyborów kliknij „Przelicz próbę ponownie”, żeby odświeżyć liczby.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["similar", `Podobne (${counts.similar})`],
                  ["none", `Bez odpowiednika (${counts.none})`],
                  ["exact", `Dokładne (${counts.exact})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={
                    "rounded-full border px-3 py-1.5 text-sm font-medium " +
                    (tab === key ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200")
                  }
                >
                  {label}
                </button>
              ))}
              {tab === "similar" ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => bulk("similar", "SUGGESTED")}>Wszystkie → sugerowana</Button>
                  <Button variant="outline" size="sm" onClick={() => bulk("similar", "ARCHIVE")}>Wszystkie → archiwalna</Button>
                </>
              ) : null}
              {tab === "none" ? (
                <Button variant="outline" size="sm" onClick={() => bulk("none", "ARCHIVE")}>Wszystkie → archiwalna</Button>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-3 font-medium">Usługa z Booksy</th>
                    <th className="py-1 pr-3 font-medium">Wizyty</th>
                    <th className="py-1 font-medium">{tab === "exact" ? "Usługa w aplikacji" : "Co z nią zrobić"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const value = decisions[row.booksy] ?? row.selected;
                    return (
                      <tr key={row.booksy} className="border-t border-slate-200 align-top dark:border-white/10">
                        <td className="py-1.5 pr-3">{row.booksy}</td>
                        <td className="py-1.5 pr-3">{row.count}</td>
                        <td className="py-1.5">
                          {tab === "exact" ? (
                            row.suggestedName
                          ) : (
                            <select
                              value={value}
                              onChange={(e) => choose(row.booksy, e.target.value)}
                              className="w-full max-w-md rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-white/15 dark:bg-[#0b1220]"
                            >
                              <option value={ARCHIVE}>➕ Utwórz jako usługę archiwalną</option>
                              {row.suggestedId ? (
                                <option value={row.suggestedId}>Sugerowana: {row.suggestedName}</option>
                              ) : null}
                              <optgroup label="Wybierz inną usługę z systemu">
                                {result.services.map((service) => (
                                  <option key={service.id} value={service.id}>
                                    {service.name}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-3 text-slate-500">Brak pozycji.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
