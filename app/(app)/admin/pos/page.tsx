"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ShoppingCart, Trash2, Search, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";

async function fetcher(url: string) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || "Nie udało się pobrać danych");
  return data;
}

type Product = {
  id: string;
  name: string;
  sku: string | null;
  category: "PREPARATION" | "COSMETIC";
  unit: string;
  salePrice: number | null;
  isActive: boolean;
  stocks: { warehouseId: string; quantity: string }[];
};

type Warehouse = { id: string; name: string; parentId: string | null; locationId: string };
type Patient = { id: string; name: string; locationId: string };
type Sale = {
  id: string;
  createdAt: string;
  status: string;
  note: string | null;
  subtotal: number;
  discountAmount: number;
  total: number;
  discountApprovedBy: { id: string; name: string } | null;
  patient: { id: string; name: string } | null;
  soldBy: { id: string; name: string };
  items: { id: string; quantity: string; unitPrice: number | null; total: number | null; product: { name: string } }[];
  payments: { id: string; method: string; amount: number }[];
};

const UNIT_LABELS: Record<string, string> = {
  UNIT: "szt.",
  ML: "ml",
  MG: "mg",
  G: "g",
  AMPULE: "amp.",
  BOTOX_UNIT: "j. botoksu",
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Gotówka",
  CARD: "Karta",
  VOUCHER: "Voucher",
};

const SALE_STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Zrealizowana",
  CANCELED: "Anulowana",
};

const NO_PATIENT = "__NONE__";

function unitLabel(unit: string) {
  return UNIT_LABELS[unit] ?? unit;
}

function formatGrosze(value: number) {
  return (value / 100).toFixed(2).replace(".", ",");
}

type CartItem = { productId: string; quantity: string };
type PaymentRow = { id: string; method: "CASH" | "CARD" | "VOUCHER"; amountInput: string };
type AppliedDiscount = {
  type: "AMOUNT" | "PERCENT";
  value: number;
  amountGrosze: number;
  approvedById: string;
  approvedByName: string;
};

let rowIdCounter = 0;
function nextRowId() {
  rowIdCounter += 1;
  return `row-${rowIdCounter}`;
}

