"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, ChevronDown, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPLNFromGrosze } from "@/lib/money";
import { vatRateLabel } from "@/lib/vat";

async function fetcher(url: string) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || "Nie udało się pobrać danych");
  return data;
}

type SaleItem = {
  id: string;
  quantity: string;
  unitPrice: number | null;
  total: number | null;
  vatRate: string;
  vatAmount: number;
  product: { id: string; name: string; sku: string | null; ean: string | null; unit: string };
};

type Sale = {
  id: string;
  createdAt: string;
  status: "COMPLETED" | "CANCELED";
  note: string | null;
  subtotal: number;
  discountType: "AMOUNT" | "PERCENT" | null;
  discountValue: number | null;
  discountAmount: number;
  total: number;
  vatAmount: number;
  documentType: "RECEIPT" | "INVOICE";
  buyerName: string | null;
  buyerNip: string | null;
  buyerAddress: string | null;
  patient: { id: string; name: string } | null;
  soldBy: { id: string; name: string };
  discountApprovedBy: { id: string; name: string } | null;
  location: { id: string; name: string };
  items: SaleItem[];
  payments: { id: string; method: string; amount: number }[];
};

type HistoryResponse = {
  page: number;
  pageSize: number;
  count: number;
  sales: Sale[];
  summary: {
    count: number;
    total: number;
    vatAmount: number;
    discountAmount: number;
    byDocument: { documentType: string; count: number; total: number }[];
    vatByRate: { vatRate: string; vatAmount: number }[];
  };
};

