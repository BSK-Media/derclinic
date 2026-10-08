"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, PackageMinus, PackagePlus, PackageSearch, Pencil, ShoppingCart, Trash2, Warehouse } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPLNFromGrosze } from "@/lib/money";
import { publishScanIntent, type ScanAction } from "@/lib/scan-intent";
import { hasSidebarPermission } from "@/lib/sidebar-permissions";
import { useWindowScanner } from "@/lib/use-scanner-input";
import { vatRateLabel } from "@/lib/vat";

type LookupProduct = {
  id: string;
  name: string;
  sku: string | null;
  manufacturer: string | null;
  ean: string | null;
  unit: string;
  salePrice: number | null;
  vatRate: string;
  isActive: boolean;
  stocks: { quantity: string; warehouse: { id: string; name: string } }[];
};

type LookupScan =
  | { kind: "gs1"; data: { batchNumber: string | null; serialNumber: string | null; expiryDate: string | null } }
  | { kind: "plain"; code: string };

type ScanState =
  | { status: "loading"; code: string }
  | { status: "found"; code: string; product: LookupProduct; scan: LookupScan }
  | { status: "missing"; code: string }
  | { status: "error"; code: string; message: string };

const UNIT_LABELS: Record<string, string> = {
  UNIT: "szt.",
  ML: "ml",
  MG: "mg",
  G: "g",
  AMPULE: "amp.",
  BOTOX_UNIT: "j. botoksu",
};

const ACTION_TARGETS: Record<ScanAction, string> = {
  sell: "/admin/pos",
  receive: "/admin/products",
  transfer: "/admin/products",
  remove: "/admin/products",
  removeAll: "/admin/products",
};

function ActionTile({
  icon,
  title,
  description,
  onClick,
  disabled,
  tone = "slate",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "emerald" | "blue" | "slate" | "red";
}) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
    blue: "border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-400 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200",
    slate: "border-slate-200 bg-white text-slate-800 hover:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-100",
    red: "border-red-200 bg-white text-red-700 hover:border-red-400 dark:border-red-500/30 dark:bg-white/5 dark:text-red-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 " +
        tones[tone]
      }
    >
      <span className="flex items-center gap-2 font-semibold">
        {icon} {title}
      </span>
      <span className="text-xs opacity-80">{description}</span>
    </button>
  );
}

const DIALOG_ATTR = "data-global-scan";

function normalizePath(path: string) {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

// Inne okno (np. przyjęcie towaru) ma pierwszeństwo — wtedy globalny skaner milczy.
function otherDialogOpen() {
  return Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).some(
    (element) => !element.closest(`[${DIALOG_ATTR}]`),
  );
}

/**
 * Globalny skaner kodów dla administratora i managera: zeskanowanie produktu w dowolnym
 * miejscu panelu (bez klikania w pole tekstowe) otwiera okno z wyborem — sprzedaż
 * (dodaje do koszyka w POS) albo przesunięcie magazynowe (otwiera je w Produktach).
 * Na stronie POS skan od razu trafia do koszyka, więc tam okno się nie pokazuje.
 */
