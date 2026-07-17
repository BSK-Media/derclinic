"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Kolorowy status akceptacji wizyty (recepcja/admin)
export function ApprovalBadge({
  status,
  reason,
}: {
  status?: string | null;
  reason?: string | null;
}) {
  if (status === "PENDING") {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        Oczekująca
      </span>
    );
  }
  if (status === "REJECTED") {
    return (
      <span
        className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800 dark:bg-red-500/10 dark:text-red-300"
        title={reason ? `Powód: ${reason}` : undefined}
      >
        Odrzucona
      </span>
    );
  }
  if (status === "APPROVED") {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
        Zaakceptowana
      </span>
    );
  }
  return null;
}

// Popup wymuszający podanie powodu odrzucenia wizyty
export function RejectReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  saving,
  contextLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  saving?: boolean;
  contextLabel?: string | null;
}) {
  const [reason, setReason] = React.useState("");
  const tooShort = reason.trim().length < 3;

  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Powód odrzucenia</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {contextLabel ? (
            <div className="text-sm text-zinc-600 dark:text-zinc-300">{contextLabel}</div>
          ) : null}
          <div className="space-y-2">
            <Label>Dlaczego odrzucasz tę wizytę? *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="np. termin koliduje z inną wizytą, brak dostępności specjalisty…"
              rows={4}
              maxLength={500}
              autoFocus
            />
            <div className="text-xs text-zinc-500">
              Powód zobaczy specjalista przy odrzuconej wizycie.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Anuluj
          </Button>
          <Button
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
            onClick={() => onConfirm(reason.trim())}
            disabled={saving || tooShort}
          >
            {saving ? "Zapisywanie…" : "Odrzuć wizytę"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
