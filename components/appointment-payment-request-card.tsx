"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RejectReasonDialog } from "@/components/appointment-approval";
import { useConfirm } from "@/components/confirm-provider";
import { formatPLNFromGrosze } from "@/lib/money";

type Row = {
  id: string;
  status: "AWAITING" | "CLAIMED" | "CONFIRMED" | "REJECTED";
  amount: number;
  choice: string;
  method: "BLIK" | "TRANSFER" | "P24" | null;
  reference: string;
  rejectionReason: string | null;
  claimedAt: string | null;
  decidedBy: { name: string } | null;
};

const STATUS: Record<Row["status"], { label: string; className: string }> = {
  AWAITING: { label: "Czeka na płatność klienta", className: "bg-zinc-100 text-zinc-700 border-zinc-300" },
  CLAIMED: { label: "Do potwierdzenia", className: "bg-amber-100 text-amber-900 border-amber-400" },
  CONFIRMED: { label: "Potwierdzona", className: "bg-green-100 text-green-900 border-green-400" },
  REJECTED: { label: "Odrzucona", className: "bg-red-100 text-red-900 border-red-300" },
};

const METHOD_LABELS: Record<string, string> = { BLIK: "BLIK na telefon", TRANSFER: "Przelew tradycyjny", P24: "Przelewy24" };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

// Płatność za wizytę zamówiona przy rezerwacji online (BLIK / przelew): tytuł
// płatności, kwota, status i potwierdzenie wpłaty (administrator, manager).
export function AppointmentPaymentRequestCard({ appointmentId }: { appointmentId: string }) {
  const { data, mutate } = useSWR(`/api/admin/payment-requests?appointmentId=${appointmentId}`, fetcher);
  const confirm = useConfirm();
  const [rejectTarget, setRejectTarget] = React.useState<Row | null>(null);
  const [busy, setBusy] = React.useState(false);

  const requests: Row[] = data?.requests ?? [];
  const canDecide: boolean = data?.canDecide ?? false;
  if (!data?.ok || requests.length === 0) return null;

  async function decide(row: Row, action: "APPROVE" | "REJECT", reason?: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/payment-requests/${row.id}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać decyzji");
      toast.success(action === "APPROVE" ? "Wpłata potwierdzona" : "Płatność odrzucona");
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function approve(row: Row) {
    const ok = await confirm({
      title: "Potwierdzić wpłatę?",
      message: `Potwierdź tylko, jeśli ${formatPLNFromGrosze(row.amount)} z tytułem ${row.reference} jest już na koncie / telefonie kliniki.`,
      confirmLabel: "Potwierdzam wpłatę",
    });
    if (ok) await decide(row, "APPROVE");
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">Płatność online za rezerwację</div>
        <Link href="/admin/payments" className="text-xs text-zinc-500 underline">
          Wszystkie płatności
        </Link>
      </div>
      {requests.map((row) => (
        <div key={row.id} className="space-y-2 rounded-xl border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="text-lg font-semibold">{formatPLNFromGrosze(row.amount)}</span>{" "}
              <span className="text-zinc-500">
                · {row.choice === "FULL" ? "pełna przedpłata" : "zaliczka 10%"} ·{" "}
                {row.method ? METHOD_LABELS[row.method] : "metoda nie wybrana"}
              </span>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS[row.status].className}`}>
              {STATUS[row.status].label}
            </span>
          </div>
          <div className="text-sm">
            Tytuł płatności: <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono font-bold dark:bg-zinc-800">{row.reference}</span>
          </div>
          {row.rejectionReason ? <div className="text-sm text-red-700">Powód odrzucenia: {row.rejectionReason}</div> : null}
          {row.decidedBy && (row.status === "CONFIRMED" || row.status === "REJECTED") ? (
            <div className="text-xs text-zinc-500">Decyzja: {row.decidedBy.name}</div>
          ) : null}
          {canDecide && (row.status === "CLAIMED" || (row.status === "AWAITING" && row.method)) ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => approve(row)} disabled={busy}>
                ✓ Potwierdź wpłatę
              </Button>
              {row.status === "CLAIMED" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => setRejectTarget(row)}
                  disabled={busy}
                >
                  ✕ Odrzuć
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}

      <RejectReasonDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
        saving={busy}
        dialogTitle="Powód odrzucenia płatności"
        questionLabel="Dlaczego odrzucasz tę płatność? *"
        placeholder="np. nie ma takiej wpłaty na koncie…"
        helperText="Powód zobaczy klient i dostanie prośbę o ponowne zgłoszenie płatności."
        confirmLabel="Odrzuć płatność"
        savingLabel="Zapisywanie…"
        onConfirm={async (reason) => {
          if (!rejectTarget) return;
          await decide(rejectTarget, "REJECT", reason);
          setRejectTarget(null);
        }}
      />
    </Card>
  );
}
