"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-provider";

// Ograniczenie przetwarzania danych pacjenta (art. 18 RODO): dane zostają w karcie, ale pacjent
// nie dostaje newslettera. Oznaczenie jest widoczne dla personelu.
export function PatientRestrictionControl({
  patientId,
  restrictedAt,
}: {
  patientId: string;
  restrictedAt: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [saving, setSaving] = React.useState(false);
  const restricted = Boolean(restrictedAt);

  async function toggle() {
    const message = restricted
      ? "Zdjąć ograniczenie przetwarzania danych tego pacjenta?"
      : "Ograniczyć przetwarzanie danych tego pacjenta? Dane zostają w karcie (obowiązek dokumentacji), ale pacjent przestaje dostawać wiadomości marketingowe. Wykonaj to na wniosek pacjenta (art. 18 RODO).";
    if (!(await confirm({ message, confirmLabel: restricted ? "Zdejmij ograniczenie" : "Ogranicz przetwarzanie" }))) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/patients/${patientId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ processingRestricted: !restricted }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać zmiany");
      toast.success(restricted ? "Ograniczenie zdjęte" : "Przetwarzanie ograniczone");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 text-sm " +
        (restricted
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100"
          : "border-zinc-200 bg-white text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300")
      }
    >
      <span>
        {restricted
          ? `Przetwarzanie danych ograniczone (od ${new Date(restrictedAt!).toLocaleDateString("pl-PL")}) — bez wiadomości marketingowych.`
          : "Ograniczenie przetwarzania (art. 18 RODO): wyłącz marketing na wniosek pacjenta."}
      </span>
      <Button variant="outline" size="sm" onClick={toggle} disabled={saving}>
        {restricted ? "Zdejmij ograniczenie" : "Ogranicz przetwarzanie"}
      </Button>
    </div>
  );
}