export function GlobalScanDialog() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = React.useState<ScanState | null>(null);
  // „choose” — sprzedaż albo magazyn; „manage” — lista akcji magazynowych.
  const [view, setView] = React.useState<"choose" | "manage">("choose");
  const requestRef = React.useRef(0);

  const canSell = Boolean(user && hasSidebarPermission(user.role, user.sidebarPermissions, "pos"));
  const canManage = Boolean(user && hasSidebarPermission(user.role, user.sidebarPermissions, "products"));
  const enabled =
    Boolean(user && (user.role === "ADMIN" || user.role === "MANAGER")) &&
    (canSell || canManage) &&
    // Tylko sama strona POS obsługuje skan po swojemu (np. historia sprzedaży już nie).
    normalizePath(pathname) !== ACTION_TARGETS.sell;

  async function lookup(code: string) {
    const requestId = ++requestRef.current;
    setView("choose");
    setState({ status: "loading", code });
    try {
      const response = await fetch(`/api/admin/products/lookup?code=${encodeURIComponent(code)}`);
      const result = await response.json().catch(() => ({}));
      if (requestId !== requestRef.current) return;
      if (!response.ok || !result?.ok) {
        setState({ status: "error", code, message: result?.message || "Nie udało się odczytać kodu" });
        return;
      }
      setState(
        result.product
          ? { status: "found", code, product: result.product, scan: result.scan }
          : { status: "missing", code },
      );
    } catch {
      if (requestId === requestRef.current) setState({ status: "error", code, message: "Brak połączenia z serwerem" });
    }
  }

  useWindowScanner((raw) => {
    const code = raw.trim();
    if (!code || otherDialogOpen()) return;
    void lookup(code);
  }, enabled);

  function close() {
    requestRef.current += 1;
    setState(null);
  }

  function choose(action: ScanAction, productId: string) {
    const code = state?.code ?? "";
    close();
    publishScanIntent(action, productId, code);
    const target = ACTION_TARGETS[action];
    // Dokładne porównanie: karta produktu (/admin/products/…) nie obsługuje akcji listy produktów.
    if (normalizePath(pathname) !== target) router.push(target);
  }

  const product = state?.status === "found" ? state.product : null;
  const gs1 = state?.status === "found" && state.scan.kind === "gs1" ? state.scan.data : null;
  const totalStock = product ? product.stocks.reduce((sum, stock) => sum + Number(stock.quantity), 0) : 0;
  const unit = product ? UNIT_LABELS[product.unit] ?? product.unit : "";

  return (
    <Dialog open={state !== null} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent
        className="max-w-lg"
        {...{ [DIALOG_ATTR]: "" }}
        // Bez automatycznego fokusu na przyciskach — Enter z kolejnego skanu nie może wybrać akcji.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageSearch className="h-5 w-5" /> Zeskanowany produkt
          </DialogTitle>
        </DialogHeader>

        {state?.status === "loading" ? (
          <div className="py-6 text-center text-sm text-slate-500">Szukam produktu o kodzie {state.code}…</div>
        ) : null}

        {state?.status === "missing" ? (
          <div className="space-y-2 py-2 text-sm">
            <p>
              Produktu o kodzie <span className="font-mono">{state.code}</span> nie ma w bazie.
            </p>
            {canManage ? (
              <div className="pt-2">
                <ActionTile
                  icon={<PackagePlus className="h-4 w-4" />}
                  title="Przyjmij jako nowy produkt"
                  description="Otwórz przyjęcie do magazynu z tym kodem — uzupełnisz nazwę i ceny"
                  onClick={() => choose("receive", "")}
                  tone="emerald"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {state?.status === "error" ? <div className="py-2 text-sm text-red-600">{state.message}</div> : null}

        {product ? (
          <div className="space-y-4">
            <div>
              <div className="text-lg font-semibold">{product.name}</div>
              <div className="text-sm text-slate-500">
                {[product.manufacturer, product.ean ? `EAN ${product.ean}` : null, product.sku ? `SKU ${product.sku}` : null]
                  .filter(Boolean)
                  .join(" • ")}
              </div>
              {!product.isActive ? (
                <div className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">Produkt nieaktywny</div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <div className="text-xs text-slate-500">Cena sprzedaży</div>
                <div className="font-semibold">{formatPLNFromGrosze(product.salePrice)}</div>
                <div className="text-xs text-slate-500">VAT {vatRateLabel(product.vatRate)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <div className="text-xs text-slate-500">Stan łącznie</div>
                <div className="font-semibold">
                  {totalStock} {unit}
                </div>
                <div className="text-xs text-slate-500">
                  {product.stocks.length
                    ? product.stocks.map((stock) => `${stock.warehouse.name}: ${Number(stock.quantity)}`).join(" • ")
                    : "brak na stanie"}
                </div>
              </div>
            </div>

            {gs1 && (gs1.batchNumber || gs1.expiryDate || gs1.serialNumber) ? (
              <div className="text-xs text-slate-500">
                Z kodu GS1:{" "}
                {[
                  gs1.batchNumber ? `partia ${gs1.batchNumber}` : null,
                  gs1.serialNumber ? `nr seryjny ${gs1.serialNumber}` : null,
                  gs1.expiryDate ? `ważny do ${formatDate(gs1.expiryDate)}` : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            ) : null}

            {view === "choose" ? (
              <>
                <div className="text-sm font-medium">Co chcesz zrobić z tym produktem?</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {canSell ? (
                    <ActionTile
                      icon={<ShoppingCart className="h-4 w-4" />}
                      title="Sprzedaż"
                      description="Przejdź do POS i dodaj produkt do koszyka klienta"
                      onClick={() => choose("sell", product.id)}
                      disabled={!product.isActive || totalStock <= 0}
                      tone="emerald"
                    />
                  ) : null}
                  {canManage ? (
                    <ActionTile
                      icon={<Warehouse className="h-4 w-4" />}
                      title="Zarządzanie w magazynie"
                      description="Przyjęcie na stan, przesunięcie, odjęcie, edycja produktu i partii"
                      onClick={() => setView("manage")}
                      tone="blue"
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Zarządzanie w magazynie</div>
                  <button
                    type="button"
                    onClick={() => setView("choose")}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Wróć
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ActionTile
                    icon={<PackagePlus className="h-4 w-4" />}
                    title="Przyjmij na stan"
                    description="Dodaj opakowania do magazynu — dane z kodu uzupełnią się same"
                    onClick={() => choose("receive", product.id)}
                    tone="emerald"
                  />
                  <ActionTile
                    icon={<ArrowRightLeft className="h-4 w-4" />}
                    title="Przesuń między magazynami"
                    description="Przenieś część albo całość stanu do innego magazynu"
                    onClick={() => choose("transfer", product.id)}
                    disabled={totalStock <= 0}
                    tone="blue"
                  />
                  <ActionTile
                    icon={<PackageMinus className="h-4 w-4" />}
                    title="Odejmij ze stanu"
                    description="Zmniejsz stan w wybranym magazynie (np. uszkodzenie, zużycie)"
                    onClick={() => choose("remove", product.id)}
                    disabled={totalStock <= 0}
                  />
                  <ActionTile
                    icon={<Pencil className="h-4 w-4" />}
                    title="Edytuj produkt i partie"
                    description="Karta produktu: dane, cena, VAT, EAN oraz edycja partii i serii"
                    onClick={() => {
                      close();
                      router.push(`/admin/products/${product.id}`);
                    }}
                  />
                  <ActionTile
                    icon={<Trash2 className="h-4 w-4" />}
                    title="Usuń cały stan z magazynu"
                    description="Wyzeruj stan produktu w wybranym magazynie"
                    onClick={() => choose("removeAll", product.id)}
                    disabled={totalStock <= 0}
                    tone="red"
                  />
                </div>
              </>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close}>
            Zamknij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
