"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, PackageCheck, Plus, ScanLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { eanMatchesGtin, scannedProductCode } from "@/lib/barcode";
import { useScannerInput, useWindowScanner } from "@/lib/use-scanner-input";

export const CONSUMPTION_UNIT_LABELS: Record<string, string> = {
  UNIT: "szt.",
  ML: "ml",
  MG: "mg",
  G: "g",
  AMPULE: "ampułka",
  BOTOX_UNIT: "jedn. botox",
};

type ProductOption = {
  id: string;
  name: string;
  unit: string;
  ean: string | null;
  isActive: boolean;
};
type WarehouseOption = { id: string; name: string };
type StockRow = { productId: string; warehouseId: string; quantity: string | number };
type Suggestion = { productId: string; quantity: string | number };

type Row = { key: string; productId: string; warehouseId: string; quantity: string };

let rowCounter = 0;
const nextKey = () => `row-${++rowCounter}`;

function parseQty(value: string) {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function formatQty(value: string | number) {
  return String(Math.round(Number(value) * 100) / 100);
}

/**
 * Okno potwierdzenia zużycia preparatów po zakończonej wizycie. Podpowiada standardowe
 * zużycie zabiegu, pozwala zmienić ilość, dodać inny preparat (także skanerem EAN/GS1),
 * a przed zapisem pyta, czy zapisać ilości jako standard zabiegu, czy jednorazowo.
 */
type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  serviceId: string | null;
  serviceName: string;
  suggestions: Suggestion[];
  products: ProductOption[];
  warehouses: WarehouseOption[];
  stocks: StockRow[];
  onSaved: () => void | Promise<unknown>;
};

export function ConsumptionReviewDialog(props: DialogProps) {
  const [saving, setSaving] = React.useState(false);
  return (
    <Dialog open={props.open} onOpenChange={(next) => (saving ? null : props.onOpenChange(next))}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        {/* Treść montuje się przy każdym otwarciu — stan (wiersze, krok) startuje od nowa. */}
        <ConsumptionReviewBody {...props} saving={saving} setSaving={setSaving} />
      </DialogContent>
    </Dialog>
  );
}

