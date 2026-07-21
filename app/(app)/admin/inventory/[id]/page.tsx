"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  ChevronsUpDown,
  CircleHelp,
  Minus,
  PackagePlus,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AdminAddProductDialog } from "@/components/admin-add-product-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

async function fetcher(url: string) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || "Nie udało się pobrać magazynu");
  return data;
}

type Warehouse = { id: string; name: string };

type CatalogProduct = {
  id: string;
  name: string;
  sku: string | null;
  manufacturer: string | null;
};

type InventoryProduct = {
  productId: string;
  sku: string;
  name: string;
  manufacturer: string | null;
  ean: string | null;
  catalogCategory: string | null;
  quantity: number;
  purchasePrice: number | null;
  salePrice: number | null;
  expiryDate: string | null;
  lotsCount: number;
  weeklyUsage: number;
  coverageDays: number | null;
  isLowStock: boolean;
  isShortExpiry: boolean;
  status: "Aktywny" | "Niski stan" | "Brak";
};

type SortKey = "sku" | "name" | "manufacturer" | "ean" | "catalogCategory" | "quantity" | "purchasePrice" | "salePrice" | "expiryDate" | "status";
type SortDirection = "asc" | "desc";
type AdjustmentMode = "add" | "remove";
type MobileProductFilter = "all" | "low" | "missing" | "expiring";

function money(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value / 100);
}

function quantity(value: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(value);
}

function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pl-PL").format(new Date(value));
}

function sortValue(product: InventoryProduct, key: SortKey): string | number | null {
  switch (key) {
    case "sku": return product.sku;
    case "name": return product.name;
    case "manufacturer": return product.manufacturer;
    case "ean": return product.ean;
    case "catalogCategory": return product.catalogCategory;
    case "quantity": return product.quantity;
    case "purchasePrice": return product.purchasePrice;
    case "salePrice": return product.salePrice;
    case "expiryDate": return product.expiryDate ? new Date(product.expiryDate).getTime() : null;
    case "status": return product.status;
  }
}

function SortableHead({
  label,
  column,
  activeColumn,
  direction,
  onSort,
}: {
  label: string;
  column: SortKey;
  activeColumn: SortKey;
  direction: SortDirection;
  onSort: (column: SortKey) => void;
}) {
  const active = activeColumn === column;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <TableHead aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="flex w-full items-center gap-1.5 whitespace-nowrap text-left transition-colors hover:text-slate-900 dark:hover:text-white"
      >
        {label}
        <Icon className={active ? "h-3.5 w-3.5 text-teal-600 dark:text-teal-300" : "h-3.5 w-3.5 text-slate-400"} />
      </button>
    </TableHead>
  );
}

function StatCard({ title, value, hint }: { title: string; value: React.ReactNode; hint: string }) {
  return (
    <Card className="border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
      <CardContent className="p-5">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</div>
        <div className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</div>
        <div className="mt-1 text-xs text-slate-400">{hint}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: InventoryProduct["status"] }) {
  const styles = status === "Brak"
    ? "bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-200"
    : status === "Niski stan"
      ? "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
      : "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200";

  return <Badge className={styles}>{status}</Badge>;
}

