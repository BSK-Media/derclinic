"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowLeft, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RejectReasonDialog } from "@/components/appointment-approval";
import { useConfirm } from "@/components/confirm-provider";
import { formatPLNFromGrosze } from "@/lib/money";

type Row = {
  id: string;
  createdAt: string;
  claimedAt: string | null;
  decidedAt: string | null;
  status: "AWAITING" | "CLAIMED" | "CONFIRMED" | "REJECTED";
  amount: number;
  choice: string;
  method: "BLIK" | "TRANSFER" | "P24" | null;
  reference: string;
  rejectionReason: string | null;
  decidedBy: { name: string } | null;
  appointment: { id: string; startsAt: string; status: string; serviceName: string };
  patient: { id: string; name: string; phone: string | null };
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

const METHOD_LABELS: Record<string, string> = { BLIK: "BLIK na telefon", TRANSFER: "Przelew tradycyjny", P24: "Przelewy24" };

const STATUS_BADGES: Record<Row["status"], { label: string; className: string }> = {
  AWAITING: { label: "Czeka na płatność klienta", className: "bg-zinc-100 text-zinc-700" },
  CLAIMED: { label: "Do potwierdzenia", className: "bg-amber-100 text-amber-800" },
  CONFIRMED: { label: "Potwierdzona", className: "bg-green-100 text-green-800" },
  REJECTED: { label: "Odrzucona", className: "bg-red-100 text-red-800" },
};

type Filter = "CLAIMED" | "AWAITING" | "ALL";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
}