function ConsumptionReviewBody({
  open,
  onOpenChange,
  appointmentId,
  serviceId,
  serviceName,
  suggestions,
  products,
  warehouses,
  stocks,
  onSaved,
  saving,
  setSaving,
}: DialogProps & { saving: boolean; setSaving: (value: boolean) => void }) {
  const [step, setStep] = React.useState<"edit" | "scope" | "none">("edit");
  const [scanValue, setScanValue] = React.useState("");
  const quantityRefs = React.useRef(new Map<string, HTMLInputElement | null>());
  // Wiersz, którego pole ilości ma dostać fokus po najbliższym renderze.
  const pendingFocus = React.useRef<string | null>(null);

  const productMap = React.useMemo(
    () => new Map(products.map((p) => [p.id, p] as const)),
    [products],
  );
  const activeProducts = React.useMemo(
    () => products.filter((p) => p.isActive).sort((a, b) => a.name.localeCompare(b.name, "pl")),
    [products],
  );

  // Magazyn podpowiadany dla preparatu: ten, w którym jest go najwięcej; inaczej pierwszy.
  const defaultWarehouse = React.useCallback(
    (productId: string) => {
      const best = stocks
        .filter((s) => s.productId === productId && Number(s.quantity) > 0)
        .sort((a, b) => Number(b.quantity) - Number(a.quantity))[0];
      return best?.warehouseId ?? warehouses[0]?.id ?? "";
    },
    [stocks, warehouses],
  );

  const [rows, setRows] = React.useState<Row[]>(() =>
    suggestions.length
      ? suggestions.map((s) => ({
          key: nextKey(),
          productId: s.productId,
          warehouseId: defaultWarehouse(s.productId),
          quantity: formatQty(s.quantity),
        }))
      : [{ key: nextKey(), productId: "", warehouseId: warehouses[0]?.id ?? "", quantity: "" }],
  );

  React.useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    const input = quantityRefs.current.get(key);
    input?.focus();
    input?.select();
  });

  function focusQuantity(key: string) {
    pendingFocus.current = key;
    quantityRefs.current.get(key)?.focus();
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow(productId = "") {
    const row: Row = {
      key: nextKey(),
      productId,
      warehouseId: productId ? defaultWarehouse(productId) : (warehouses[0]?.id ?? ""),
      quantity: "",
    };
    setRows((current) => [...current.filter((r) => r.productId || r.quantity), row]);
    if (productId) pendingFocus.current = row.key;
    return row;
  }

  // Skan opakowania: preparat trafia na listę, a kursor do pola ilości.
  function handleScan(raw: string) {
    setScanValue("");
    const code = scannedProductCode(raw);
    if (!code) return toast.error(`Nie rozpoznano kodu ${raw.trim()}`);
    const product = products.find((p) => eanMatchesGtin(p.ean, code));
    if (!product) return toast.error(`Nie znaleziono preparatu o kodzie ${raw.trim()}`);
    const existing = rows.find((row) => row.productId === product.id);
    if (existing) {
      focusQuantity(existing.key);
      toast.info(`${product.name} jest już na liście — popraw ilość`);
      return;
    }
    addRow(product.id);
    toast.success(`Dodano: ${product.name} — podaj ilość`);
  }

  const scanner = useScannerInput(handleScan);
  useWindowScanner(handleScan, open && step === "edit");

  const filledRows = rows.filter((row) => row.productId);

  function validate() {
    if (filledRows.length === 0) {
      toast.error("Wybierz użyty preparat albo kliknij „Bez preparatów”");
      return false;
    }
    for (const row of filledRows) {
      const name = productMap.get(row.productId)?.name ?? "preparat";
      const qty = parseQty(row.quantity);
      if (!(qty > 0)) {
        toast.error(`${name}: podaj ilość większą od zera`);
        focusQuantity(row.key);
        return false;
      }
      if (!row.warehouseId) {
        toast.error(`${name}: wybierz magazyn`);
        return false;
      }
    }
    return true;
  }

  // Czy ilości różnią się od standardu zabiegu (inne preparaty albo inne ilości).
  const differsFromStandard = React.useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of filledRows)
      totals.set(row.productId, (totals.get(row.productId) ?? 0) + (parseQty(row.quantity) || 0));
    if (totals.size !== suggestions.length) return true;
    return suggestions.some(
      (s) => Math.abs((totals.get(s.productId) ?? -1) - Number(s.quantity)) > 1e-9,
    );
  }, [filledRows, suggestions]);

  async function submit(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/appointments/${appointmentId}/consumption-review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok)
        throw new Error(result?.message || "Nie udało się zapisać zużycia");
      toast.success(
        payload.mode === "none"
          ? "Zapisano: zabieg bez preparatów"
          : result.saveAsStandard
            ? "Zapisano zużycie i ustawiono je jako standard zabiegu"
            : "Zapisano zużycie dla tej wizyty",
      );
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zapisać zużycia");
    } finally {
      setSaving(false);
    }
  }

  function save(saveAsStandard: boolean) {
    return submit({
      mode: "save",
      saveAsStandard,
      items: filledRows.map((row) => ({
        productId: row.productId,
        warehouseId: row.warehouseId,
        quantity: parseQty(row.quantity),
      })),
    });
  }

  function onSaveClick() {
    if (!validate()) return;
    // Pytamy o standard tylko, gdy zabieg istnieje w katalogu i coś zmieniono względem standardu.
    if (serviceId && differsFromStandard) setStep("scope");
    else void save(false);
  }

  const suggestedQty = new Map(suggestions.map((s) => [s.productId, Number(s.quantity)] as const));

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <PackageCheck className="h-5 w-5" /> Zużycie preparatów — {serviceName}
        </DialogTitle>
      </DialogHeader>

      {step === "edit" ? (
        <div className="space-y-4">
          {suggestions.length ? (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-white/5 dark:text-slate-200">
              Czy potwierdzasz zużycie preparatów w tej ilości? Jeśli zużyto więcej lub mniej,
              popraw ilość. Jeśli użyto innego preparatu, dodaj go niżej.
            </p>
          ) : (
            <p className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Do tego zabiegu nie został przypisany żaden preparat. Wybierz użyty preparat i podaj
              ilość albo kliknij „Bez preparatów”, jeśli zabieg ich nie wymagał.
            </p>
          )}

          <div className="space-y-1">
            <Label htmlFor="consumption-scan">Skanuj opakowanie (EAN lub GS1)</Label>
            <div className="relative">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="consumption-scan"
                autoComplete="off"
                value={scanValue}
                onChange={(e) => {
                  setScanValue(e.target.value);
                  scanner.trackChange(e.target.value);
                }}
                onKeyDown={scanner.onKeyDown}
                placeholder="Zeskanuj kod — działa też bez klikania w to pole"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            {rows.map((row) => {
              const product = productMap.get(row.productId);
              const standard = suggestedQty.get(row.productId);
              const qty = parseQty(row.quantity);
              return (
                <div
                  key={row.key}
                  className="grid gap-2 rounded-xl border border-slate-200 p-3 dark:border-white/10 sm:grid-cols-[2fr_1.4fr_0.8fr_auto_auto] sm:items-end"
                >
                  <div className="space-y-1">
                    <Label className="text-xs">Preparat</Label>
                    <Select
                      value={row.productId}
                      onValueChange={(productId) =>
                        updateRow(row.key, { productId, warehouseId: defaultWarehouse(productId) })
                      }
                    >
                      <SelectTrigger aria-label="Preparat">
                        <SelectValue placeholder="Wybierz preparat" />
                      </SelectTrigger>
                      <SelectContent disablePortal>
                        {activeProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Magazyn</Label>
                    <Select
                      value={row.warehouseId}
                      onValueChange={(warehouseId) => updateRow(row.key, { warehouseId })}
                    >
                      <SelectTrigger aria-label="Magazyn">
                        <SelectValue placeholder="Magazyn" />
                      </SelectTrigger>
                      <SelectContent disablePortal>
                        {warehouses.map((w) => {
                          const inStock = stocks.find(
                            (s) => s.productId === row.productId && s.warehouseId === w.id,
                          );
                          return (
                            <SelectItem key={w.id} value={w.id}>
                              {w.name}
                              {row.productId
                                ? ` (${inStock ? formatQty(inStock.quantity) : 0})`
                                : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ilość</Label>
                    <Input
                      ref={(el) => {
                        quantityRefs.current.set(row.key, el);
                      }}
                      aria-label="Ilość"
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Jednostka</Label>
                    <div
                      className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-white/10 dark:bg-white/5"
                      title="Jednostka magazynowa preparatu (zmienisz ją w karcie produktu)"
                    >
                      {product ? (CONSUMPTION_UNIT_LABELS[product.unit] ?? product.unit) : "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                    className="mb-2 justify-self-end text-slate-400 hover:text-red-600"
                    aria-label="Usuń preparat"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  {standard !== undefined && qty > 0 && Math.abs(qty - standard) > 1e-9 ? (
                    <div className="text-xs text-amber-700 dark:text-amber-300 sm:col-span-5">
                      Standard zabiegu: {formatQty(standard)}{" "}
                      {product ? (CONSUMPTION_UNIT_LABELS[product.unit] ?? product.unit) : ""}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => addRow()}
            >
              <Plus className="h-4 w-4" /> Dodaj preparat
            </Button>
          </div>
        </div>
      ) : null}

      {step === "scope" ? (
        <div className="space-y-3">
          <p className="text-sm">
            Jak zapisać to zużycie dla zabiegu{" "}
            <span className="font-semibold">„{serviceName}”</span>?
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => save(true)}
              className="flex flex-col items-start gap-1 rounded-xl border border-blue-200 bg-blue-50 p-3 text-left hover:border-blue-400 disabled:opacity-50 dark:border-blue-500/30 dark:bg-blue-500/10"
            >
              <span className="font-semibold text-blue-900 dark:text-blue-100">
                Na stałe — jako standard zabiegu
              </span>
              <span className="text-xs text-blue-900/80 dark:text-blue-100/80">
                Kolejne wizyty tego zabiegu będą podpowiadać te preparaty i ilości.
              </span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => save(false)}
              className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-slate-400 disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
            >
              <span className="font-semibold">Jednorazowo — tylko ta wizyta</span>
              <span className="text-xs text-slate-500">Standard zabiegu zostaje bez zmian.</span>
            </button>
          </div>
        </div>
      ) : null}

      {step === "none" ? (
        <p className="text-sm">
          Potwierdzasz, że podczas tego zabiegu{" "}
          <span className="font-semibold">nie użyto żadnego preparatu</span>? Okno nie będzie się
          już pojawiać dla tej wizyty.
        </p>
      ) : null}

      <DialogFooter className="gap-2 sm:justify-between">
        {step === "edit" ? (
          <>
            <Button type="button" variant="ghost" onClick={() => setStep("none")} disabled={saving}>
              Bez preparatów
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Później
              </Button>
              <Button type="button" onClick={onSaveClick} disabled={saving}>
                {saving ? "Zapisywanie…" : "Zapisz zużycie"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("edit")}
              disabled={saving}
            >
              Wróć
            </Button>
            {step === "none" ? (
              <Button type="button" onClick={() => submit({ mode: "none" })} disabled={saving}>
                {saving ? "Zapisywanie…" : "Tak, bez preparatów"}
              </Button>
            ) : null}
          </>
        )}
      </DialogFooter>
    </>
  );
}
