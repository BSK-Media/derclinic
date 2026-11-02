"use client";

import * as React from "react";
import useSWR from "swr";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type QuickStockProduct = { id: string; name: string; unitLabel?: string };
export type QuickStockLevel = { warehouseId: string; warehouseName: string; quantity: number };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: QuickStockProduct | null;
  /** Aktualne stany produktu w magazynach (magazyny bez stanu = 0). */
  stocks: QuickStockLevel[];
  initialMode?: "add" | "remove";
  /** Magazyn wybrany na starcie (np. otwarty magazyn); bez niego — ten z największym stanem. */
  defaultWarehouseId?: string;
  /** Dane z zeskanowanego kodu GS1 — podpowiadają termin ważności i numer partii przy dodawaniu. */
  prefill?: { expiryDate?: string | null; batchNumber?: string | null };
  onDone?: () => void;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(value: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(value);
}

/**
 * Szybka zmiana stanu produktu: dodaj albo odejmij podaną ilość w wybranym magazynie.
 * Otwierana po wejściu w produkt, ze skanu kodu i z listy produktów w magazynie.
 */
export function QuickStockDialog({ open, onOpenChange, product, stocks, initialMode = "add", defaultWarehouseId, prefill, onDone }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zmiana stanu produktu</DialogTitle>
        </DialogHeader>
        {/* Formularz montuje się od nowa przy każdym otwarciu, więc stan startowy ustawiają inicjalizatory. */}
        {open && product ? (
          <QuickStockForm
            key={product.id}
            product={product}
            stocks={stocks}
            initialMode={initialMode}
            defaultWarehouseId={defaultWarehouseId}
            prefill={prefill}
            onClose={() => onOpenChange(false)}
            onDone={onDone}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function QuickStockForm({
  product,
  stocks,
  initialMode,
  defaultWarehouseId,
  prefill,
  onClose,
  onDone,
}: Pick<Props, "stocks" | "defaultWarehouseId" | "prefill" | "onDone"> & {
  product: QuickStockProduct;
  initialMode: "add" | "remove";
  onClose: () => void;
}) {
  // Lista wszystkich magazynów (do dodania produktu tam, gdzie jeszcze go nie ma).
  const { data: inventory } = useSWR<{ warehouses?: { id: string; name: string }[] }>("/api/admin/inventory", fetcher);
  const warehouses = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const w of inventory?.warehouses ?? []) map.set(w.id, w.name);
    for (const s of stocks) map.set(s.warehouseId, s.warehouseName);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }, [inventory, stocks]);

  const [mode, setMode] = React.useState<"add" | "remove">(initialMode);
  const [chosenWarehouse, setWarehouseId] = React.useState(
    () => defaultWarehouseId ?? [...stocks].sort((a, b) => b.quantity - a.quantity)[0]?.warehouseId ?? "",
  );
  // Gdy jest tylko jeden magazyn, wybieramy go od razu.
  const warehouseId = chosenWarehouse || (warehouses.length === 1 ? warehouses[0].id : "");
  const [amount, setAmount] = React.useState("1");
  const [expiryDate, setExpiryDate] = React.useState(prefill?.expiryDate ?? "");
  const [batchNumber, setBatchNumber] = React.useState(prefill?.batchNumber ?? "");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const available = stocks.find((s) => s.warehouseId === warehouseId)?.quantity ?? 0;
  const parsed = Number(amount.replace(",", "."));
  const valid = Number.isFinite(parsed) && parsed > 0;
  const tooMany = mode === "remove" && valid && parsed > available;
  const unit = product.unitLabel ? ` ${product.unitLabel}` : "";

  function step(delta: number) {
    const base = valid ? parsed : 0;
    setAmount(String(Math.max(0, Math.round((base + delta) * 100) / 100)));
  }

  async function save() {
    if (!warehouseId) return toast.error("Wybierz magazyn");
    if (!valid) return toast.error("Podaj prawidłową ilość");
    if (tooMany) return toast.error(`Możesz odjąć maksymalnie ${fmt(available)}`);
    setSaving(true);
    try {
      const response = await fetch("/api/admin/stocks/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          warehouseId,
          delta: mode === "add" ? parsed : -parsed,
          expiryDate: mode === "add" && expiryDate ? expiryDate : undefined,
          batchNumber: mode === "add" && batchNumber.trim() ? batchNumber.trim() : undefined,
          note: note.trim() || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Nie udało się zmienić stanu");
      toast.success(mode === "add" ? `Dodano ${fmt(parsed)}${unit}` : `Odjęto ${fmt(parsed)}${unit}`);
      onClose();
      onDone?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zmienić stanu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
          <div className="font-medium">{product.name}</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["add", "Dodaj", "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"],
              ["remove", "Odejmij", "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"],
            ] as const
          ).map(([value, label, active]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={
                "rounded-xl border px-3 py-2 text-sm font-semibold transition " +
                (mode === value ? active : "border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300")
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Magazyn</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger>
              <SelectValue placeholder="Wybierz magazyn" />
            </SelectTrigger>
            <SelectContent disablePortal>
              {warehouses.map((w) => {
                const qty = stocks.find((s) => s.warehouseId === w.id)?.quantity ?? 0;
                return (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} • stan: {fmt(qty)}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-stock-amount">Ilość{unit ? ` (${unit.trim()})` : ""}</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="h-10 w-10 shrink-0 px-0" onClick={() => step(-1)} aria-label="Zmniejsz ilość">
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              id="quick-stock-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))}
              className="text-center text-lg font-semibold"
            />
            <Button type="button" variant="outline" className="h-10 w-10 shrink-0 px-0" onClick={() => step(1)} aria-label="Zwiększ ilość">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {mode === "remove" ? (
            <div className={"text-xs " + (tooMany ? "text-red-600" : "text-slate-500")}>
              Dostępne w tym magazynie: {fmt(available)}
              {unit}
              {tooMany ? " — za dużo" : ""}
            </div>
          ) : null}
        </div>

        {mode === "add" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-stock-expiry">Termin ważności (opcjonalnie)</Label>
              <Input id="quick-stock-expiry" type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-stock-batch">Numer partii (opcjonalnie)</Label>
              <Input id="quick-stock-batch" value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} placeholder="automatycznie" />
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="quick-stock-note">Notatka (opcjonalnie)</Label>
          <Input id="quick-stock-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>
          Anuluj
        </Button>
        <Button
          onClick={save}
          disabled={saving || !warehouseId || !valid || tooMany}
          className={mode === "add" ? "bg-emerald-700 text-white hover:bg-emerald-800" : "bg-amber-600 text-white hover:bg-amber-700"}
        >
          {saving ? "Zapisywanie..." : mode === "add" ? "Dodaj" : "Odejmij"}
        </Button>
      </DialogFooter>
    </>
  );
}