const DOCUMENT_LABELS: Record<string, string> = { RECEIPT: "Paragon", INVOICE: "Faktura VAT" };
const STATUS_LABELS: Record<string, string> = { COMPLETED: "Zrealizowana", CANCELED: "Anulowana" };
const PAYMENT_LABELS: Record<string, string> = { CASH: "Gotówka", CARD: "Karta", VOUCHER: "Voucher" };
const UNIT_LABELS: Record<string, string> = {
  UNIT: "szt.",
  ML: "ml",
  MG: "mg",
  G: "g",
  AMPULE: "amp.",
  BOTOX_UNIT: "j. botoksu",
};
const ALL = "ALL";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatQuantity(value: string) {
  return Number(value).toLocaleString("pl-PL", { maximumFractionDigits: 2 });
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-sm text-zinc-500">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function SaleDetails({ sale }: { sale: Sale }) {
  return (
    <div className="space-y-4 bg-zinc-50 p-4 text-sm dark:bg-white/5">
      <div className="overflow-auto">
        <table className="w-full min-w-[560px]">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="py-1 pr-3">Produkt</th>
              <th className="py-1 pr-3 text-right">Ilość</th>
              <th className="py-1 pr-3 text-right">Cena brutto</th>
              <th className="py-1 pr-3 text-right">Wartość</th>
              <th className="py-1 pr-3 text-right">Stawka VAT</th>
              <th className="py-1 text-right">VAT</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1.5 pr-3">
                  {item.product.name}
                  {item.product.ean ? <span className="ml-1 text-xs text-zinc-400">EAN {item.product.ean}</span> : null}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {formatQuantity(item.quantity)} {UNIT_LABELS[item.product.unit] ?? item.product.unit}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{formatPLNFromGrosze(item.unitPrice)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{formatPLNFromGrosze(item.total)}</td>
                <td className="py-1.5 pr-3 text-right">{vatRateLabel(item.vatRate)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatPLNFromGrosze(item.vatAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase text-zinc-400">Kwoty</div>
          {sale.discountAmount > 0 ? (
            <>
              <div>Suma produktów: {formatPLNFromGrosze(sale.subtotal)}</div>
              <div>
                Zniżka{sale.discountType === "PERCENT" && sale.discountValue != null ? ` ${sale.discountValue}%` : ""}: -
                {formatPLNFromGrosze(sale.discountAmount)}
                {sale.discountApprovedBy ? (
                  <span className="text-zinc-500"> (zatwierdził: {sale.discountApprovedBy.name})</span>
                ) : null}
              </div>
            </>
          ) : null}
          <div>Netto: {formatPLNFromGrosze(sale.total - sale.vatAmount)}</div>
          <div>VAT: {formatPLNFromGrosze(sale.vatAmount)}</div>
          <div className="font-semibold">Brutto: {formatPLNFromGrosze(sale.total)}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase text-zinc-400">
            {sale.documentType === "INVOICE" ? "Nabywca (faktura VAT)" : "Klient"}
          </div>
          {sale.documentType === "INVOICE" ? (
            <>
              <div>{sale.buyerName ?? "—"}</div>
              <div>NIP: {sale.buyerNip ?? "brak (osoba prywatna)"}</div>
              <div>{sale.buyerAddress ?? "—"}</div>
            </>
          ) : null}
          <div>{sale.patient ? `Pacjent: ${sale.patient.name}` : "Klient anonimowy"}</div>
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase text-zinc-400">Szczegóły</div>
          <div>
            Płatność:{" "}
            {sale.payments.length
              ? sale.payments
                  .map((p) => `${PAYMENT_LABELS[p.method] ?? p.method} ${formatPLNFromGrosze(p.amount)}`)
                  .join(", ")
              : "—"}
          </div>
          <div>Lokalizacja: {sale.location.name}</div>
          {sale.note ? <div>Notatka: {sale.note}</div> : null}
          <div className="text-xs text-zinc-400">ID sprzedaży: {sale.id}</div>
        </div>
      </div>
    </div>
  );
}

export default function SalesHistoryPage() {
  const today = React.useMemo(() => new Date(), []);
  const [from, setFrom] = React.useState(() => dateKey(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = React.useState(() => dateKey(today));
  const [documentFilter, setDocumentFilter] = React.useState(ALL);
  const [statusFilter, setStatusFilter] = React.useState(ALL);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const params = new URLSearchParams({ page: String(page) });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (documentFilter !== ALL) params.set("document", documentFilter);
  if (statusFilter !== ALL) params.set("status", statusFilter);
  if (debouncedSearch) params.set("q", debouncedSearch);

  const { data, error, isLoading } = useSWR<HistoryResponse>(`/api/admin/sales/history?${params}`, fetcher, {
    keepPreviousData: true,
  });
  const sales = data?.sales ?? [];
  const summary = data?.summary;
  const pageCount = data ? Math.max(1, Math.ceil(data.count / data.pageSize)) : 1;

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/pos"
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" /> POS - Sprzedaż
          </Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Historia sprzedaży</h1>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="history-from">Od</Label>
            <Input id="history-from" type="date" value={from} onChange={(e) => resetPage(setFrom)(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="history-to">Do</Label>
            <Input id="history-to" type="date" value={to} onChange={(e) => resetPage(setTo)(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Dokument</Label>
            <Select value={documentFilter} onValueChange={resetPage(setDocumentFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Wszystkie</SelectItem>
                <SelectItem value="RECEIPT">Paragon</SelectItem>
                <SelectItem value="INVOICE">Faktura VAT</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={resetPage(setStatusFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Wszystkie</SelectItem>
                <SelectItem value="COMPLETED">Zrealizowane</SelectItem>
                <SelectItem value="CANCELED">Anulowane</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="history-search">Szukaj</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                id="history-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Produkt, EAN, klient, NIP…"
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            label="Liczba sprzedaży"
            value={String(summary.count)}
            sub={summary.byDocument
              .map((row) => `${DOCUMENT_LABELS[row.documentType] ?? row.documentType}: ${row.count}`)
              .join(" · ")}
          />
          <SummaryTile
            label="Obrót brutto"
            value={formatPLNFromGrosze(summary.total)}
            sub={summary.discountAmount > 0 ? `w tym zniżki: ${formatPLNFromGrosze(summary.discountAmount)}` : undefined}
          />
          <SummaryTile label="Netto" value={formatPLNFromGrosze(summary.total - summary.vatAmount)} />
          <SummaryTile
            label="VAT"
            value={formatPLNFromGrosze(summary.vatAmount)}
            sub={summary.vatByRate
              .filter((row) => row.vatAmount > 0)
              .map((row) => `${vatRateLabel(row.vatRate)}: ${formatPLNFromGrosze(row.vatAmount)}`)
              .join(" · ")}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Sprzedaże</CardTitle>
          {data ? <span className="text-sm text-zinc-500">Znaleziono: {data.count}</span> : null}
        </CardHeader>
        <CardContent className="overflow-auto p-0">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="w-8 p-3" aria-label="Rozwiń" />
                <th className="p-3">Data</th>
                <th className="p-3">Dokument</th>
                <th className="p-3">Klient / nabywca</th>
                <th className="p-3">Produkty</th>
                <th className="p-3">Kto sprzedał</th>
                <th className="p-3">Płatność</th>
                <th className="p-3 text-right">Brutto</th>
                <th className="p-3 text-right">VAT</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td className="p-3 text-red-600" colSpan={10}>
                    {error.message}
                  </td>
                </tr>
              ) : null}
              {isLoading && !data ? (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={10}>
                    Ładowanie…
                  </td>
                </tr>
              ) : null}
              {data && sales.length === 0 ? (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={10}>
                    Brak sprzedaży dla wybranych filtrów.
                  </td>
                </tr>
              ) : null}
              {sales.map((sale) => {
                const isOpen = expanded.has(sale.id);
                const productsLabel =
                  sale.items.length === 1
                    ? `${sale.items[0].product.name} × ${formatQuantity(sale.items[0].quantity)}`
                    : `${sale.items[0]?.product.name ?? "—"} +${sale.items.length - 1} więcej`;
                return (
                  <React.Fragment key={sale.id}>
                    <tr
                      className={
                        "cursor-pointer border-t hover:bg-zinc-50 dark:hover:bg-white/5 " +
                        (sale.status === "CANCELED" ? "text-zinc-400 line-through" : "")
                      }
                      onClick={() => toggle(sale.id)}
                    >
                      <td className="p-3 text-zinc-400">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="whitespace-nowrap p-3">{formatDateTime(sale.createdAt)}</td>
                      <td className="p-3">{DOCUMENT_LABELS[sale.documentType] ?? sale.documentType}</td>
                      <td className="p-3">
                        {sale.documentType === "INVOICE" && sale.buyerName ? (
                          <>
                            <div>{sale.buyerName}</div>
                            {sale.buyerNip ? <div className="text-xs text-zinc-500">NIP {sale.buyerNip}</div> : null}
                          </>
                        ) : (
                          sale.patient?.name ?? "Klient anonimowy"
                        )}
                      </td>
                      <td className="p-3">{productsLabel}</td>
                      <td className="p-3">{sale.soldBy.name}</td>
                      <td className="p-3">
                        {sale.payments.map((p) => PAYMENT_LABELS[p.method] ?? p.method).join(", ") || "—"}
                      </td>
                      <td className="whitespace-nowrap p-3 text-right font-medium tabular-nums">
                        {formatPLNFromGrosze(sale.total)}
                      </td>
                      <td className="whitespace-nowrap p-3 text-right tabular-nums">
                        {formatPLNFromGrosze(sale.vatAmount)}
                      </td>
                      <td className="p-3">{STATUS_LABELS[sale.status] ?? sale.status}</td>
                    </tr>
                    {isOpen ? (
                      <tr className="border-t">
                        <td colSpan={10} className="p-0">
                          <SaleDetails sale={sale} />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Poprzednia
          </Button>
          <span className="text-sm text-zinc-500">
            Strona {page} z {pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            Następna
          </Button>
        </div>
      ) : null}
    </div>
  );
}