// Wyszukiwarka klienta z opcją sprzedaży bez przypisania do pacjenta
function PatientCombobox({
  patients,
  value,
  onChange,
}: {
  patients: Patient[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  const sorted = React.useMemo(
    () => [...patients].sort((a, b) => a.name.localeCompare(b.name, "pl", { sensitivity: "base" })),
    [patients],
  );
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) => p.name.toLowerCase().includes(q));
  }, [sorted, query]);

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  const selectedLabel =
    value === NO_PATIENT || !value
      ? "Klient anonimowy"
      : (sorted.find((p) => p.id === value)?.name ?? "");

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <span>{selectedLabel}</span>
        <span className="text-zinc-400">▾</span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b p-2">
            <Input
              ref={searchRef}
              placeholder="Szukaj pacjenta…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-56 overflow-auto py-1 text-sm">
            <button
              type="button"
              onClick={() => {
                onChange(NO_PATIENT);
                setOpen(false);
              }}
              className={
                "block w-full border-b px-3 py-2 text-left font-medium text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900 " +
                (value === NO_PATIENT || !value ? "bg-zinc-100 dark:bg-zinc-800" : "")
              }
            >
              Klient anonimowy
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-zinc-500">Brak wyników.</div>
            ) : null}
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
                className={
                  "block w-full px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 " +
                  (value === p.id ? "bg-zinc-100 font-medium dark:bg-zinc-800" : "")
                }
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Popup dodawania zniżki — wymaga zatwierdzenia hasłem administratora
function DiscountDialog({
  open,
  onOpenChange,
  subtotal,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subtotal: number;
  onApplied: (discount: AppliedDiscount) => void;
}) {
  const [type, setType] = React.useState<"AMOUNT" | "PERCENT">("PERCENT");
  const [value, setValue] = React.useState("");
  const [login, setLogin] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setType("PERCENT");
      setValue("");
      setLogin("");
      setPassword("");
    }
  }, [open]);

  const previewAmount = React.useMemo(() => {
    const v = parseFloat(value.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return 0;
    if (type === "PERCENT") {
      const pct = Math.min(100, Math.max(0, v));
      return Math.round((subtotal * pct) / 100);
    }
    const grosze = parsePLNToGrosze(value) ?? 0;
    return Math.min(subtotal, Math.max(0, grosze));
  }, [type, value, subtotal]);

  async function submit() {
    const v = parseFloat(value.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return toast.error("Podaj wartość zniżki");
    if (type === "PERCENT" && v > 100) return toast.error("Zniżka procentowa nie może przekraczać 100%");
    if (!login.trim() || !password) return toast.error("Podaj login i hasło administratora");

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/sales/authorize-discount", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login: login.trim(), password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się zatwierdzić zniżki");
        return;
      }

      const amountGrosze =
        type === "PERCENT"
          ? Math.round((subtotal * Math.min(100, Math.max(0, v))) / 100)
          : Math.min(subtotal, Math.max(0, parsePLNToGrosze(value) ?? 0));

      onApplied({
        type,
        value: type === "PERCENT" ? Math.min(100, Math.max(0, v)) : amountGrosze,
        amountGrosze,
        approvedById: result.admin.id,
        approvedByName: result.admin.name,
      });
      toast.success(`Zniżka zatwierdzona przez ${result.admin.name}`);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Dodaj zniżkę</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Typ zniżki</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("PERCENT")}
                className={
                  "rounded-xl border px-3 py-2 text-sm font-medium " +
                  (type === "PERCENT"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300")
                }
              >
                Procentowa (%)
              </button>
              <button
                type="button"
                onClick={() => setType("AMOUNT")}
                className={
                  "rounded-xl border px-3 py-2 text-sm font-medium " +
                  (type === "AMOUNT"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                    : "border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-300")
                }
              >
                Kwotowa (zł)
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Wartość {type === "PERCENT" ? "(%)" : "(zł)"}</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={type === "PERCENT" ? "np. 10" : "np. 50"} />
            {previewAmount > 0 ? (
              <div className="text-xs text-zinc-500">
                Wysokość zniżki: <span className="font-medium">{formatPLNFromGrosze(previewAmount)}</span>
              </div>
            ) : null}
          </div>

          <div className="space-y-2 border-t pt-3">
            <Label>Login administratora</Label>
            <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label>Hasło administratora</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Anuluj
          </Button>
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting ? "Sprawdzanie…" : "Zatwierdź zniżkę"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PosPage() {
  const { data, isLoading, mutate } = useSWR("/api/admin/sales", fetcher);
  const products: Product[] = data?.products ?? [];
  const warehouses: Warehouse[] = data?.warehouses ?? [];
  const patients: Patient[] = data?.patients ?? [];
  const sales: Sale[] = data?.sales ?? [];

  const [warehouseId, setWarehouseId] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [patientId, setPatientId] = React.useState(NO_PATIENT);
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [discount, setDiscount] = React.useState<AppliedDiscount | null>(null);
  const [discountDialogOpen, setDiscountDialogOpen] = React.useState(false);
  const [payments, setPayments] = React.useState<PaymentRow[]>([
    { id: nextRowId(), method: "CARD", amountInput: "" },
  ]);

  React.useEffect(() => {
    if (!warehouseId && warehouses.length > 0) setWarehouseId(warehouses[0].id);
  }, [warehouses, warehouseId]);

  const productMap = React.useMemo(() => new Map(products.map((p) => [p.id, p] as const)), [products]);

  const filteredProducts = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.isActive) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, query]);

  function stockFor(product: Product) {
    if (!warehouseId) return 0;
    const stock = product.stocks.find((s) => s.warehouseId === warehouseId);
    return stock ? parseFloat(stock.quantity) : 0;
  }

  function addToCart(productId: string) {
    setCart((current) => {
      const existing = current.find((i) => i.productId === productId);
      if (existing) {
        return current.map((i) =>
          i.productId === productId
            ? { ...i, quantity: String((parseFloat(i.quantity) || 0) + 1) }
            : i,
        );
      }
      return [...current, { productId, quantity: "1" }];
    });
  }

  function updateQuantity(productId: string, quantity: string) {
    setCart((current) => current.map((i) => (i.productId === productId ? { ...i, quantity } : i)));
  }

  function removeFromCart(productId: string) {
    setCart((current) => current.filter((i) => i.productId !== productId));
  }

  const subtotal = cart.reduce((sum, item) => {
    const product = productMap.get(item.productId);
    const qty = parseFloat(item.quantity) || 0;
    const unit = product?.salePrice ?? 0;
    return sum + Math.round(unit * qty);
  }, 0);

  const discountAmount = discount ? Math.min(subtotal, discount.amountGrosze) : 0;
  const totalDue = Math.max(0, subtotal - discountAmount);

  const paidSum = payments.reduce((sum, p) => sum + (parsePLNToGrosze(p.amountInput) ?? 0), 0);
  const remaining = totalDue - paidSum;

  // Kiedy jest tylko jedna metoda płatności, trzymamy ją zsynchronizowaną z kwotą do zapłaty.
  React.useEffect(() => {
    setPayments((current) => {
      if (current.length !== 1) return current;
      const formatted = formatGrosze(totalDue);
      if (current[0].amountInput === formatted) return current;
      return [{ ...current[0], amountInput: totalDue > 0 ? formatted : "" }];
    });
  }, [totalDue]);

  function addPaymentRow() {
    setPayments((current) => {
      const remainingNow = totalDue - current.reduce((s, p) => s + (parsePLNToGrosze(p.amountInput) ?? 0), 0);
      const lastMethod = current[current.length - 1]?.method;
      const nextMethod = lastMethod === "CARD" ? "CASH" : "CARD";
      return [
        ...current,
        {
          id: nextRowId(),
          method: nextMethod,
          amountInput: remainingNow > 0 ? formatGrosze(remainingNow) : "",
        },
      ];
    });
  }

  function removePaymentRow(id: string) {
    setPayments((current) => (current.length <= 1 ? current : current.filter((p) => p.id !== id)));
  }

  function updatePaymentRow(id: string, patch: Partial<PaymentRow>) {
    setPayments((current) => current.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function fillRemaining(id: string) {
    setPayments((current) => {
      const others = current.filter((p) => p.id !== id).reduce((s, p) => s + (parsePLNToGrosze(p.amountInput) ?? 0), 0);
      const need = Math.max(0, totalDue - others);
      return current.map((p) => (p.id === id ? { ...p, amountInput: formatGrosze(need) } : p));
    });
  }

  function removeDiscount() {
    setDiscount(null);
  }

  async function finalizeSale() {
    if (!warehouseId) return toast.error("Wybierz magazyn");
    if (cart.length === 0) return toast.error("Dodaj produkty do koszyka");
    if (payments.length === 0) return toast.error("Dodaj co najmniej jedną metodę płatności");
    if (remaining !== 0) {
      return toast.error(
        remaining > 0
          ? `Brakuje ${formatPLNFromGrosze(remaining)} do pełnej kwoty`
          : `Suma płatności przekracza kwotę do zapłaty o ${formatPLNFromGrosze(-remaining)}`,
      );
    }
    for (const p of payments) {
      const amount = parsePLNToGrosze(p.amountInput) ?? 0;
      if (amount <= 0) return toast.error("Każda metoda płatności musi mieć kwotę większą od zera");
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          patientId: patientId === NO_PATIENT ? null : patientId,
          warehouseId,
          items: cart,
          note: note.trim() || undefined,
          payments: payments.map((p) => ({
            method: p.method,
            amount: parsePLNToGrosze(p.amountInput) ?? 0,
          })),
          discount: discount
            ? { type: discount.type, value: discount.value, approvedById: discount.approvedById }
            : null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się zarejestrować sprzedaży");
        return;
      }
      toast.success("Sprzedaż zarejestrowana");
      setCart([]);
      setNote("");
      setPatientId(NO_PATIENT);
      setDiscount(null);
      setPayments([{ id: nextRowId(), method: "CARD", amountInput: "" }]);
      await mutate();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">POS - Sprzedaż</h1>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Produkty</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Szukaj produktu lub SKU…"
                  className="pl-9 sm:w-64"
                />
              </div>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue placeholder="Magazyn" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-zinc-500">Ładowanie…</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProducts.length === 0 ? (
                  <div className="col-span-full text-sm text-zinc-500">Brak produktów.</div>
                ) : null}
                {filteredProducts.map((product) => {
                  const stock = stockFor(product);
                  const inCart = cart.find((i) => i.productId === product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product.id)}
                      disabled={stock <= 0}
                      className={
                        "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition " +
                        (stock <= 0
                          ? "cursor-not-allowed border-zinc-100 bg-zinc-50 opacity-60 dark:border-white/5 dark:bg-white/5"
                          : inCart
                            ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                            : "border-zinc-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-500/30")
                      }
                    >
                      <div className="line-clamp-2 text-sm font-medium">{product.name}</div>
                      {product.sku ? (
                        <div className="text-xs text-zinc-400">SKU: {product.sku}</div>
                      ) : null}
                      <div className="mt-1 flex w-full items-center justify-between">
                        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                          {formatPLNFromGrosze(product.salePrice)}
                        </span>
                        <span className="text-xs text-zinc-500">
                          Stan: {stock} {unitLabel(product.unit)}
                        </span>
                      </div>
                      {inCart ? (
                        <span className="mt-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
                          W koszyku: {inCart.quantity}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" /> Koszyk
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {cart.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-center text-sm text-zinc-500">
                  Koszyk jest pusty. Kliknij produkt, aby dodać.
                </div>
              ) : null}
              {cart.map((item) => {
                const product = productMap.get(item.productId);
                if (!product) return null;
                const qty = parseFloat(item.quantity) || 0;
                const lineTotal = Math.round((product.salePrice ?? 0) * qty);
                return (
                  <div
                    key={item.productId}
                    className="flex items-center gap-2 rounded-xl border p-2 dark:border-zinc-800"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{product.name}</div>
                      <div className="text-xs text-zinc-500">{formatPLNFromGrosze(product.salePrice)} / {unitLabel(product.unit)}</div>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.productId, e.target.value)}
                      className="h-9 w-20 text-right"
                    />
                    <div className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatPLNFromGrosze(lineTotal)}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId)}
                      className="text-zinc-400 hover:text-red-600"
                      aria-label="Usuń z koszyka"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label>Klient</Label>
              <PatientCombobox patients={patients} value={patientId} onChange={setPatientId} />
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label>Zniżka</Label>
                {!discount ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDiscountDialogOpen(true)}
                    disabled={subtotal <= 0}
                    className="gap-1"
                  >
                    <Tag className="h-3.5 w-3.5" /> Dodaj zniżkę
                  </Button>
                ) : null}
              </div>
              {discount ? (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <div>
                    <div className="font-medium text-emerald-800 dark:text-emerald-200">
                      {discount.type === "PERCENT" ? `${discount.value}%` : formatPLNFromGrosze(discount.amountGrosze)}
                      {" "}
                      (-{formatPLNFromGrosze(discountAmount)})
                    </div>
                    <div className="text-xs text-emerald-700/80 dark:text-emerald-300/80">
                      Zatwierdził: {discount.approvedByName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeDiscount}
                    className="text-emerald-700 hover:text-red-600 dark:text-emerald-300"
                    aria-label="Usuń zniżkę"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label>Płatności</Label>
                <Button type="button" variant="outline" size="sm" onClick={addPaymentRow}>
                  Dodaj metodę
                </Button>
              </div>
              <div className="space-y-2">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex items-center gap-2">
                    <Select
                      value={payment.method}
                      onValueChange={(v) => updatePaymentRow(payment.id, { method: v as PaymentRow["method"] })}
                    >
                      <SelectTrigger className="w-28 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASH">Gotówka</SelectItem>
                        <SelectItem value="CARD">Karta</SelectItem>
                        <SelectItem value="VOUCHER">Voucher</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={payment.amountInput}
                      onChange={(e) => updatePaymentRow(payment.id, { amountInput: e.target.value })}
                      placeholder="0,00"
                      className="flex-1"
                    />
                    {payments.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => fillRemaining(payment.id)}
                        title="Uzupełnij pozostałą kwotę"
                        className="shrink-0 text-xs font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900 dark:text-emerald-300"
                      >
                        Reszta
                      </button>
                    ) : null}
                    {payments.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removePaymentRow(payment.id)}
                        className="shrink-0 text-zinc-400 hover:text-red-600"
                        aria-label="Usuń metodę płatności"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notatka (opcjonalnie)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Np. numer paragonu" />
            </div>

            <div className="space-y-1 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-white/5">
              {discountAmount > 0 ? (
                <>
                  <div className="flex items-center justify-between text-zinc-500">
                    <span>Suma produktów</span>
                    <span>{formatPLNFromGrosze(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-500">
                    <span>Zniżka</span>
                    <span>-{formatPLNFromGrosze(discountAmount)}</span>
                  </div>
                </>
              ) : null}
              <div className="flex items-center justify-between font-semibold">
                <span>Do zapłaty</span>
                <span>{formatPLNFromGrosze(totalDue)}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-500">
                <span>Wpłacono</span>
                <span>{formatPLNFromGrosze(paidSum)}</span>
              </div>
              <div
                className={
                  "flex items-center justify-between font-semibold " +
                  (remaining === 0
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-amber-700 dark:text-amber-300")
                }
              >
                <span>{remaining >= 0 ? "Pozostało" : "Nadpłata"}</span>
                <span>{formatPLNFromGrosze(Math.abs(remaining))}</span>
              </div>
            </div>

            <Button
              className="w-full"
              disabled={submitting || cart.length === 0 || !warehouseId || remaining !== 0}
              onClick={finalizeSale}
            >
              {submitting ? "Zapisywanie…" : "Sfinalizuj sprzedaż"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ostatnie sprzedaże</CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Produkt</th>
                <th className="p-3">Klient</th>
                <th className="p-3">Kto sprzedał</th>
                <th className="p-3">Status</th>
                <th className="p-3">Cena</th>
                <th className="p-3">Płatności</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 && (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={7}>
                    Brak sprzedaży.
                  </td>
                </tr>
              )}
              {sales.map((sale) => {
                const paid = sale.payments.reduce((sum, p) => sum + p.amount, 0);
                const productLabel =
                  sale.items.length === 1
                    ? sale.items[0].product.name
                    : `${sale.items[0]?.product.name ?? "—"} +${sale.items.length - 1} więcej`;
                return (
                  <tr key={sale.id} className="border-t">
                    <td className="p-3">
                      {new Date(sale.createdAt).toLocaleString("pl-PL", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="p-3">{productLabel}</td>
                    <td className="p-3">{sale.patient?.name ?? "Klient anonimowy"}</td>
                    <td className="p-3">{sale.soldBy.name}</td>
                    <td className="p-3">{SALE_STATUS_LABELS[sale.status] ?? sale.status}</td>
                    <td className="p-3">
                      {formatPLNFromGrosze(sale.total)}
                      {sale.discountAmount > 0 ? (
                        <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-300">
                          (zniżka -{formatPLNFromGrosze(sale.discountAmount)})
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3">
                      {paid
                        ? sale.payments
                            .map((p) => `${formatPLNFromGrosze(p.amount)} (${PAYMENT_LABELS[p.method] ?? p.method})`)
                            .join(", ")
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <DiscountDialog
        open={discountDialogOpen}
        onOpenChange={setDiscountDialogOpen}
        subtotal={subtotal}
        onApplied={setDiscount}
      />
    </div>
  );
}
