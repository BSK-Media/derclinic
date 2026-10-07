"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RejectReasonDialog } from "@/components/appointment-approval";
import { useConfirm } from "@/components/confirm-provider";

type Submission = {
  id: string;
  createdAt: string;
  fileName: string;
  size: number;
  status: "ACCEPTED" | "REJECTED" | "PENDING_REVIEW";
  reason: string | null;
  details: { signer?: string; issuer?: string; signerSerial?: string; format?: string } | null;
  decidedBy: string | null;
};

type ConsentData = {
  ok: boolean;
  status: "NOT_REQUIRED" | "NOT_SIGNED" | "PENDING_REVIEW" | "SIGNED";
  signedAt: string | null;
  rejectionReason: string | null;
  forfeited: boolean;
  deadline: string;
  submissions: Submission[];
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

const SUBMISSION_LABELS: Record<Submission["status"], { label: string; className: string }> = {
  ACCEPTED: { label: "Przyjęta", className: "bg-green-100 text-green-800" },
  REJECTED: { label: "Odrzucona", className: "bg-red-100 text-red-800" },
  PENDING_REVIEW: { label: "Do weryfikacji", className: "bg-blue-100 text-blue-800" },
};

// Zgoda pacjenta na zabieg przy wizycie (widok personelu): status, historia
// przesłanych plików z wynikiem weryfikacji podpisu i ręczna decyzja.
export function AppointmentConsentCard({ appointmentId }: { appointmentId: string }) {
  const base = `/api/admin/appointments/${appointmentId}/consent`;
  const { data, mutate } = useSWR<ConsentData>(base, fetcher);
  const confirm = useConfirm();
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  if (!data?.ok || data.status === "NOT_REQUIRED") return null;

  async function decide(action: "APPROVE" | "REJECT", reason?: string) {
    setBusy(true);
    try {
      const res = await fetch(`${base}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać decyzji");
      toast.success(action === "APPROVE" ? "Zgoda zatwierdzona" : "Zgoda odrzucona — pacjent dostał powiadomienie");
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    const ok = await confirm({
      title: "Zatwierdzić zgodę?",
      message: "Zgoda zostanie uznana za podpisaną. Zrób to tylko, gdy sprawdziłeś dokument (np. podpis lub papierowy skan).",
      confirmLabel: "Zatwierdź",
    });
    if (ok) await decide("APPROVE");
  }

  const statusBox =
    data.status === "SIGNED"
      ? { text: "Zgoda podpisana", className: "bg-green-50 text-green-900 border-green-300" }
      : data.status === "PENDING_REVIEW"
        ? { text: "Zgoda czeka na weryfikację", className: "bg-blue-50 text-blue-900 border-blue-300" }
        : { text: "Zgoda niepodpisana", className: "bg-amber-50 text-amber-950 border-amber-400" };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">Zgoda pacjenta na zabieg</div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBox.className}`}>
          {data.status === "NOT_SIGNED" ? "❗ " : ""}
          {statusBox.text}
        </span>
      </div>

      {data.status === "NOT_SIGNED" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Termin graniczny: <strong>{new Date(data.deadline).toLocaleString("pl-PL")}</strong>. Bez podpisanej zgody do
          tej chwili rezerwacja zostanie automatycznie anulowana, a zaliczka przepadnie.
        </p>
      ) : null}
      {data.rejectionReason && data.status === "NOT_SIGNED" ? (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">Ostatnie odrzucenie: {data.rejectionReason}</p>
      ) : null}
      {data.forfeited ? (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
          Rezerwacja anulowana automatycznie — brak zgody do terminu zabiegu, zaliczka przepadła.
        </p>
      ) : null}

      {data.submissions.length > 0 ? (
        <div className="overflow-hidden rounded-xl border">
          {data.submissions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b p-3 text-sm last:border-b-0">
              <div className="min-w-0">
                <div className="truncate font-medium">{s.fileName}</div>
                <div className="text-xs text-zinc-500">
                  {new Date(s.createdAt).toLocaleString("pl-PL")} · {Math.max(1, Math.round(s.size / 1024))} KB
                  {s.details?.signer ? ` · podpisał(a): ${s.details.signer}` : ""}
                  {s.details?.issuer ? ` (${s.details.issuer})` : ""}
                  {s.decidedBy ? ` · decyzja: ${s.decidedBy}` : ""}
                </div>
                {s.reason ? <div className="text-xs text-zinc-600">{s.reason}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${SUBMISSION_LABELS[s.status].className}`}>
                  {SUBMISSION_LABELS[s.status].label}
                </span>
                <a
                  href={`${base}/file?submissionId=${s.id}`}
                  className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-white/5"
                >
                  Pobierz
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Pacjent nie przesłał jeszcze podpisanego dokumentu.</p>
      )}

      {data.status !== "SIGNED" && !data.forfeited ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={approve} disabled={busy}>
            ✓ Zatwierdź zgodę ręcznie
          </Button>
          {data.submissions.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
              onClick={() => setRejectOpen(true)}
              disabled={busy}
            >
              ✕ Odrzuć
            </Button>
          ) : null}
        </div>
      ) : null}

      <RejectReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        saving={busy}
        dialogTitle="Powód odrzucenia zgody"
        questionLabel="Dlaczego odrzucasz zgodę? *"
        placeholder="np. brak podpisu, nieczytelny plik, zgoda dotyczy innego zabiegu…"
        helperText="Powód zobaczy pacjent i dostanie powiadomienie z prośbą o ponowne wgranie."
        confirmLabel="Odrzuć zgodę"
        savingLabel="Zapisywanie…"
        onConfirm={async (reason) => {
          await decide("REJECT", reason);
          setRejectOpen(false);
        }}
      />
    </Card>
  );
}
