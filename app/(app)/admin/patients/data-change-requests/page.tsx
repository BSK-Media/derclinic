"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RejectReasonDialog } from "@/components/appointment-approval";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const FIELD_LABELS: Record<string, string> = {
  NAME: "Imię i nazwisko",
  PHONE: "Telefon",
  EMAIL: "E-mail",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Oczekująca",
  APPROVED: "Zaakceptowana",
  REJECTED: "Odrzucona",
};

type ChangeRequest = {
  id: string;
  field: "NAME" | "PHONE" | "EMAIL";
  currentValue: string | null;
  newValue: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  rejectionReason: string | null;
  patient: { id: string; name: string; phone: string | null; email: string | null };
  decidedBy: { name: string } | null;
};

function StatusBadge({ status }: { status: string }) {
  if (status === "PENDING") {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        Oczekująca
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800 dark:bg-red-500/10 dark:text-red-300">
        Odrzucona
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
      Zaakceptowana
    </span>
  );
}

export default function DataChangeRequestsPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/patient-data-change-requests", fetcher);
  const requests: ChangeRequest[] = data?.requests ?? [];

  const [filter, setFilter] = React.useState<"PENDING" | "ALL">("PENDING");
  const [decidingId, setDecidingId] = React.useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<ChangeRequest | null>(null);

  const visible = filter === "PENDING" ? requests.filter((r) => r.status === "PENDING") : requests;
  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  async function decide(id: string, action: "APPROVE" | "REJECT", reason?: string) {
    setDecidingId(id);
    try {
      const res = await fetch(`/api/admin/patient-data-change-requests/${id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się zapisać decyzji");
        return;
      }
      toast.success(action === "APPROVE" ? "Zaakceptowano i zaktualizowano dane pacjenta" : "Odrzucono prośbę");
      mutate();
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/patients"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" /> Wróć do pacjentów
        </Link>
        <h1 className="text-2xl font-semibold">Prośby o zmiany danych</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Pacjenci zgłaszają tu chęć zmiany imienia i nazwiska, telefonu albo e-maila ze swojego panelu klienta.
          Zaakceptowanie od razu aktualizuje dane w karcie pacjenta.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFilter("PENDING")}
          className={`rounded-full border px-3.5 py-2 text-sm font-medium ${
            filter === "PENDING"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "bg-white text-zinc-600 dark:bg-[#0b1220] dark:text-zinc-300"
          }`}
        >
          Oczekujące{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setFilter("ALL")}
          className={`rounded-full border px-3.5 py-2 text-sm font-medium ${
            filter === "ALL"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "bg-white text-zinc-600 dark:bg-[#0b1220] dark:text-zinc-300"
          }`}
        >
          Wszystkie
        </button>
      </div>

      {isLoading ? <Card className="p-5 text-center text-sm text-zinc-500">Ładowanie…</Card> : null}
      {!isLoading && visible.length === 0 ? (
        <Card className="p-5 text-center text-sm text-zinc-500">
          {filter === "PENDING" ? "Brak oczekujących próśb." : "Brak próśb."}
        </Card>
      ) : null}

      <div className="space-y-3">
        {visible.map((r) => (
          <Card key={r.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link href={`/admin/patients/${r.patient.id}`} className="font-medium underline underline-offset-2">
                  {r.patient.name}
                </Link>
                <div className="text-xs text-zinc-500">
                  {new Date(r.createdAt).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}
                </div>
              </div>
              <StatusBadge status={r.status} />
            </div>

            <div className="rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {FIELD_LABELS[r.field]}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-zinc-500 line-through">{r.currentValue || "—"}</span>
                <span className="text-zinc-400">→</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">{r.newValue}</span>
              </div>
            </div>

            {r.status === "REJECTED" && r.rejectionReason ? (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
                Powód odrzucenia: {r.rejectionReason}
              </div>
            ) : null}

            {r.status !== "PENDING" && r.decidedBy ? (
              <div className="text-xs text-zinc-500">Rozpatrzone przez: {r.decidedBy.name}</div>
            ) : null}

            {r.status === "PENDING" ? (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => decide(r.id, "APPROVE")} disabled={decidingId === r.id}>
                  {decidingId === r.id ? "…" : "✓ Zaakceptuj"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
                  onClick={() => setRejectTarget(r)}
                  disabled={decidingId === r.id}
                >
                  ✕ Odrzuć
                </Button>
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
        saving={decidingId === rejectTarget?.id}
        contextLabel={
          rejectTarget
            ? `${rejectTarget.patient.name} — zmiana pola „${FIELD_LABELS[rejectTarget.field]}" na „${rejectTarget.newValue}"`
            : null
        }
        onConfirm={async (reason) => {
          if (!rejectTarget) return;
          await decide(rejectTarget.id, "REJECT", reason);
          setRejectTarget(null);
        }}
      />
    </div>
  );
}
