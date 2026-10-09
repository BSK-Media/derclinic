"use client";

import * as React from "react";
import { toast } from "sonner";
import { Minus, Plus, ScanLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { gtinToEan } from "@/lib/barcode";
import { parsePLNToGrosze } from "@/lib/money";
import {
  addReceiptLine,
  mergeDuplicateLines,
  parseQuantity,
  type ReceiptLine,
  type ReceiptLineInput,
} from "@/lib/receiving";
import { useScannerInput } from "@/lib/use-scanner-input";
import { VAT_RATES } from "@/lib/vat";
import useSWR from "swr";
import { categoryChoices, unitChoices, unitFromSelectValue, type ProductOptions } from "@/lib/product-options";

const NEW_PRODUCT = "__new_product__";
const NEW_REF_PREFIX = "new:";

type ProductOption = {
  id: string;
  name: string;
  sku: string | null;
  manufacturer: string | null;
};

type WarehouseOption = {
  id: string;
  name: string;
};

type NewProductDraft = {
  id: string;
  ean: string;
  name: string;
  manufacturer: string;
  sku: string;
  catalogCategory: string;
  unit: string;
  purchasePrice: string;
  salePrice: string;
  vatRate: string;
};

type LookupResult = {
  scan:
    | { kind: "gs1"; data: { gtin: string | null; batchNumber: string | null; serialNumber: string | null; expiryDate: string | null } }
    | { kind: "plain"; code: string };
  product: (ProductOption & { ean: string | null }) | null;
};

const NO_CATEGORY = "__none__";

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function emptyDraft(ean: string): NewProductDraft {
  return {
    id: nextId("draft"),
    ean,
    name: "",
    manufacturer: "",
    sku: "",
    catalogCategory: "",
    unit: "UNIT",
    purchasePrice: "",
    salePrice: "",
    vatRate: "VAT_23",
  };
}

function formatExpiry(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

export function AdminAddProductDialog({
  open,
  onOpenChange,
  products,
  warehouses,
  fixedWarehouseId,
  fixedWarehouseName,
  initialScanCode,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductOption[];
  warehouses: WarehouseOption[];
  fixedWarehouseId?: string;
  fixedWarehouseName?: string;
  // Kod zeskanowany przed otwarciem okna (globalny skaner) — przetwarzany jak pierwszy skan.
  initialScanCode?: string;
  onSaved: () => void | Promise<void>;
}) {
  const { data: listOptions } = useSWR<{ ok: boolean } & ProductOptions>(
    "/api/admin/settings/product-options",
    (url: string) => fetch(url).then((r) => r.json()),
  );
  const [warehouseId, setWarehouseId] = React.useState(fixedWarehouseId ?? "");
  const [lines, setLines] = React.useState<ReceiptLine[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, NewProductDraft>>({});
  const [lastLineId, setLastLineId] = React.useState<string | null>(null);
  const [scanCode, setScanCode] = React.useState("");
  const [extraProducts, setExtraProducts] = React.useState<ProductOption[]>([]);
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  // Skany czekające na wybór magazynu (monit po pierwszym skanie).
  const [pendingScans, setPendingScans] = React.useState<LookupResult[]>([]);
  const [promptWarehouseId, setPromptWarehouseId] = React.useState("");

  // Ręczne dodawanie pozycji (bez czytnika).
  const [manualProduct, setManualProduct] = React.useState("");
  const [manualDraft, setManualDraft] = React.useState<NewProductDraft>(() => emptyDraft(""));
  const [manualQuantity, setManualQuantity] = React.useState("1");
  const [manualExpiry, setManualExpiry] = React.useState("");
  const [manualBatch, setManualBatch] = React.useState("");
  const [manualSerial, setManualSerial] = React.useState("");

  const linesRef = React.useRef<ReceiptLine[]>([]);
  const draftsRef = React.useRef<Record<string, NewProductDraft>>({});
  const warehouseRef = React.useRef(warehouseId);
  const scanInputRef = React.useRef<HTMLInputElement | null>(null);
  const lookupCache = React.useRef(new Map<string, LookupResult>());
  const scanQueue = React.useRef<Promise<void>>(Promise.resolve());

  function commitLines(next: ReceiptLine[]) {
    linesRef.current = next;
    setLines(next);
  }

  function commitDrafts(next: Record<string, NewProductDraft>) {
    draftsRef.current = next;
    setDrafts(next);
  }

  function chooseWarehouse(id: string) {
    warehouseRef.current = id;
    setWarehouseId(id);
  }

  React.useEffect(() => {
    if (!open) return;
    linesRef.current = [];
    draftsRef.current = {};
    warehouseRef.current = fixedWarehouseId ?? "";
    lookupCache.current.clear();
    setLines([]);
    setDrafts({});
    setLastLineId(null);
    setWarehouseId(fixedWarehouseId ?? "");
    setScanCode("");
    setNote("");
    setPendingScans([]);
    setPromptWarehouseId("");
    setManualProduct("");
    setManualDraft(emptyDraft(""));
    setManualQuantity("1");
    setManualExpiry("");
    setManualBatch("");
    setManualSerial("");
  }, [fixedWarehouseId, open]);

  const productOptions = React.useMemo(
    () => [...products, ...extraProducts.filter((extra) => !products.some((product) => product.id === extra.id))],
    [products, extraProducts],
  );
  const productNames = React.useMemo(
    () => new Map(productOptions.map((product) => [product.id, product.name] as const)),
    [productOptions],
  );

  function lineProductName(line: ReceiptLine) {
    if (line.productRef.startsWith(NEW_REF_PREFIX)) {
      const draft = drafts[line.productRef.slice(NEW_REF_PREFIX.length)];
      return draft?.name.trim() || `Nowy produkt${draft?.ean ? ` (EAN ${draft.ean})` : ""}`;
    }
    return productNames.get(line.productRef) ?? "Produkt";
  }

  function addLine(input: ReceiptLineInput, label: string) {
    const result = addReceiptLine(linesRef.current, input, () => nextId("line"));
    commitLines(result.lines);
    setLastLineId(result.line.id);
    if (result.merged) toast.success(`${label}: ilość ${result.line.quantity}`);
    else toast.success(`Dodano pozycję: ${label}`);
  }

  function applyScan(result: LookupResult) {
    const { scan, product } = result;
    const gs1 = scan.kind === "gs1" ? scan.data : null;
    let productRef: string;
    let label: string;
    if (product) {
      setExtraProducts((current) => (current.some((p) => p.id === product.id) ? current : [...current, product]));
      productRef = product.id;
      label = product.name;
    } else {
      const ean = gtinToEan(gs1?.gtin ?? (scan.kind === "plain" ? scan.code : ""));
      const existing = Object.values(draftsRef.current).find((draft) => ean && draft.ean === ean);
      const draft = existing ?? emptyDraft(ean);
      if (!existing) {
        commitDrafts({ ...draftsRef.current, [draft.id]: draft });
        toast.info("Nowy produkt — uzupełnij nazwę i ceny poniżej");
      }
      productRef = `${NEW_REF_PREFIX}${draft.id}`;
      label = draft.name.trim() || `Nowy produkt (EAN ${ean})`;
    }
    addLine(
      {
        productRef,
        batchNumber: gs1?.batchNumber ?? "",
        serialNumber: gs1?.serialNumber ?? "",
        expiryDate: gs1?.expiryDate ?? "",
      },
      label,
    );
  }

  async function lookup(code: string): Promise<LookupResult> {
    const cached = lookupCache.current.get(code);
    if (cached) return cached;
    const response = await fetch(`/api/admin/products/lookup?code=${encodeURIComponent(code)}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.message || "Nie udało się odczytać kodu");
    const value = { scan: result.scan, product: result.product } as LookupResult;
    lookupCache.current.set(code, value);
    return value;
  }

  // Skany przetwarzamy po kolei — szybkie skanowanie kolejnych opakowań nie gubi żadnego.
  function handleScan(raw: string) {
    const code = raw.replace(/[\r\n]/g, "").trim();
    setScanCode("");
    if (!code) return;
    scanQueue.current = scanQueue.current.then(async () => {
      try {
        const result = await lookup(code);
        if (!warehouseRef.current) {
          setPendingScans((current) => [...current, result]);
          return;
        }
        applyScan(result);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Nie udało się odczytać kodu");
      }
    });
  }

  const scanner = useScannerInput(handleScan);

  const initialScanHandled = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      initialScanHandled.current = false;
      return;
    }
    if (initialScanCode && !initialScanHandled.current) {
      initialScanHandled.current = true;
      handleScan(initialScanCode);
    }
    // handleScan korzysta z refów — wystarczy reagować na otwarcie okna i kod.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialScanCode]);

  function confirmPromptWarehouse() {
    if (!promptWarehouseId) return toast.error("Wybierz magazyn");
    chooseWarehouse(promptWarehouseId);
    pendingScans.forEach(applyScan);
    setPendingScans([]);
    window.setTimeout(() => scanInputRef.current?.focus(), 0);
  }

  function addManualLine() {
    if (!manualProduct) return toast.error("Wybierz produkt");
    const quantity = parseQuantity(manualQuantity);
    if (quantity <= 0) return toast.error("Podaj prawidłową ilość");
    let productRef = manualProduct;
    let label = productNames.get(manualProduct) ?? "Produkt";
    if (manualProduct === NEW_PRODUCT) {
      if (manualDraft.name.trim().length < 2) return toast.error("Podaj nazwę nowego produktu");
      const draft = { ...manualDraft };
      commitDrafts({ ...draftsRef.current, [draft.id]: draft });
      productRef = `${NEW_REF_PREFIX}${draft.id}`;
      label = "Nowy produkt";
    }
    addLine(
      { productRef, batchNumber: manualBatch, serialNumber: manualSerial, expiryDate: manualExpiry, quantity },
      label,
    );
    setManualProduct("");
    setManualDraft(emptyDraft(""));
    setManualQuantity("1");
    setManualExpiry("");
    setManualBatch("");
    setManualSerial("");
  }

  function updateLine(id: string, patch: Partial<ReceiptLine>) {
    commitLines(linesRef.current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function changeQuantity(id: string, delta: number) {
    const line = linesRef.current.find((current) => current.id === id);
    if (!line) return;
    const next = Math.max(0, parseQuantity(line.quantity) + delta);
    if (next === 0) return removeLine(id);
    updateLine(id, { quantity: String(Math.round(next * 100) / 100) });
  }

  function removeLine(id: string) {
    commitLines(linesRef.current.filter((line) => line.id !== id));
  }

  function updateDraft(id: string, patch: Partial<NewProductDraft>) {
    const draft = draftsRef.current[id];
    if (!draft) return;
    commitDrafts({ ...draftsRef.current, [id]: { ...draft, ...patch } });
  }

  function renderDraftFields(draft: NewProductDraft, patch: (patch: Partial<NewProductDraft>) => void) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor={`${draft.id}-name`}>Nazwa *</Label>
          <Input id={`${draft.id}-name`} value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${draft.id}-manufacturer`}>Firma (opcjonalnie)</Label>
          <Input id={`${draft.id}-manufacturer`} value={draft.manufacturer} onChange={(event) => patch({ manufacturer: event.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${draft.id}-category`}>Kategoria (opcjonalnie)</Label>
          <Select
            value={draft.catalogCategory || NO_CATEGORY}
            onValueChange={(value) => patch({ catalogCategory: value === NO_CATEGORY ? "" : value })}
          >
            <SelectTrigger id={`${draft.id}-category`}><SelectValue /></SelectTrigger>
            <SelectContent disablePortal>
              <SelectItem value={NO_CATEGORY}>— brak —</SelectItem>
              {categoryChoices(listOptions, draft.catalogCategory).map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${draft.id}-ean`}>EAN (opcjonalnie)</Label>
          <Input id={`${draft.id}-ean`} value={draft.ean} onChange={(event) => patch({ ean: event.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${draft.id}-sku`}>SKU (opcjonalnie)</Label>
          <Input id={`${draft.id}-sku`} value={draft.sku} onChange={(event) => patch({ sku: event.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Jednostka miary</Label>
          <Select value={draft.unit} onValueChange={(unit) => patch({ unit })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent disablePortal>
              {unitChoices(listOptions, draft.unit).map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Stawka VAT *</Label>
          <Select value={draft.vatRate} onValueChange={(vatRate) => patch({ vatRate })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent disablePortal>
              {VAT_RATES.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${draft.id}-purchase`}>Cena zakupu (PLN) *</Label>
          <Input id={`${draft.id}-purchase`} inputMode="decimal" value={draft.purchasePrice} onChange={(event) => patch({ purchasePrice: event.target.value })} placeholder="np. 500,00" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${draft.id}-sale`}>Cena sprzedaży brutto (PLN) *</Label>
          <Input id={`${draft.id}-sale`} inputMode="decimal" value={draft.salePrice} onChange={(event) => patch({ salePrice: event.target.value })} placeholder="np. 690,00" />
        </div>
      </div>
    );
  }

  const usedDrafts = Object.values(drafts).filter((draft) =>
    lines.some((line) => line.productRef === `${NEW_REF_PREFIX}${draft.id}`),
  );
  const totalQuantity = lines.reduce((sum, line) => sum + parseQuantity(line.quantity), 0);

  async function save() {
    if (!warehouseRef.current) return toast.error("Wybierz magazyn");
    if (linesRef.current.length === 0) return toast.error("Zeskanuj produkt albo dodaj pozycję ręcznie");
    if (linesRef.current.some((line) => parseQuantity(line.quantity) <= 0)) {
      return toast.error("Każda pozycja musi mieć ilość większą od zera");
    }

    const newProducts = new Map<string, Record<string, unknown>>();
    for (const draft of usedDrafts) {
      const label = draft.ean ? `nowego produktu (EAN ${draft.ean})` : "nowego produktu";
      if (draft.name.trim().length < 2) return toast.error(`Podaj nazwę ${label}`);
      const purchase = parsePLNToGrosze(draft.purchasePrice);
      const sale = parsePLNToGrosze(draft.salePrice);
      if (purchase == null || purchase < 0) return toast.error(`Podaj cenę zakupu ${label}`);
      if (sale == null || sale < 0) return toast.error(`Podaj cenę sprzedaży ${label}`);
      newProducts.set(draft.id, {
        name: draft.name.trim(),
        manufacturer: draft.manufacturer.trim() || undefined,
        ean: draft.ean.trim() || undefined,
        sku: draft.sku.trim() || undefined,
        catalogCategory: draft.catalogCategory.trim() || undefined,
        ...unitFromSelectValue(draft.unit),
        purchasePrice: purchase,
        salePrice: sale,
        vatRate: draft.vatRate,
      });
    }

    setSaving(true);
    let saved = 0;
    let savedQuantity = 0;
    try {
      // Każda pozycja to osobna partia — zapisujemy po kolei; nowy produkt powstaje przy
      // pierwszej swojej pozycji, a kolejne już się do niego odwołują.
      while (linesRef.current.length > 0) {
        const line = linesRef.current[0];
        const draftId = line.productRef.startsWith(NEW_REF_PREFIX) ? line.productRef.slice(NEW_REF_PREFIX.length) : null;
        const response = await fetch("/api/admin/stocks/adjust", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            productId: draftId ? undefined : line.productRef,
            newProduct: draftId ? newProducts.get(draftId) : undefined,
            warehouseId: warehouseRef.current,
            delta: parseQuantity(line.quantity),
            expiryDate: line.expiryDate || undefined,
            batchNumber: line.batchNumber.trim() || undefined,
            serialNumber: line.serialNumber.trim() || undefined,
            note: note.trim() || undefined,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) {
          throw new Error(`${lineProductName(line)}: ${result?.message || "nie udało się dodać pozycji"}`);
        }
        saved += 1;
        savedQuantity += parseQuantity(line.quantity);
        let remaining = linesRef.current.slice(1);
        if (draftId && result.product?.id) {
          const created = result.product as ProductOption;
          setExtraProducts((current) => [...current, created]);
          const ref = `${NEW_REF_PREFIX}${draftId}`;
          remaining = remaining.map((other) => (other.productRef === ref ? { ...other, productRef: created.id } : other));
        }
        commitLines(remaining);
      }

      toast.success(`Przyjęto na stan: ${savedQuantity} szt. w ${saved} ${saved === 1 ? "pozycji" : "pozycjach"}`);
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się dodać produktów");
      if (saved > 0) {
        toast.info(`Zapisano ${saved} ${saved === 1 ? "pozycję" : "pozycji"} — na liście zostały niezapisane`);
        await onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  const warehouseName =
    fixedWarehouseName ?? warehouses.find((warehouse) => warehouse.id === (fixedWarehouseId ?? warehouseId))?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>Dodaj produkty do magazynu</DialogTitle></DialogHeader>

        <div className="space-y-5">
          {pendingScans.length > 0 ? (
            <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
              <div className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Do którego magazynu przyjmujesz produkty? Wybór zostanie zapamiętany do zamknięcia okna.
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={promptWarehouseId} onValueChange={setPromptWarehouseId}>
                  <SelectTrigger className="sm:flex-1"><SelectValue placeholder="Wybierz magazyn" /></SelectTrigger>
                  <SelectContent disablePortal>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={confirmPromptWarehouse}>Dalej</Button>
                <Button type="button" variant="outline" onClick={() => setPendingScans([])}>Pomiń skan</Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="scan-code">Skanuj kod kreskowy (EAN lub GS1)</Label>
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="scan-code"
                  ref={scanInputRef}
                  autoFocus
                  autoComplete="off"
                  value={scanCode}
                  onChange={(event) => {
                    setScanCode(event.target.value);
                    scanner.trackChange(event.target.value);
                  }}
                  onKeyDown={scanner.onKeyDown}
                  placeholder="Skanuj kolejne opakowania — ilość policzy się sama"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Magazyn</Label>
              {fixedWarehouseId ? (
                <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm dark:border-white/10 dark:bg-white/5">
                  {warehouseName ?? "—"}
                </div>
              ) : (
                <Select value={warehouseId} onValueChange={chooseWarehouse}>
                  <SelectTrigger><SelectValue placeholder="Wybierz po pierwszym skanie" /></SelectTrigger>
                  <SelectContent disablePortal>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Pozycje przyjęcia</Label>
              {lines.length > 0 ? (
                <span className="text-sm text-slate-500">
                  Razem: <span className="font-semibold text-slate-800 dark:text-slate-100">{totalQuantity}</span> w {lines.length}{" "}
                  {lines.length === 1 ? "pozycji" : "pozycjach"}
                </span>
              ) : null}
            </div>
            {lines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-white/15">
                Zeskanuj opakowanie albo dodaj pozycję ręcznie poniżej. Kolejne skany tego samego opakowania
                (ta sama partia, numer seryjny i termin) zwiększają ilość.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-white/5">
                    <tr>
                      <th className="px-3 py-2">Produkt</th>
                      <th className="px-2 py-2">Partia</th>
                      <th className="px-2 py-2">Nr seryjny</th>
                      <th className="px-2 py-2">Termin ważności</th>
                      <th className="px-2 py-2">Ilość</th>
                      <th className="w-10 px-2 py-2" aria-label="Usuń" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr
                        key={line.id}
                        className={
                          "border-t border-slate-100 dark:border-white/10 " +
                          (line.id === lastLineId ? "bg-emerald-50/70 dark:bg-emerald-500/10" : "")
                        }
                      >
                        <td className="px-3 py-2 font-medium">
                          {lineProductName(line)}
                          {line.productRef.startsWith(NEW_REF_PREFIX) ? (
                            <div className="text-xs font-normal text-amber-700 dark:text-amber-300">nowy produkt</div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label="Numer partii"
                            value={line.batchNumber}
                            onChange={(event) => updateLine(line.id, { batchNumber: event.target.value })}
                            onBlur={() => commitLines(mergeDuplicateLines(linesRef.current))}
                            placeholder="auto"
                            className="h-9"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label="Numer seryjny"
                            value={line.serialNumber}
                            onChange={(event) => updateLine(line.id, { serialNumber: event.target.value })}
                            onBlur={() => commitLines(mergeDuplicateLines(linesRef.current))}
                            className="h-9"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            aria-label="Termin ważności"
                            type="date"
                            value={line.expiryDate}
                            title={formatExpiry(line.expiryDate)}
                            onChange={(event) => {
                              updateLine(line.id, { expiryDate: event.target.value });
                              commitLines(mergeDuplicateLines(linesRef.current));
                            }}
                            className="h-9"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => changeQuantity(line.id, -1)}
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                              aria-label="Zmniejsz ilość"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <Input
                              aria-label="Ilość"
                              inputMode="decimal"
                              value={line.quantity}
                              onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                              className="h-9 w-16 text-center"
                            />
                            <button
                              type="button"
                              onClick={() => changeQuantity(line.id, 1)}
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                              aria-label="Zwiększ ilość"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            className="text-slate-400 hover:text-red-600"
                            aria-label="Usuń pozycję"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {usedDrafts.map((draft) => (
            <div key={draft.id} className="space-y-3 rounded-xl border border-amber-200 p-4 dark:border-amber-500/30">
              <div className="text-sm font-semibold">
                Nowy produkt{draft.ean ? ` — EAN ${draft.ean}` : ""}
              </div>
              {renderDraftFields(draft, (patch) => updateDraft(draft.id, patch))}
            </div>
          ))}

          <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
            <div className="text-sm font-medium">Dodaj pozycję ręcznie (bez czytnika)</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Produkt</Label>
                <Select value={manualProduct} onValueChange={setManualProduct}>
                  <SelectTrigger><SelectValue placeholder="Wybierz produkt" /></SelectTrigger>
                  <SelectContent disablePortal>
                    <SelectItem value={NEW_PRODUCT}>+ Nowy produkt</SelectItem>
                    {productOptions.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.sku ? `${product.sku} • ` : ""}{product.name}{product.manufacturer ? ` • ${product.manufacturer}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <fieldset
                disabled={manualProduct !== NEW_PRODUCT}
                className={`min-w-0 sm:col-span-2 space-y-1 transition ${manualProduct !== NEW_PRODUCT ? "pointer-events-none select-none opacity-50 grayscale" : ""}`}
                aria-label="Dane nowego produktu"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nowy produkt</div>
                {renderDraftFields(manualDraft, (patch) => setManualDraft((current) => ({ ...current, ...patch })))}
              </fieldset>
              <div className="space-y-1">
                <Label htmlFor="manual-quantity">Ilość</Label>
                <Input id="manual-quantity" inputMode="decimal" value={manualQuantity} onChange={(event) => setManualQuantity(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manual-expiry">Termin ważności (opcjonalnie)</Label>
                <Input id="manual-expiry" type="date" value={manualExpiry} onChange={(event) => setManualExpiry(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manual-batch">Numer partii (opcjonalnie)</Label>
                <Input id="manual-batch" value={manualBatch} onChange={(event) => setManualBatch(event.target.value)} placeholder="Zostanie wygenerowany automatycznie" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manual-serial">Numer seryjny (opcjonalnie)</Label>
                <Input id="manual-serial" value={manualSerial} onChange={(event) => setManualSerial(event.target.value)} />
              </div>
              <div className="flex justify-end sm:col-span-2">
                <Button type="button" variant="outline" onClick={addManualLine}>Dodaj pozycję</Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-stock-note">Notatka do przyjęcia (opcjonalnie)</Label>
            <Input id="new-stock-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Np. numer faktury od dostawcy" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Anuluj</Button>
          <Button
            onClick={save}
            disabled={saving || lines.length === 0 || !warehouseId}
            className="bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:text-white"
          >
            {saving ? "Zapisywanie..." : lines.length > 0 ? `Przyjmij na stan (${totalQuantity})` : "Przyjmij na stan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