export default function WarehouseDetailsPage({ params }: { params: { id: string } }) {
  const { data, error, isLoading, mutate } = useSWR(`/api/admin/inventory/${params.id}`, fetcher);
  const products: InventoryProduct[] = data?.products ?? [];
  const catalogProducts: CatalogProduct[] = data?.catalogProducts ?? [];
  const warehouses: Warehouse[] = data?.warehouses ?? [];
  const warehouse: Warehouse | undefined = data?.warehouse;
  const kpis = data?.kpis;

  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");
  const [addProductOpen, setAddProductOpen] = React.useState(false);
  const [mobileFilter, setMobileFilter] = React.useState<MobileProductFilter>("all");
  const [mobileManufacturer, setMobileManufacturer] = React.useState("Wszystkie");
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);

  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [adjustMode, setAdjustMode] = React.useState<AdjustmentMode>("add");
  const [adjustProductLocked, setAdjustProductLocked] = React.useState(false);
  const [adjustProductId, setAdjustProductId] = React.useState("");
  const [adjustQuantity, setAdjustQuantity] = React.useState("1");
  const [expiryDate, setExpiryDate] = React.useState("");
  const [batchNumber, setBatchNumber] = React.useState("");
  const [adjustNote, setAdjustNote] = React.useState("");
  const [adjustSaving, setAdjustSaving] = React.useState(false);

  const [transferOpen, setTransferOpen] = React.useState(false);
  const [transferProduct, setTransferProduct] = React.useState<InventoryProduct | null>(null);
  const [destinationId, setDestinationId] = React.useState("");
  const [transferQuantity, setTransferQuantity] = React.useState("1");
  const [transferNote, setTransferNote] = React.useState("");
  const [transferSaving, setTransferSaving] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const visibleProducts = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pl");
    const filtered = products.filter((product) => {
      if (!normalizedQuery) return true;
      return `${product.sku} ${product.name} ${product.manufacturer ?? ""} ${product.ean ?? ""} ${product.catalogCategory ?? ""} ${product.status}`
        .toLocaleLowerCase("pl")
        .includes(normalizedQuery);
    });

    return [...filtered].sort((a, b) => {
      const first = sortValue(a, sortKey);
      const second = sortValue(b, sortKey);
      if (first == null && second == null) return 0;
      if (first == null) return 1;
      if (second == null) return -1;

      const result = typeof first === "number" && typeof second === "number"
        ? first - second
        : String(first).localeCompare(String(second), "pl", { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? result : -result;
    });
  }, [products, query, sortDirection, sortKey]);

  const manufacturers = React.useMemo(
    () => ["Wszystkie", ...Array.from(new Set(products.map((product) => product.manufacturer).filter(Boolean) as string[]))],
    [products],
  );

  const mobileBaseProducts = React.useMemo(
    () => visibleProducts.filter((product) =>
      mobileManufacturer === "Wszystkie" || product.manufacturer === mobileManufacturer
    ),
    [mobileManufacturer, visibleProducts],
  );

  const mobileProducts = React.useMemo(() => {
    if (mobileFilter === "low") {
      return mobileBaseProducts.filter((product) => product.status === "Niski stan");
    }
    if (mobileFilter === "missing") {
      return mobileBaseProducts.filter((product) => product.status === "Brak");
    }
    if (mobileFilter === "expiring") {
      return mobileBaseProducts.filter((product) => product.isShortExpiry);
    }
    return mobileBaseProducts;
  }, [mobileBaseProducts, mobileFilter]);

  const mobileCounts = React.useMemo(() => ({
    all: mobileBaseProducts.length,
    low: mobileBaseProducts.filter((product) => product.status === "Niski stan").length,
    missing: mobileBaseProducts.filter((product) => product.status === "Brak").length,
    expiring: mobileBaseProducts.filter((product) => product.isShortExpiry).length,
  }), [mobileBaseProducts]);

  function handleSort(column: SortKey) {
    if (column === sortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(column);
    setSortDirection("asc");
  }

  function openAdd(product?: InventoryProduct) {
    setAdjustMode("add");
    setAdjustProductLocked(Boolean(product));
    setAdjustProductId(product?.productId ?? "");
    setAdjustQuantity("1");
    setExpiryDate("");
    setBatchNumber("");
    setAdjustNote("");
    setAdjustOpen(true);
  }

  function openRemove(product: InventoryProduct) {
    setAdjustMode("remove");
    setAdjustProductLocked(true);
    setAdjustProductId(product.productId);
    setAdjustQuantity("1");
    setExpiryDate("");
    setBatchNumber("");
    setAdjustNote("");
    setAdjustOpen(true);
  }

  async function saveAdjustment() {
    const parsedQuantity = Number(adjustQuantity);
    if (!adjustProductId) return toast.error("Wybierz produkt");
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return toast.error("Podaj prawidłową ilość");
    if (adjustMode === "add" && !expiryDate) return toast.error("Podaj termin ważności");

    const currentProduct = products.find((product) => product.productId === adjustProductId);
    if (adjustMode === "remove" && (!currentProduct || parsedQuantity > currentProduct.quantity)) {
      return toast.error(`Możesz odjąć maksymalnie ${quantity(currentProduct?.quantity ?? 0)}`);
    }

    setAdjustSaving(true);
    try {
      const response = await fetch("/api/admin/stocks/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: adjustProductId,
          warehouseId: params.id,
          delta: adjustMode === "add" ? parsedQuantity : -parsedQuantity,
          expiryDate: adjustMode === "add" ? expiryDate : undefined,
          batchNumber: adjustMode === "add" ? batchNumber : undefined,
          note: adjustNote,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Nie udało się zmienić stanu");

      toast.success(adjustMode === "add" ? "Produkt został dodany" : "Stan produktu został zmniejszony");
      setAdjustOpen(false);
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zmienić stanu");
    } finally {
      setAdjustSaving(false);
    }
  }

  function openTransfer(product: InventoryProduct) {
    setTransferProduct(product);
    setDestinationId("");
    setTransferQuantity("1");
    setTransferNote("");
    setTransferOpen(true);
  }

  async function saveTransfer() {
    if (!transferProduct || !destinationId) return toast.error("Wybierz magazyn docelowy");
    const parsedQuantity = Number(transferQuantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > transferProduct.quantity) {
      return toast.error(`Podaj ilość od 0,01 do ${quantity(transferProduct.quantity)}`);
    }

    setTransferSaving(true);
    try {
      const response = await fetch("/api/admin/stocks/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: transferProduct.productId,
          fromWarehouseId: params.id,
          toWarehouseId: destinationId,
          quantity: parsedQuantity,
          note: transferNote,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Nie udało się przenieść produktu");

      toast.success("Produkt został przeniesiony");
      setTransferOpen(false);
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się przenieść produktu");
    } finally {
      setTransferSaving(false);
    }
  }

  async function removeProduct(product: InventoryProduct) {
    const confirmed = window.confirm(
      `Czy usunąć cały stan produktu „${product.name}” z magazynu „${warehouse?.name ?? ""}”?`,
    );
    if (!confirmed) return;

    setRemovingId(product.productId);
    try {
      const response = await fetch("/api/admin/stocks/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: product.productId,
          warehouseId: params.id,
          delta: -product.quantity,
          note: "Usunięcie produktu z magazynu",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Nie udało się usunąć produktu");

      toast.success("Produkt został usunięty z magazynu");
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się usunąć produktu");
    } finally {
      setRemovingId(null);
    }
  }

  if (isLoading) {
    return <div className="h-72 animate-pulse rounded-3xl bg-white/70 dark:bg-white/5" />;
  }

  if (error || !warehouse) {
    return (
      <div className="space-y-4">
        <Link href="/admin/inventory" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300">
          <ArrowLeft className="h-4 w-4" /> Wróć do magazynów
        </Link>
        <Card className="border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10">
          <CardContent className="p-5 text-sm text-red-700 dark:text-red-200">{error?.message || "Nie znaleziono magazynu"}</CardContent>
        </Card>
      </div>
    );
  }

  const selectedAdjustmentProduct = catalogProducts.find((product) => product.id === adjustProductId);
  const availableDestinations = warehouses.filter((item) => item.id !== params.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Link href="/admin/inventory" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Wszystkie magazyny
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{warehouse.name}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Niski stan oznacza zapas na mniej niż {data.settings.lowStockDays} dni, liczony według WOS z ostatnich {data.settings.wosWeeks} tygodni.
          </p>
        </div>
        <Button onClick={() => setAddProductOpen(true)} className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:text-white">
          <PackagePlus className="h-4 w-4" />
          Dodaj produkt
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Łączna wartość produktów" value={money(kpis?.totalValue ?? 0)} hint="według cen zakupu" />
        <StatCard title="Łączna liczba produktów" value={quantity(kpis?.totalQuantity ?? 0)} hint="wszystkie sztuki łącznie" />
        <StatCard title="Produkty z niskim stanem" value={kpis?.lowStockCount ?? 0} hint="mniej niż 14 dni zapasu" />
        <StatCard title="Produkty z krótkim terminem" value={kpis?.shortExpiryCount ?? 0} hint="termin krótszy niż 6 miesięcy" />
      </div>

      <section className="space-y-4 sm:hidden">
        <div className="flex items-stretch gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szukaj produktu, SKU lub firmy..."
            className="min-w-0 flex-1 rounded-xl"
          />
          <Button
            type="button"
            variant="outline"
            className="relative h-10 w-11 shrink-0 px-0"
            onClick={() => setMobileFiltersOpen((open) => !open)}
            aria-label="Pokaż filtry produktów"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {mobileManufacturer !== "Wszystkie" ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white">
                1
              </span>
            ) : null}
          </Button>
        </div>

        {mobileFiltersOpen ? (
          <Card className="space-y-4 border-slate-200 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-zinc-950">
            <div className="space-y-2">
              <Label>Firma / producent</Label>
              <Select value={mobileManufacturer} onValueChange={setMobileManufacturer}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] !bg-white dark:!bg-zinc-950">
                  {manufacturers.map((item) => (
                    <SelectItem
                      key={item}
                      value={item}
                      className="min-w-0 whitespace-normal break-words [&>span]:whitespace-normal [&>span]:break-words"
                    >
                      {item === "Wszystkie" ? "Wszystkie firmy" : item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sortowanie</Label>
              <Select
                value={`${sortKey}:${sortDirection}`}
                onValueChange={(value) => {
                  const [key, direction] = value.split(":") as [SortKey, SortDirection];
                  setSortKey(key);
                  setSortDirection(direction);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] !bg-white dark:!bg-zinc-950">
                  <SelectItem value="name:asc">Nazwa A–Z</SelectItem>
                  <SelectItem value="name:desc">Nazwa Z–A</SelectItem>
                  <SelectItem value="quantity:asc">Najmniejszy stan</SelectItem>
                  <SelectItem value="quantity:desc">Największy stan</SelectItem>
                  <SelectItem value="expiryDate:asc">Najkrótszy termin ważności</SelectItem>
                  <SelectItem value="salePrice:asc">Najniższa cena</SelectItem>
                  <SelectItem value="salePrice:desc">Najwyższa cena</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMobileManufacturer("Wszystkie")}
                disabled={mobileManufacturer === "Wszystkie"}
              >
                Wyczyść filtr
              </Button>
              <Button type="button" size="sm" onClick={() => setMobileFiltersOpen(false)}>
                Pokaż wyniki
              </Button>
            </div>
          </Card>
        ) : null}

        <div className="grid grid-cols-4 gap-2">
          {([
            ["all", "Wszystkie", mobileCounts.all],
            ["low", "Niski stan", mobileCounts.low],
            ["missing", "Brak", mobileCounts.missing],
            ["expiring", "Wygasa wkrótce", mobileCounts.expiring],
          ] as const).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMobileFilter(value)}
              className={
                "min-w-0 rounded-xl border px-1.5 py-2 text-center transition-colors " +
                (mobileFilter === value
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200"
                  : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-zinc-950 dark:text-slate-300")
              }
            >
              <span className="block text-[11px] font-medium leading-tight">{label}</span>
              <span className="mt-1 block text-[10px] opacity-70">{count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Lista produktów</h2>
            <div className="mt-0.5 text-xs text-slate-500">{mobileProducts.length} produktów</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSortKey("name");
              setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
            }}
            className="text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Nazwa {sortKey === "name" && sortDirection === "desc" ? "Z–A" : "A–Z"}
          </button>
        </div>

        {mobileProducts.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-500">
            {query ? "Brak produktów pasujących do wyszukiwania." : "Ten magazyn nie ma produktów spełniających wybrane filtry."}
          </Card>
        ) : (
          <div className="space-y-3">
            {mobileProducts.map((product) => (
              <Link
                key={product.productId}
                href={`/admin/products/${product.productId}`}
                className="block overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors active:bg-slate-50 dark:border-white/10 dark:bg-zinc-950 dark:active:bg-zinc-900"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="break-words font-semibold leading-5 text-slate-900 dark:text-white">
                      {product.name}
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                      <span className="max-w-full break-words">{product.manufacturer ?? "Brak firmy"}</span>
                      <span className="text-emerald-600">•</span>
                      <span>SKU: {product.sku}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    <div className="text-right">
                      <div className={
                        "rounded-lg px-2 py-1 text-[11px] font-semibold " +
                        (product.status === "Brak"
                          ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200"
                          : product.status === "Niski stan"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200"
                            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200")
                      }>
                        {product.status === "Brak" ? "Brak" : `${quantity(product.quantity)} szt.`}
                      </div>
                      {product.status === "Niski stan" ? (
                        <div className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-300">
                          Niski stan
                        </div>
                      ) : null}
                    </div>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 dark:border-white/10">
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400">Cena sprzedaży</div>
                    <div className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {money(product.salePrice)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400">Termin ważności</div>
                    <div className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {date(product.expiryDate)}
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center justify-end">
                    <span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-500 dark:bg-white/5 dark:text-slate-400">
                      WOS: {product.coverageDays == null ? "—" : `${quantity(product.coverageDays / 7)} tyg.`}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Card className="hidden border-white/60 bg-white/80 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55 sm:block">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-xl">Lista produktów</CardTitle>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Szukaj po nazwie, SKU, firmie..."
              className="w-full rounded-2xl sm:max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="SKU" column="sku" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Produkt" column="name" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Firma" column="manufacturer" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="EAN" column="ean" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Kategoria" column="catalogCategory" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Stan" column="quantity" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Cena zakupu" column="purchasePrice" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Cena sprzedaży" column="salePrice" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Termin ważności" column="expiryDate" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <TableHead className="w-20 whitespace-nowrap py-2">
                    <span
                      className="inline-flex items-center gap-1.5"
                      title="Przewidywany czas wystarczalności"
                    >
                      WOS
                      <CircleHelp
                        className="h-3.5 w-3.5 cursor-help text-slate-400 dark:text-slate-500"
                        aria-label="Przewidywany czas wystarczalności"
                      />
                    </span>
                  </TableHead>
                  <SortableHead label="Status" column="status" activeColumn={sortKey} direction={sortDirection} onSort={handleSort} />
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleProducts.map((product) => (
                  <TableRow key={product.productId}>
                    <TableCell className="whitespace-nowrap font-semibold">{product.sku}</TableCell>
                    <TableCell className="min-w-52 font-medium text-slate-900 dark:text-white">
                      <Link href={`/admin/products/${product.productId}`} className="hover:underline">
                        {product.name}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{product.manufacturer ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{product.ean ?? "—"}</TableCell>
                    <TableCell className="min-w-44">{product.catalogCategory ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium">{quantity(product.quantity)}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{money(product.purchasePrice)}</TableCell>
                    <TableCell className="whitespace-nowrap">{money(product.salePrice)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div>{date(product.expiryDate)}</div>
                      {product.lotsCount > 1 ? <div className="text-[11px] text-slate-400">najbliższy z {product.lotsCount} terminów</div> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {product.coverageDays == null ? "—" : `${quantity(product.coverageDays / 7)} tyg.`}
                    </TableCell>
                    <TableCell><StatusBadge status={product.status} /></TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => openAdd(product)} title="Dodaj sztuki" aria-label={`Dodaj stan: ${product.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10">
                          <Plus className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => openRemove(product)} title="Odejmij sztuki" aria-label={`Odejmij stan: ${product.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-amber-700 transition hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10">
                          <Minus className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => openTransfer(product)} title="Przenieś do innego magazynu" aria-label={`Przenieś: ${product.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-blue-700 transition hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10">
                          <ArrowRightLeft className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => removeProduct(product)} disabled={removingId === product.productId} title="Usuń z magazynu" aria-label={`Usuń z magazynu: ${product.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50 disabled:opacity-40 dark:text-red-300 dark:hover:bg-red-500/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}

                {visibleProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-28 text-center text-slate-500">
                      {query ? "Brak produktów pasujących do wyszukiwania." : "Ten magazyn nie ma jeszcze produktów."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AdminAddProductDialog
        open={addProductOpen}
        onOpenChange={setAddProductOpen}
        products={catalogProducts}
        warehouses={warehouses}
        fixedWarehouseId={params.id}
        fixedWarehouseName={warehouse.name}
        onSaved={() => mutate()}
      />

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{adjustMode === "add" ? "Dodaj produkt do magazynu" : "Odejmij produkt z magazynu"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Produkt</Label>
              {adjustProductLocked ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
                  {selectedAdjustmentProduct?.name ?? "—"}
                </div>
              ) : (
                <Select value={adjustProductId} onValueChange={setAdjustProductId}>
                  <SelectTrigger><SelectValue placeholder="Wybierz produkt" /></SelectTrigger>
                  <SelectContent disablePortal>
                    {catalogProducts.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.sku ? `${product.sku} • ` : ""}{product.name}{product.manufacturer ? ` • ${product.manufacturer}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-quantity">Ilość</Label>
              <Input id="adjust-quantity" type="number" min="0.01" step="0.01" value={adjustQuantity} onChange={(event) => setAdjustQuantity(event.target.value)} />
            </div>
            {adjustMode === "add" ? (
              <div className="space-y-2">
                <Label htmlFor="expiry-date">Termin ważności</Label>
                <Input id="expiry-date" type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
              </div>
            ) : null}
            {adjustMode === "add" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="batch-number">Numer partii (opcjonalnie)</Label>
                <Input id="batch-number" value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} placeholder="Zostanie wygenerowany automatycznie" />
              </div>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="adjust-note">Notatka (opcjonalnie)</Label>
              <Input id="adjust-note" value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Anuluj</Button>
            <Button onClick={saveAdjustment} disabled={adjustSaving || !adjustProductId || (adjustMode === "add" && !expiryDate)} className="bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:text-white">
              {adjustSaving ? "Zapisywanie..." : adjustMode === "add" ? "Dodaj" : "Odejmij"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Przenieś produkt do innego magazynu</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
              <div className="font-medium">{transferProduct?.name}</div>
              <div className="text-xs text-slate-500">Dostępne: {quantity(transferProduct?.quantity ?? 0)}</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Magazyn docelowy</Label>
                <Select value={destinationId} onValueChange={setDestinationId}>
                  <SelectTrigger><SelectValue placeholder="Wybierz magazyn" /></SelectTrigger>
                  <SelectContent disablePortal>
                    {availableDestinations.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-quantity">Ilość</Label>
                <Input id="transfer-quantity" type="number" min="0.01" max={transferProduct?.quantity} step="0.01" value={transferQuantity} onChange={(event) => setTransferQuantity(event.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="transfer-note">Notatka (opcjonalnie)</Label>
                <Input id="transfer-note" value={transferNote} onChange={(event) => setTransferNote(event.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Anuluj</Button>
            <Button onClick={saveTransfer} disabled={transferSaving || !destinationId} className="bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:text-white">
              {transferSaving ? "Przenoszenie..." : "Przenieś produkt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
