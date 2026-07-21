"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowDown,
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
  if (!response.ok) throw new Error(data?.message || "Nie udało się pobrać produktów");
  return data;
}

type Warehouse = {
  id: string;
  name: string;
};

type ProductStock = {
  id: string;
  warehouseId: string;
  quantity: string;
  warehouse: Warehouse;
};

type ProductLot = {
  id: string;
  warehouseId: string;
  quantity: string;
  expiryDate: string | null;
  warehouse: Warehouse;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  ean: string | null;
  manufacturer: string | null;
  catalogCategory: string | null;
  purchasePrice: number | null;
  salePrice: number | null;
  isActive: boolean;
  wosWeeks: number | null;
  lots: ProductLot[];
  stocks: ProductStock[];
};

type ProductStatus = "Aktywny" | "Niski stan" | "Brak";
type SortKey =
  | "sku"
  | "name"
  | "manufacturer"
  | "ean"
  | "catalogCategory"
  | "stock"
  | "purchasePrice"
  | "salePrice"
  | "expiryDate"
  | "status";
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

function stockQuantity(product: Product, warehouseId: string) {
  return Number(product.stocks.find((stock) => stock.warehouseId === warehouseId)?.quantity ?? 0);
}

function totalQuantity(product: Product) {
  return product.stocks.reduce((sum, stock) => sum + Number(stock.quantity), 0);
}

function nearestExpiry(product: Product) {
  const activeLots = product.lots.filter((lot) => Number(lot.quantity) > 0 && lot.expiryDate);
  if (activeLots.length === 0) return null;
  return activeLots.reduce((nearest, lot) =>
    new Date(lot.expiryDate as string).getTime() < new Date(nearest.expiryDate as string).getTime() ? lot : nearest
  ).expiryDate;
}

function expiresWithinSixMonths(product: Product) {
  const expiry = nearestExpiry(product);
  if (!expiry) return false;
  const limit = new Date();
  limit.setMonth(limit.getMonth() + 6);
  return new Date(expiry).getTime() <= limit.getTime();
}

function productStatus(product: Product): ProductStatus {
  const total = totalQuantity(product);
  if (total <= 0) return "Brak";
  if (total <= 2) return "Niski stan";
  return "Aktywny";
}

function sortValue(product: Product, key: SortKey): string | number | null {
  switch (key) {
    case "sku": return product.sku ?? product.id.slice(0, 8);
    case "name": return product.name;
    case "manufacturer": return product.manufacturer;
    case "ean": return product.ean;
    case "catalogCategory": return product.catalogCategory;
    case "stock": return totalQuantity(product);
    case "purchasePrice": return product.purchasePrice;
    case "salePrice": return product.salePrice;
    case "expiryDate": {
      const expiry = nearestExpiry(product);
      return expiry ? new Date(expiry).getTime() : null;
    }
    case "status": return productStatus(product);
  }
}

function SortableHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <TableHead aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
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

function StatusBadge({ status }: { status: ProductStatus }) {
  const styles = status === "Brak"
    ? "bg-red-100 text-red-900 dark:bg-red-500/15 dark:text-red-200"
    : status === "Niski stan"
      ? "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
      : "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200";

  return <Badge className={styles}>{status}</Badge>;
}