// Płatności zamówione przy rezerwacji online (BLIK / przelew tradycyjny).
// Klient zgłasza „Dokonałem płatności", a administrator — gdy zobaczy wpłatę na
// koncie (po TYTULE płatności, ten sam kod widzi klient) — ją potwierdza.
export default function PaymentsPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/payment-requests", fetcher);
  const requests: Row[] = data?.requests ?? [];
  const canDecide: boolean = data?.canDecide ?? false;
  const confirm = useConfirm();

  const [filter, setFilter] = React.useState<Filter>("CLAIMED");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<Row | null>(null);

  const claimedCount = requests.filter((r) => r.status === "CLAIMED").length;
  const awaitingCount = requests.filter((r) => r.status === "AWAITING").length;
  const visible = filter === "ALL" ? requests : requests.filter((r) => r.status === filter);

  async function decide(row: Row, action: "APPROVE" | "REJECT", reason?: string) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/payment-requests/${row.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać decyzji");
      toast.success(action === "APPROVE" ? "Wpłata potwierdzona — klient dostał powiadomienie" : "Płatność odrzucona");
      await mutate();
    } finally {
      setBusyId(null);
    }
  }

  async function approve(row: Row) {
    const ok = await confirm({
      title: "Potwierdzić wpłatę?",
      message: `Potwierdź tylko, jeśli ${formatPLNFromGrosze(row.amount)} z tytułem ${row.reference} jest już na koncie / telefonie kliniki.\n\nPo potwierdzeniu płatność trafi do wizyty ${row.patient.name} jako opłacona.`,
      confirmLabel: "Potwierdzam wpłatę",
    });
    if (ok) await decide(row, "APPROVE");
  }

  const filterButton = (value: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={
        "rounded-full border px-3.5 py-2 text-sm font-medium " +
        (filter === value
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
          : "bg-white text-zinc-600 dark:bg-[#0b1220] dark:text-zinc-300")
      }
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/visits"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" /> Wróć do wizyt
        </Link>
        <h1 className="text-2xl font-semibold">Płatności za rezerwacje online</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Klienci płacą BLIK-iem na telefon albo przelewem i zgłaszają wpłatę. Znajdź ją na koncie po{" "}
          <strong>tytule płatności</strong> (kod DC-…) i potwierdź. {canDecide ? "" : "Potwierdzać mogą administrator i manager."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterButton("CLAIMED", `Do potwierdzenia${claimedCount ? ` (${claimedCount})` : ""}`)}
        {filterButton("AWAITING", `Czeka na klienta${awaitingCount ? ` (${awaitingCount})` : ""}`)}
        {filterButton("ALL", "Wszystkie")}
      </div>

      {isLoading ? <Card className="p-5 text-center text-sm text-zinc-500">Ładowanie…</Card> : null}
      {!isLoading && visible.length === 0 ? (
        <Card className="p-5 text-center text-sm text-zinc-500">Brak płatności w tym widoku.</Card>
      ) : null}

      <div className="space-y-3">
        {visible.map((row) => (
          <Card key={row.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link href={`/admin/patients/${row.patient.id}`} className="font-medium underline underline-offset-2">
                  {row.patient.name}
                </Link>
                <div className="text-xs text-zinc-500">
                  {row.patient.phone ? `${row.patient.phone} · ` : ""}
                  zgłoszono {formatDateTime(row.claimedAt ?? row.createdAt)}
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGES[row.status].className}`}>
                {STATUS_BADGES[row.status].label}
              </span>
            </div>

            <div className="grid gap-3 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900 sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-500">Kwota</div>
                <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{formatPLNFromGrosze(row.amount)}</div>
                <div className="text-xs text-zinc-500">{row.choice === "FULL" ? "Pełna przedpłata" : "Zaliczka 10%"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-500">Tytuł płatności</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold">{row.reference}</span>
                  <button
                    type="button"
                    title="Kopiuj tytuł"
                    onClick={() => {
                      navigator.clipboard?.writeText(row.reference).then(() => toast.success("Skopiowano tytuł")).catch(() => null);
                    }}
                    className="rounded-md border p-1 text-zinc-500 hover:bg-white dark:hover:bg-white/10"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="text-xs text-zinc-500">{row.method ? METHOD_LABELS[row.method] : "metoda nie wybrana"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-zinc-500">Wizyta</div>
                <Link href={`/admin/appointments/${row.appointment.id}`} className="font-medium underline underline-offset-2">
                  {row.appointment.serviceName}
                </Link>
                <div className="text-xs text-zinc-500">{formatDateTime(row.appointment.startsAt)}</div>
              </div>
            </div>

            {row.status === "REJECTED" && row.rejectionReason ? (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
                Powód odrzucenia: {row.rejectionReason}
              </div>
            ) : null}
            {row.decidedBy && (row.status === "CONFIRMED" || row.status === "REJECTED") ? (
              <div className="text-xs text-zinc-500">
                Decyzja: {row.decidedBy.name}
                {row.decidedAt ? ` · ${formatDateTime(row.decidedAt)}` : ""}
              </div>
            ) : null}

            {canDecide && (row.status === "CLAIMED" || (row.status === "AWAITING" && row.method)) ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => approve(row)} disabled={busyId === row.id}>
                  {busyId === row.id ? "…" : "✓ Potwierdź wpłatę"}
                </Button>
                {row.status === "CLAIMED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => setRejectTarget(row)}
                    disabled={busyId === row.id}
                  >
                    ✕ Odrzuć
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      <RejectReasonDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
        saving={busyId === rejectTarget?.id}
        dialogTitle="Powód odrzucenia płatności"
        questionLabel="Dlaczego odrzucasz tę płatność? *"
        placeholder="np. nie ma takiej wpłaty na koncie, kwota niezgodna z tytułem…"
        helperText="Powód zobaczy klient — dostanie też prośbę o ponowne zgłoszenie płatności."
        confirmLabel="Odrzuć płatność"
        savingLabel="Zapisywanie…"
        contextLabel={rejectTarget ? `${rejectTarget.patient.name} — ${formatPLNFromGrosze(rejectTarget.amount)} (${rejectTarget.reference})` : null}
        onConfirm={async (reason) => {
          if (!rejectTarget) return;
          await decide(rejectTarget, "REJECT", reason);
          setRejectTarget(null);
        }}
      />
    </div>
  );
}
