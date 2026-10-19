"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { useConfirm } from "@/components/confirm-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// TYMCZASOWA strona: jednorazowy import historii z Booksy. Zostanie usunięta w kolejnym wdrożeniu.

type MappingRow = { booksy: string; count: number; to: string; kind: string; score: number };
type Result = {
  ok: boolean;
  message?: string;
  applied: { patientsDone: number; appointmentsDone: number; paymentsDone: number; archivalUsers: number } | null;
  summary: Record<string, unknown>;
  serviceMapping: MappingRow[];
  staffers: { name: string; count: number; archival: boolean }[];
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

  async function run(apply: boolean) {
    if (!clients || !appointments) return toast.error("Wybierz oba pliki: clients.csv i appointments.csv");
    if (apply) {
      const ok = await confirm({
        title: "Zapisać import do bazy?",
        message:
          "Zostaną dodani pacjenci i wizyty z Booksy (z płatnościami gotówką, zgodami marketingowymi i przyszłymi wizytami). Upewnij się, że masz kopię bazy w Neon. Import można bezpiecznie powtórzyć — nic się nie zdubluje.",
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
      if (apply) form.set("apply", "1");
      const response = await fetch("/api/admin/settings/booksy-import", { method: "POST", body: form });
      const out: Result = await response.json().catch(() => ({ ok: false, message: "Brak odpowiedzi serwera (możliwy limit czasu)" }) as Result);
      if (!response.ok || !out.ok) return toast.error(out.message || "Import nie powiódł się");
      setResult(out);
      if (apply) toast.success("Zapisano import");
      else setDryDone(true);
    } finally {
      setBusy(null);
    }
  }

  if (user && user.role !== "ADMIN") {
    return <div className="mx-auto max-w-3xl p-6 text-sm text-slate-500">Dostęp tylko dla administratora.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <Link href="/admin/settings" className="text-sm text-slate-500 hover:underline">← Ustawienia</Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Import historii z Booksy</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Jednorazowy, tymczasowy import klientów i wizyt. Najpierw uruchom próbę — niczego nie zapisuje, pokazuje tylko
          raport. Dopiero potem zapisz do bazy.
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
            {busy === "dry" ? "Liczę…" : "1. Próba (bez zapisu)"}
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
              {result.applied.paymentsDone}, konta archiwalne {result.applied.archivalUsers}.
            </Card>
          ) : null}

          <Card className="p-4">
            <div className="mb-2 font-semibold">Podsumowanie</div>
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(result.summary, null, 2)}</pre>
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

          <Card className="p-4">
            <div className="mb-2 font-semibold">Mapowanie usług (80 najczęstszych)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-3 font-medium">Usługa z Booksy</th>
                    <th className="py-1 pr-3 font-medium">Wizyty</th>
                    <th className="py-1 pr-3 font-medium">Usługa w aplikacji</th>
                    <th className="py-1 font-medium">Rodzaj</th>
                  </tr>
                </thead>
                <tbody>
                  {result.serviceMapping.map((row) => (
                    <tr key={row.booksy} className="border-t border-slate-200 dark:border-white/10">
                      <td className="py-1 pr-3">{row.booksy}</td>
                      <td className="py-1 pr-3">{row.count}</td>
                      <td className="py-1 pr-3">{row.to}</td>
                      <td className="py-1">{row.kind === "exact" ? "dokładne" : row.kind === "similar" ? "podobne" : "zastępcza"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
