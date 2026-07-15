"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parsePLNToGrosze } from "@/lib/money";

const NEW_PRODUCT = "__new_product__";

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

const UNIT_OPTIONS = [
  { value: "UNIT", label: "szt." },
  { value: "ML", label: "ml" },
  { value: "MG", label: "mg" },
  { value: "G", label: "g" },
  { value: "AMPULE", label: "ampułka" },
  { value: "BOTOX_UNIT", label: "jednostka botoksu" },
] as const;

export function AdminAddProductDialog({
  open,
  onOpenChange,
  products,
  warehouses,
  fixedWarehouseId,
  fixedWarehouseName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductOption[];
  warehouses: WarehouseOption[];
  fixedWarehouseId?: string;
  fixedWarehouseName?: string;
  onSaved: () => void | Promise<void>;
}) {
  const [productChoice, setProductChoice] = React.useState("");
  const [warehouseId, setWarehouseId] = React.useState(fixedWarehouseId ?? "");
  const [name, setName] = React.useState("");
  const [manufacturer, setManufacturer] = React.useState("");
  const [ean, setEan] = React.useState("");
  const [sku, setSku] = React.useState("");
  const [catalogCategory, setCatalogCategory] = React.useState("");
  const [unit, setUnit] = React.useState("UNIT");
  const [purchasePrice, setPurchasePrice] = React.useState("");
  const [salePrice, setSalePrice] = React.useState("");
  const [stockQuantity, setStockQuantity] = React.useState("1");
  const [expiryDate, setExpiryDate] = React.useState("");
  const [batchNumber, setBatchNumber] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setProductChoice("");
    setWarehouseId(fixedWarehouseId ?? "");
    setName("");
    setManufacturer("");
    setEan("");
    setSku("");
    setCatalogCategory("");
    setUnit("UNIT");
    setPurchasePrice("");
    setSalePrice("");
    setStockQuantity("1");
    setExpiryDate("");
    setBatchNumber("");
    setNote("");
  }, [fixedWarehouseId, open]);

  const isNewProduct = productChoice === NEW_PRODUCT;

  async function save() {
    if (!productChoice) return toast.error("Wybierz produkt lub opcję „Inny produkt”");
    if (!warehouseId) return toast.error("Wybierz magazyn");

    const parsedQuantity = Number(stockQuantity.replace(",", "."));
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return toast.error("Podaj prawidłową ilość");
    if (!expiryDate) return toast.error("Podaj termin ważności");

    let newProduct: {
      name: string;
      manufacturer?: string;
      ean?: string;
      sku?: string;
      catalogCategory?: string;
      unit: string;
      purchasePrice: number;
      salePrice: number;
    } | undefined;

    if (isNewProduct) {
      if (name.trim().length < 2) return toast.error("Podaj nazwę produktu");
      if (!purchasePrice.trim()) return toast.error("Podaj cenę zakupu");
      if (!salePrice.trim()) return toast.error("Podaj cenę sprzedaży");

      const parsedPurchasePrice = parsePLNToGrosze(purchasePrice);
      const parsedSalePrice = parsePLNToGrosze(salePrice);
      if (parsedPurchasePrice == null || parsedPurchasePrice < 0) return toast.error("Podaj prawidłową cenę zakupu");
      if (parsedSalePrice == null || parsedSalePrice < 0) return toast.error("Podaj prawidłową cenę sprzedaży");

      newProduct = {
        name: name.trim(),
        manufacturer: manufacturer.trim() || undefined,
        ean: ean.trim() || undefined,
        sku: sku.trim() || undefined,
        catalogCategory: catalogCategory.trim() || undefined,
        unit,
        purchasePrice: parsedPurchasePrice,
        salePrice: parsedSalePrice,
      };
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/stocks/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: isNewProduct ? undefined : productChoice,
          newProduct,
          warehouseId,
          delta: parsedQuantity,
          expiryDate,
          batchNumber: batchNumber.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Nie udało się dodać produktu");

      toast.success(isNewProduct ? "Nowy produkt został utworzony i dodany do magazynu" : "Produkt został dodany do magazynu");
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się dodać produktu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Dodaj produkt do magazynu</DialogTitle></DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Produkt</Label>
            <Select value={productChoice} onValueChange={setProductChoice}>
              <SelectTrigger><SelectValue placeholder="Wybierz produkt" /></SelectTrigger>
              <SelectContent disablePortal>
                <SelectItem value={NEW_PRODUCT}>Inny produkt</SelectItem>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.sku ? `${product.sku} • ` : ""}{product.name}{product.manufacturer ? ` • ${product.manufacturer}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fixedWarehouseId ? (
            <div className="space-y-2 sm:col-span-2">
              <Label>Magazyn</Label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
                {fixedWarehouseName ?? warehouses.find((warehouse) => warehouse.id === fixedWarehouseId)?.name ?? "—"}
              </div>
            </div>
          ) : (
            <div className="space-y-2 sm:col-span-2">
              <Label>Magazyn *</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Wybierz magazyn" /></SelectTrigger>
                <SelectContent disablePortal>
                  {warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isNewProduct ? (
            <>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="new-product-name">Nazwa *</Label>
                <Input id="new-product-name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-product-manufacturer">Firma (opcjonalnie)</Label>
                <Input id="new-product-manufacturer" value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-product-category">Kategoria (opcjonalnie)</Label>
                <Input id="new-product-category" value={catalogCategory} onChange={(event) => setCatalogCategory(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-product-ean">EAN (opcjonalnie)</Label>
                <Input id="new-product-ean" value={ean} onChange={(event) => setEan(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-product-sku">SKU (opcjonalnie)</Label>
                <Input id="new-product-sku" value={sku} onChange={(event) => setSku(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Jednostka (opcjonalnie)</Label>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent disablePortal>
                    {UNIT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-product-purchase-price">Cena zakupu (PLN) *</Label>
                <Input id="new-product-purchase-price" inputMode="decimal" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="np. 500,00" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-product-sale-price">Cena sprzedaży (PLN) *</Label>
                <Input id="new-product-sale-price" inputMode="decimal" value={salePrice} onChange={(event) => setSalePrice(event.target.value)} placeholder="np. 690,00" />
              </div>
            </>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="new-stock-quantity">Ilość *</Label>
            <Input id="new-stock-quantity" type="number" min="0.01" step="0.01" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-stock-expiry">Termin ważności *</Label>
            <Input id="new-stock-expiry" type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="new-stock-batch">Numer partii (opcjonalnie)</Label>
            <Input id="new-stock-batch" value={batchNumber} onChange={(event) => setBatchNumber(event.target.value)} placeholder="Zostanie wygenerowany automatycznie" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="new-stock-note">Notatka (opcjonalnie)</Label>
            <Input id="new-stock-note" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Anuluj</Button>
          <Button
            onClick={save}
            disabled={saving || !productChoice || !warehouseId || !expiryDate}
            className="bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:text-white"
          >
            {saving ? "Dodawanie..." : "Dodaj"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
