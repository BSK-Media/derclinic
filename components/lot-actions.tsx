"use client";

import * as React from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EditableLot = {
  id: string;
  batchNumber: string;
  serialNumber: string | null;
  expiryDate: string | null;
  quantity: number | string;
  warehouseName?: string;
};

function quantityText(value: number) {
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
}

// Przyciski „Edytuj” i „Usuń” przy partii — do poprawiania pomyłek przy przyjęciu.
export function LotActions({
  lot,
  productName,
  onChanged,
}: {
  lot: EditableLot;
  productName: string;
  onChanged: () => void | Promise<unknown>;
}) {
  const confirm = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [batchNumber, setBatchNumber] = React.useState("");
  const [serialNumber, setSerialNumber] = React.useState("");
  const [expiryDate, setExpiryDate] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  function openEditor() {
    setBatchNumber(lot.batchNumber);
    setSerialNumber(lot.serialNumber ?? "");
    setExpiryDate(lot.expiryDate ? lot.expiryDate.slice(0, 10) : "");
    setQuantity(String(Number(lot.quantity)));
    setOpen(true);
  }

  async function save() {
    const parsedQuantity = Number(quantity.replace(",", "."));
    if (!batchNumber.trim()) return toast.error("Podaj numer partii");
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) return toast.error("Podaj prawidłową ilość");
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/stocks/lots/${lot.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          batchNumber: batchNumber.trim(),
          serialNumber: serialNumber.trim() || null,
          expiryDate: expiryDate || null,
          quantity: parsedQuantity,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Nie udało się zapisać partii");
      toast.success("Zapisano zmiany partii");
      setOpen(false);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zapisać partii");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const confirmed = await confirm({
      message: `Usunąć partię ${lot.batchNumber} produktu „${productName}"${
        lot.warehouseName ? ` z magazynu „${lot.warehouseName}"` : ""
      }? Stan produktu zmniejszy się o ${quantityText(Number(lot.quantity))}.`,
      destructive: true,
      confirmLabel: "Usuń partię",
    });
    if (!confirmed) return;
    const response = await fetch(`/api/admin/stocks/lots/${lot.id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) return toast.error(result?.message || "Nie udało się usunąć partii");
    toast.success("Partia została usunięta");
    await onChanged();
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={openEditor}
          title="Edytuj partię"
          aria-label={`Edytuj partię ${lot.batchNumber}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={remove}
          title="Usuń partię"
          aria-label={`Usuń partię ${lot.batchNumber}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edycja partii — {productName}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`lot-${lot.id}-batch`}>Numer partii</Label>
              <Input id={`lot-${lot.id}-batch`} value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`lot-${lot.id}-serial`}>Numer seryjny</Label>
              <Input id={`lot-${lot.id}-serial`} value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`lot-${lot.id}-expiry`}>Termin ważności</Label>
              <Input id={`lot-${lot.id}-expiry`} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`lot-${lot.id}-quantity`}>Ilość</Label>
              <Input
                id={`lot-${lot.id}-quantity`}
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <p className="text-xs text-slate-500 sm:col-span-2">
              Zmiana ilości partii zmienia też stan produktu w magazynie{lot.warehouseName ? ` „${lot.warehouseName}"` : ""}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Anuluj
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
