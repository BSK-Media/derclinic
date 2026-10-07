"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// TYMCZASOWE — usunąć po jednorazowym czyszczeniu danych testowych (lib/reset-test-data.ts).

type Row = { label: string; count: number };
type Preview = { ok: boolean; phrase: string; toDelete: Row[]; kept: Row[] };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

export function ResetTestDataCard() {
  const { data, mutate } = useSWR<Preview>("/api/admin/dev/reset-test-data", fetcher);
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [working, setWorking] = React.useState(false);

  async function run() {
    if (!data) return;
    setWorking(true);
    try {
      const response = await fetch("/api/admin/dev/reset-test-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: typed }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) return toast.error(result?.message || "Nie udało się usunąć danych");
      toast.success("Dane testowe zostały usunięte");
      setOpen(false);
      setTyped("");
      await mutate();
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="rounded-3xl border border-red-200 bg-red-50/60 p-6 shadow-sm dark:border-red-500/30 dark:bg-red-500/5">
      <h2 className="text-lg font-semibold text-red-900 dark:text-red-200">Usuń dane testowe (jednorazowo)</h2>
      <p className="mt-1 text-sm text-red-900/80 dark:text-red-200/80">
        Przed oddaniem aplikacji: usuwa wizyty, pacjentów i produkty wraz ze wszystkim, co z nimi związane. Konta
        pracowników, zabiegi, lokalizacje i magazyny zostają. Operacji nie można cofnąć — zrób wcześniej kopię bazy.
      </p>
      <Button variant="destructive" className="mt-4" onClick={() => setOpen(true)} disabled={!data?.ok}>
        Usuń dane testowe…
      </Button>

      <Dialog open={open} onOpenChange={(value) => !working && setOpen(value)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Na pewno usunąć dane testowe?</DialogTitle>
          </DialogHeader>
          {data?.ok ? (
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <div className="mb-1 font-semibold text-red-700">Zostanie usunięte</div>
                <ul className="space-y-0.5">
                  {data.toDelete.map((row) => (
                    <li key={row.label} className="flex justify-between gap-2">
                      <span>{row.label}</span>
                      <span className="tabular-nums font-medium">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 font-semibold text-emerald-700">Zostaje</div>
                <ul className="space-y-0.5">
                  {data.kept.map((row) => (
                    <li key={row.label} className="flex justify-between gap-2">
                      <span>{row.label}</span>
                      <span className="tabular-nums font-medium">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <label className="text-sm" htmlFor="reset-phrase">
              Aby potwierdzić, wpisz: <strong>{data?.phrase}</strong>
            </label>
            <Input id="reset-phrase" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={working}>
              Anuluj
            </Button>
            <Button variant="destructive" onClick={run} disabled={working || typed !== data?.phrase}>
              {working ? "Usuwanie…" : "Usuń na zawsze"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