function StockBreakdown({ product, warehouses }: { product: Product; warehouses: Warehouse[] }) {
  const rows = warehouses.map((warehouse) => ({
    ...warehouse,
    quantity: stockQuantity(product, warehouse.id),
  }));
  const title = rows.map((row) => `${row.name}: ${quantity(row.quantity)}`).join("\n");

  return (
    <div className="group relative inline-flex" title={title}>
      <span className="cursor-help rounded-lg px-2 py-1 font-medium transition-colors hover:bg-teal-50 hover:text-teal-800 dark:hover:bg-teal-500/10 dark:hover:text-teal-200">
        {quantity(totalQuantity(product))}
      </span>
      <div className="pointer-events-none absolute left-0 top-full z-40 mt-1 hidden min-w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl group-hover:block dark:border-white/10 dark:bg-slate-950">
        <div className="mb-2 font-semibold text-slate-900 dark:text-white">Stan w magazynach</div>
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-6">
              <span className="text-slate-500 dark:text-slate-400">{row.name}</span>
              <span className="font-semibold text-slate-900 dark:text-white">{quantity(row.quantity)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/products", fetcher);
  const products: Product[] = data?.products ?? [];
  const warehouses: Warehouse[] = data?.warehouses ?? [];

  const [query, setQuery] = React.useState("");
  const [manufacturer, setManufacturer] = React.useState("Wszystkie");
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");
  const [addProductOpen, setAddProductOpen] = React.useState(false);
  const [mobileFilter, setMobileFilter] = React.useState<MobileProductFilter>("all");
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);

  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [adjustMode, setAdjustMode] = React.useState<AdjustmentMode>("add");
  const [adjustProduct, setAdjustProduct] = React.useState<Product | null>(null);
  const [adjustWarehouseId, setAdjustWarehouseId] = React.useState("");
  const [adjustQuantity, setAdjustQuantity] = React.useState("1");
  const [expiryDate, setExpiryDate] = React.useState("");
  const [batchNumber, setBatchNumber] = React.useState("");
  const [adjustNote, setAdjustNote] = React.useState("");
  const [adjustSaving, setAdjustSaving] = React.useState(false);

  const [transferOpen, setTransferOpen] = React.useState(false);
  const [transferProduct, setTransferProduct] = React.useState<Product | null>(null);
  const [fromWarehouseId, setFromWarehouseId] = React.useState("");
  const [toWarehouseId, setToWarehouseId] = React.useState("");
  const [transferQuantity, setTransferQuantity] = React.useState("1");
  const [transferNote, setTransferNote] = React.useState("");
  const [transferSaving, setTransferSaving] = React.useState(false);

  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [removeProduct, setRemoveProduct] = React.useState<Product | null>(null);
  const [removeWarehouseId, setRemoveWarehouseId] = React.useState("");
  const [removeSaving, setRemoveSaving] = React.useState(false);

  const manufacturers = React.useMemo(
    () => ["Wszystkie", ...Array.from(new Set(products.map((product) => product.manufacturer).filter(Boolean) as string[]))],
    [products],
  );

  const visibleProducts = React.useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pl");
    const filtered = products.filter((product) => {
      const matchesQuery = !normalizedQuery || `${product.sku ?? ""} ${product.name} ${product.manufacturer ?? ""} ${product.ean ?? ""} ${product.catalogCategory ?? ""} ${productStatus(product)}`
        .toLocaleLowerCase("pl")
        .includes(normalizedQuery);
      const matchesManufacturer = manufacturer === "Wszystkie" || product.manufacturer === manufacturer;
      return matchesQuery && matchesManufacturer;
    });

    return [...filtered].sort((firstProduct, secondProduct) => {
      const first = sortValue(firstProduct, sortKey);
      const second = sortValue(secondProduct, sortKey);
      if (first == null && second == null) return 0;
      if (first == null) return 1;
      if (second == null) return -1;

      const result = typeof first === "number" && typeof second === "number"
        ? first - second
        : String(first).localeCompare(String(second), "pl", { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? result : -result;
    });
  }, [manufacturer, products, query, sortDirection, sortKey]);

  const mobileProducts = React.useMemo(() => {
    if (mobileFilter === "low") {
      return visibleProducts.filter((product) => productStatus(product) === "Niski stan");
    }
    if (mobileFilter === "missing") {
      return visibleProducts.filter((product) => productStatus(product) === "Brak");
    }
    if (mobileFilter === "expiring") {
      return visibleProducts.filter(expiresWithinSixMonths);
    }
    return visibleProducts;
  }, [mobileFilter, visibleProducts]);

  const mobileCounts = React.useMemo(() => ({
    all: visibleProducts.length,
    low: visibleProducts.filter((product) => productStatus(product) === "Niski stan").length,
    missing: visibleProducts.filter((product) => productStatus(product) === "Brak").length,
    expiring: visibleProducts.filter(expiresWithinSixMonths).length,
  }), [visibleProducts]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  }

  function openAdjustment(mode: AdjustmentMode, product: Product) {
    setAdjustMode(mode);
    setAdjustProduct(product);
    setAdjustWarehouseId("");
    setAdjustQuantity("1");
    setExpiryDate("");
    setBatchNumber("");
    setAdjustNote("");
    setAdjustOpen(true);
  }

  async function saveAdjustment() {
    if (!adjustProduct || !adjustWarehouseId) return toast.error("Wybierz magazyn");
    const parsedQuantity = Number(adjustQuantity.replace(",", "."));
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return toast.error("Podaj prawidłową ilość");
    if (adjustMode === "add" && !expiryDate) return toast.error("Podaj termin ważności");

    const available = stockQuantity(adjustProduct, adjustWarehouseId);
    if (adjustMode === "remove" && parsedQuantity > available) {
      return toast.error(`Możesz odjąć maksymalnie ${quantity(available)}`);
    }

    setAdjustSaving(true);
    try {
      const response = await fetch("/api/admin/stocks/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: adjustProduct.id,
          warehouseId: adjustWarehouseId,
          delta: adjustMode === "add" ? parsedQuantity : -parsedQuantity,
          expiryDate: adjustMode === "add" ? expiryDate : undefined,
          batchNumber: adjustMode === "add" ? batchNumber : undefined,
          note: adjustNote,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Nie udało się zmienić stanu");

      toast.success(adjustMode === "add" ? "Produkt został dodany do magazynu" : "Stan produktu został zmniejszony");
      setAdjustOpen(false);
      await mutate();
    } catch (caughtError) {
      toast.error(caughtError instanceof Error ? caughtError.message : "Nie udało się zmienić stanu");
    } finally {
      setAdjustSaving(false);
    }
  }

  function openTransfer(product: Product) {
    setTransferProduct(product);
    setFromWarehouseId("");
    setToWarehouseId("");
    setTransferQuantity("1");
    setTransferNote("");
    setTransferOpen(true);
  }

  async function saveTransfer() {
    if (!transferProduct || !fromWarehouseId || !toWarehouseId) {
      return toast.error("Wybierz magazyn źródłowy i docelowy");
    }
    if (fromWarehouseId === toWarehouseId) return toast.error("Magazyny muszą być różne");

    const parsedQuantity = Number(transferQuantity.replace(",", "."));
    const available = stockQuantity(transferProduct, fromWarehouseId);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > available) {
      return toast.error(`Podaj ilość od 0,01 do ${quantity(available)}`);
    }

    setTransferSaving(true);
    try {
      const response = await fetch("/api/admin/stocks/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: transferProduct.id,
          fromWarehouseId,
          toWarehouseId,
          quantity: parsedQuantity,
          note: transferNote,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Nie udało się przenieść produktu");

      toast.success("Produkt został przeniesiony");
      setTransferOpen(false);
      await mutate();
    } catch (caughtError) {
      toast.error(caughtError instanceof Error ? caughtError.message : "Nie udało się przenieść produktu");
    } finally {
      setTransferSaving(false);
    }
  }

  function openRemove(product: Product) {
    setRemoveProduct(product);
    setRemoveWarehouseId("");
    setRemoveOpen(true);
  }

  async function saveRemove() {
    if (!removeProduct || !removeWarehouseId) return toast.error("Wybierz magazyn");
    const available = stockQuantity(removeProduct, removeWarehouseId);
    if (available <= 0) return toast.error("W wybranym magazynie nie ma tego produktu");

    const warehouse = warehouses.find((item) => item.id === removeWarehouseId);
    const confirmed = window.confirm(
      `Czy usunąć cały stan produktu „${removeProduct.name}” z magazynu „${warehouse?.name ?? ""}”?`,
    );
    if (!confirmed) return;

    setRemoveSaving(true);
    try {
      const response = await fetch("/api/admin/stocks/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: removeProduct.id,
          warehouseId: removeWarehouseId,
          delta: -available,
          note: "Usunięcie produktu z magazynu",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Nie udało się usunąć produktu");

      toast.success("Produkt został usunięty z wybranego magazynu");
      setRemoveOpen(false);
      await mutate();
    } catch (caughtError) {
      toast.error(caughtError instanceof Error ? caughtError.message : "Nie udało się usunąć produktu");
    } finally {
      setRemoveSaving(false);
    }
  }

  if (isLoading) {
    return <div className="h-72 animate-pulse rounded-3xl bg-white/70 dark:bg-white/5" />;
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10">
        <CardContent className="p-5 text-sm text-red-700 dark:text-red-200">{error.message}</CardContent>
      </Card>
    );
  }

  const lowStockCount = products.filter(
    (product) => product.wosWeeks != null && product.wosWeeks * 7 < 14,
  ).length;
  const shortExpiryCount = products.filter(expiresWithinSixMonths).length;
  const totalProductsQuantity = products.reduce(
    (sum, product) => sum + totalQuantity(product),
    0,
  );
  const totalValue = products.reduce(
    (sum, product) => sum + (product.purchasePrice ?? 0) * totalQuantity(product),
    0,
  );
  const adjustmentAvailable = adjustProduct && adjustWarehouseId
    ? stockQuantity(adjustProduct, adjustWarehouseId)
    : 0;
  const transferSourceStocks = transferProduct
    ? transferProduct.stocks.filter((stock) => Number(stock.quantity) > 0)
    : [];
  const transferAvailable = transferProduct && fromWarehouseId
    ? stockQuantity(transferProduct, fromWarehouseId)
    : 0;
  const transferDestinations = warehouses.filter((warehouse) => warehouse.id !== fromWarehouseId);
  const removeSourceStocks = removeProduct
    ? removeProduct.stocks.filter((stock) => Number(stock.quantity) > 0)
    : [];
  const removeAvailable = removeProduct && removeWarehouseId
    ? stockQuantity(removeProduct, removeWarehouseId)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Katalog produktów</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm text-slate-500 dark:text-slate-400">Łączne dane ze wszystkich magazynów</div>
          <Button onClick={() => setAddProductOpen(true)} className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:text-white">
            <PackagePlus className="h-4 w-4" />
            Dodaj produkt
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Łączna wartość produktów" value={money(totalValue)} hint="według cen zakupu" />
        <StatCard title="Łączna liczba produktów" value={quantity(totalProductsQuantity)} hint="wszystkie sztuki łącznie" />
        <StatCard title="Produkty z niskim stanem" value={lowStockCount} hint="mniej niż 14 dni zapasu" />
        <StatCard title="Produkty z krótkim terminem" value={shortExpiryCount} hint="termin krótszy niż 6 miesięcy" />
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
            {manufacturer !== "Wszystkie" ? (
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
              <Select value={manufacturer} onValueChange={setManufacturer}>
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
                  <SelectItem value="stock:asc">Najmniejszy stan</SelectItem>
                  <SelectItem value="stock:desc">Największy stan</SelectItem>
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
                onClick={() => setManufacturer("Wszystkie")}
                disabled={manufacturer === "Wszystkie"}
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
            Brak produktów pasujących do wybranych filtrów.
          </Card>
        ) : (
          <div className="space-y-3">
            {mobileProducts.map((product) => {
              const total = totalQuantity(product);
              const expiry = nearestExpiry(product);
              const status = productStatus(product);

              return (
                <Link
                  key={product.id}
                  href={`/admin/products/${product.id}`}
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
                        <span>SKU: {product.sku ?? product.id.slice(0, 8)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      <div className="text-right">
                        <div className={
                          "rounded-lg px-2 py-1 text-[11px] font-semibold " +
                          (status === "Brak"
                            ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200"
                            : status === "Niski stan"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200"
                              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200")
                        }>
                          {status === "Brak" ? "Brak" : `${quantity(total)} szt.`}
                        </div>
                        {status === "Niski stan" ? (
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
                        {date(expiry)}
                      </div>
                    </div>
                    <div className="col-span-2 flex items-center justify-end">
                      <span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-500 dark:bg-white/5 dark:text-slate-400">
                        WOS: {product.wosWeeks == null ? "—" : `${quantity(product.wosWeeks)} tyg.`}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
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
              placeholder="Szukaj po nazwie, SKU, EAN, firmie..."
              className="w-full rounded-2xl sm:max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="SKU" sortKey="sku" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Produkt" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Firma" sortKey="manufacturer" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="EAN" sortKey="ean" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Kategoria" sortKey="catalogCategory" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Stan" sortKey="stock" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Cena zakupu" sortKey="purchasePrice" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Cena sprzedaży" sortKey="salePrice" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <SortableHead label="Termin ważności" sortKey="expiryDate" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
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
                  <SortableHead label="Status" sortKey="status" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleProducts.map((product) => {
                  const total = totalQuantity(product);
                  const expiry = nearestExpiry(product);
                  const lotsCount = product.lots.filter((lot) => Number(lot.quantity) > 0).length;
                  const status = productStatus(product);
                  const hasStock = total > 0;

                  return (
                    <TableRow key={product.id}>
                      <TableCell className="whitespace-nowrap font-semibold">{product.sku ?? product.id.slice(0, 8)}</TableCell>
                      <TableCell className="min-w-52 font-medium text-slate-900 dark:text-white">
                        <Link href={`/admin/products/${product.id}`} className="hover:underline">{product.name}</Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{product.manufacturer ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{product.ean ?? "—"}</TableCell>
                      <TableCell className="min-w-44">{product.catalogCategory ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <StockBreakdown product={product} warehouses={warehouses} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{money(product.purchasePrice)}</TableCell>
                      <TableCell className="whitespace-nowrap">{money(product.salePrice)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div>{date(expiry)}</div>
                        {lotsCount > 1 ? <div className="text-[11px] text-slate-400">najbliższy z {lotsCount} terminów</div> : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {product.wosWeeks == null ? "—" : `${quantity(product.wosWeeks)} tyg.`}
                      </TableCell>
                      <TableCell><StatusBadge status={status} /></TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openAdjustment("add", product)}
                            title="Dodaj sztuki do magazynu"
                            aria-label={`Dodaj stan: ${product.name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openAdjustment("remove", product)}
                            disabled={!hasStock}
                            title="Odejmij sztuki z magazynu"
                            aria-label={`Odejmij stan: ${product.name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-30 dark:text-amber-300 dark:hover:bg-amber-500/10"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openTransfer(product)}
                            disabled={!hasStock}
                            title="Przenieś między magazynami"
                            aria-label={`Przenieś: ${product.name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-30 dark:text-blue-300 dark:hover:bg-blue-500/10"
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openRemove(product)}
                            disabled={!hasStock}
                            title="Usuń cały stan z wybranego magazynu"
                            aria-label={`Usuń z magazynu: ${product.name}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 dark:text-red-300 dark:hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {visibleProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-28 text-center text-slate-500">
                      Brak produktów pasujących do wybranych filtrów.
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
        products={products}
        warehouses={warehouses}
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
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
                {adjustProduct?.name ?? "—"}
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{adjustMode === "add" ? "Magazyn docelowy" : "Magazyn źródłowy"}</Label>
              <Select value={adjustWarehouseId} onValueChange={setAdjustWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Wybierz magazyn" /></SelectTrigger>
                <SelectContent disablePortal>
                  {(adjustMode === "remove" && adjustProduct
                    ? adjustProduct.stocks.filter((stock) => Number(stock.quantity) > 0).map((stock) => stock.warehouse)
                    : warehouses
                  ).map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {adjustMode === "remove" && adjustWarehouseId ? (
                <div className="text-xs text-slate-500">Dostępne: {quantity(adjustmentAvailable)}</div>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-adjust-quantity">Ilość</Label>
              <Input
                id="catalog-adjust-quantity"
                type="number"
                min="0.01"
                step="0.01"
                max={adjustMode === "remove" ? adjustmentAvailable : undefined}
                value={adjustQuantity}
                onChange={(event) => setAdjustQuantity(event.target.value)}
              />
            </div>
            {adjustMode === "add" ? (
              <div className="space-y-2">
                <Label htmlFor="catalog-expiry-date">Termin ważności</Label>
                <Input id="catalog-expiry-date" type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
              </div>
            ) : null}
            {adjustMode === "add" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="catalog-batch-number">Numer partii (opcjonalnie)</Label>
                <Input id="catalog-batch-number" value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} placeholder="Zostanie wygenerowany automatycznie" />
              </div>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="catalog-adjust-note">Notatka (opcjonalnie)</Label>
              <Input id="catalog-adjust-note" value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Anuluj</Button>
            <Button
              onClick={saveAdjustment}
              disabled={adjustSaving || !adjustWarehouseId || (adjustMode === "add" && !expiryDate)}
              className={adjustMode === "add"
                ? "bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:text-white"
                : "bg-amber-700 text-white hover:bg-amber-800 dark:bg-amber-600 dark:text-white"}
            >
              {adjustSaving ? "Zapisywanie..." : adjustMode === "add" ? "Dodaj" : "Odejmij"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Przenieś produkt między magazynami</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
              <div className="font-medium">{transferProduct?.name ?? "—"}</div>
              {fromWarehouseId ? <div className="text-xs text-slate-500">Dostępne w magazynie źródłowym: {quantity(transferAvailable)}</div> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Magazyn źródłowy</Label>
                <Select
                  value={fromWarehouseId}
                  onValueChange={(value) => {
                    setFromWarehouseId(value);
                    if (value === toWarehouseId) setToWarehouseId("");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Wybierz magazyn" /></SelectTrigger>
                  <SelectContent disablePortal>
                    {transferSourceStocks.map((stock) => (
                      <SelectItem key={stock.warehouse.id} value={stock.warehouse.id}>
                        {stock.warehouse.name} ({quantity(Number(stock.quantity))})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Magazyn docelowy</Label>
                <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                  <SelectTrigger><SelectValue placeholder="Wybierz magazyn" /></SelectTrigger>
                  <SelectContent disablePortal>
                    {transferDestinations.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="catalog-transfer-quantity">Ilość</Label>
                <Input
                  id="catalog-transfer-quantity"
                  type="number"
                  min="0.01"
                  max={transferAvailable || undefined}
                  step="0.01"
                  value={transferQuantity}
                  onChange={(event) => setTransferQuantity(event.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="catalog-transfer-note">Notatka (opcjonalnie)</Label>
                <Input id="catalog-transfer-note" value={transferNote} onChange={(event) => setTransferNote(event.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Anuluj</Button>
            <Button
              onClick={saveTransfer}
              disabled={transferSaving || !fromWarehouseId || !toWarehouseId}
              className="bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:text-white"
            >
              {transferSaving ? "Przenoszenie..." : "Przenieś produkt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Usuń produkt z magazynu</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
              {removeProduct?.name ?? "—"}
            </div>
            <div className="space-y-2">
              <Label>Magazyn</Label>
              <Select value={removeWarehouseId} onValueChange={setRemoveWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Wybierz magazyn" /></SelectTrigger>
                <SelectContent disablePortal>
                  {removeSourceStocks.map((stock) => (
                    <SelectItem key={stock.warehouse.id} value={stock.warehouse.id}>
                      {stock.warehouse.name} ({quantity(Number(stock.quantity))})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {removeWarehouseId ? (
                <div className="text-xs text-slate-500">Usunięty zostanie cały stan: {quantity(removeAvailable)}</div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>Anuluj</Button>
            <Button
              onClick={saveRemove}
              disabled={removeSaving || !removeWarehouseId}
              className="bg-red-700 text-white hover:bg-red-800 dark:bg-red-600 dark:text-white"
            >
              {removeSaving ? "Usuwanie..." : "Usuń z magazynu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
