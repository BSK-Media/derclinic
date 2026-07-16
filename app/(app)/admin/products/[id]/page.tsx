"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parsePLNToGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const UNIT_OPTIONS = [
  { value: "UNIT", label: "szt." },
  { value: "ML", label: "ml" },
  { value: "AMPULE", label: "ampułka" },
  { value: "BOTOX_UNIT", label: "jedn. botox" },
] as const;

function unitLabel(unit: string) {
  return UNIT_OPTIONS.find((u) => u.value === unit)?.label ?? unit;
}

function money(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value / 100);
}

type ServiceLite = { id: string; name: string; category: string | null };
type Suggestion = {
  id: string;
  serviceId: string;
  quantity: string;
  unit: string;
  service: ServiceLite;
};

export default function ProductDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data, mutate } = useSWR(id ? `/api/admin/products/${id}` : null, fetcher);
  const product = data?.product;
  const services: ServiceLite[] = data?.services ?? [];

  if (!product) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Ładowanie danych produktu...</div>;
  }

  const totalQty = product.stocks.reduce((sum: number, stock: { quantity: string }) => sum + Number(stock.quantity), 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          <Link href="/admin/products" className="hover:underline">Produkty</Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700 dark:text-slate-200">{product.name}</span>
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{product.name}</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card><CardContent className="p-5"><div className="text-sm text-slate-500">Firma</div><div className="mt-1 text-xl font-semibold">{product.manufacturer ?? "—"}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-sm text-slate-500">Kategoria</div><div className="mt-1 text-xl font-semibold">{product.catalogCategory ?? "—"}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-sm text-slate-500">Łączny stan</div><div className="mt-1 text-xl font-semibold">{totalQty}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-sm text-slate-500">EAN</div><div className="mt-1 text-xl font-semibold">{product.ean ?? "—"}</div></CardContent></Card>
      </div>

      <EditProductCard product={product} onSaved={() => mutate()} />

      <ServicesUsingProductCard
        productId={product.id}
        productUnit={product.unit}
        suggestions={(product.serviceSuggestions ?? []) as Suggestion[]}
        services={services}
        onChanged={() => mutate()}
      />

      <Card>
        <CardHeader><CardTitle>Stany magazynowe</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Magazyn</TableHead><TableHead>Ilość</TableHead></TableRow></TableHeader>
            <TableBody>
              {product.stocks.map((stock: any) => (
                <TableRow key={stock.id}><TableCell>{stock.warehouse.name}</TableCell><TableCell>{Number(stock.quantity)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Serie / partie</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partia</TableHead>
                <TableHead>Termin ważności</TableHead>
                <TableHead>Stan</TableHead>
                <TableHead>Wartość zakupu</TableHead>
                <TableHead>Lokalizacja</TableHead>
                <TableHead>Magazyn</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.lots.map((lot: any) => (
                <TableRow key={lot.id}>
                  <TableCell className="font-medium">{lot.batchNumber}</TableCell>
                  <TableCell>{lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString("pl-PL") : "—"}</TableCell>
                  <TableCell>{Number(lot.quantity)}</TableCell>
                  <TableCell>{money(lot.purchasePrice)}</TableCell>
                  <TableCell>{lot.location ?? "—"}</TableCell>
                  <TableCell>{lot.warehouse.name}</TableCell>
                  <TableCell>{lot.status ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function EditProductCard({ product, onSaved }: { product: any; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("");
  const [sku, setSku] = useState("");
  const [ean, setEan] = useState("");
  const [unit, setUnit] = useState("UNIT");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [isActive, setIsActive] = useState("true");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(product.name ?? "");
    setManufacturer(product.manufacturer ?? "");
    setCatalogCategory(product.catalogCategory ?? "");
    setSku(product.sku ?? "");
    setEan(product.ean ?? "");
    setUnit(product.unit ?? "UNIT");
    setPurchasePrice(product.purchasePrice != null ? (product.purchasePrice / 100).toString() : "");
    setSalePrice(product.salePrice != null ? (product.salePrice / 100).toString() : "");
    setIsActive(product.isActive ? "true" : "false");
  }, [product.id]);

  async function save() {
    if (name.trim().length < 2) return toast.error("Nazwa musi mieć min. 2 znaki.");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          manufacturer: manufacturer.trim() || null,
          catalogCategory: catalogCategory.trim() || null,
          sku: sku.trim(),
          ean: ean.trim(),
          unit,
          purchasePrice: purchasePrice.trim() ? parsePLNToGrosze(purchasePrice) : null,
          salePrice: salePrice.trim() ? parsePLNToGrosze(salePrice) : null,
          isActive: isActive === "true",
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać produktu");
      toast.success("Zapisano dane produktu");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Dane produktu (edycja)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2 lg:col-span-2">
            <Label>Nazwa</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Firma (producent)</Label>
            <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Kategoria</Label>
            <Input value={catalogCategory} onChange={(e) => setCatalogCategory(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>SKU</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>EAN (kod kreskowy)</Label>
            <Input value={ean} onChange={(e) => setEan(e.target.value)} placeholder="np. 5901234123457" />
          </div>
          <div className="space-y-2">
            <Label>Jednostka</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Cena zakupu (PLN)</Label>
            <Input value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="np. 500,50" />
          </div>
          <div className="space-y-2">
            <Label>Cena sprzedaży (PLN)</Label>
            <Input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="np. 690,69" />
          </div>
          <div className="space-y-2">
            <Label>Aktywny</Label>
            <Select value={isActive} onValueChange={setIsActive}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Tak</SelectItem>
                <SelectItem value="false">Nie</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? "Zapisywanie..." : "Zapisz zmiany"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ServicesUsingProductCard({
  productId,
  productUnit,
  suggestions,
  services,
  onChanged,
}: {
  productId: string;
  productUnit: string;
  suggestions: Suggestion[];
  services: ServiceLite[];
  onChanged: () => void;
}) {
  const [qtyEdits, setQtyEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Formularz dodawania zabiegu
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ServiceLite | null>(null);
  const [newQty, setNewQty] = useState("1");
  const [newUnit, setNewUnit] = useState<string>(productUnit || "UNIT");
  const [adding, setAdding] = useState(false);

  const assignedIds = useMemo(() => new Set(suggestions.map((s) => s.serviceId)), [suggestions]);

  // Podpowiedzi zabiegów na żywo (pomija już przypisane)
  const serviceSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = services.filter((sv) => !assignedIds.has(sv.id));
    if (q.length < 2) return pool.slice(0, 8);
    const startsWith = pool.filter((sv) => sv.name.toLowerCase().startsWith(q));
    const contains = pool.filter(
      (sv) => !sv.name.toLowerCase().startsWith(q) && sv.name.toLowerCase().includes(q),
    );
    return [...startsWith, ...contains].slice(0, 8);
  }, [services, assignedIds, query]);

  async function upsert(serviceId: string, quantity: number, unit: string) {
    const res = await fetch(`/api/admin/services/${serviceId}/suggestions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, quantity, unit }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) {
      toast.error(out?.message || "Nie udało się zapisać");
      return false;
    }
    return true;
  }

  async function saveQty(sg: Suggestion) {
    const raw = (qtyEdits[sg.serviceId] ?? String(sg.quantity)).replace(",", ".");
    const q = Number(raw);
    if (!Number.isFinite(q) || q <= 0) return toast.error("Niepoprawna ilość");
    setSavingId(sg.serviceId);
    try {
      if (await upsert(sg.serviceId, q, sg.unit)) {
        toast.success("Zapisano ilość");
        setQtyEdits((m) => {
          const n = { ...m };
          delete n[sg.serviceId];
          return n;
        });
        onChanged();
      }
    } finally {
      setSavingId(null);
    }
  }

  async function removeFromService(sg: Suggestion) {
    setSavingId(sg.serviceId);
    try {
      const res = await fetch(
        `/api/admin/services/${sg.serviceId}/suggestions?productId=${encodeURIComponent(productId)}`,
        { method: "DELETE" },
      );
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się usunąć");
      toast.success("Usunięto preparat z zabiegu");
      onChanged();
    } finally {
      setSavingId(null);
    }
  }

  async function addToService() {
    if (!selected) return toast.error("Wybierz zabieg z listy.");
    const q = Number(newQty.replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) return toast.error("Niepoprawna ilość");
    setAdding(true);
    try {
      if (await upsert(selected.id, q, newUnit)) {
        toast.success("Dodano preparat do zabiegu");
        setSelected(null);
        setQuery("");
        setNewQty("1");
        onChanged();
      }
    } finally {
      setAdding(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Zabiegi wykorzystujące ten preparat</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {suggestions.length === 0 ? (
          <div className="text-sm text-slate-500">Ten preparat nie jest jeszcze przypisany do żadnego zabiegu.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zabieg</TableHead>
                <TableHead>Kategoria</TableHead>
                <TableHead className="w-40">Ilość na zabieg</TableHead>
                <TableHead className="w-28">Jednostka</TableHead>
                <TableHead className="w-56">Działania</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestions.map((sg) => {
                const current = String(sg.quantity);
                const value = qtyEdits[sg.serviceId] ?? current;
                const dirty = qtyEdits[sg.serviceId] !== undefined && qtyEdits[sg.serviceId] !== current;
                return (
                  <TableRow key={sg.id}>
                    <TableCell className="font-medium">{sg.service.name}</TableCell>
                    <TableCell className="text-slate-500">{sg.service.category || "—"}</TableCell>
                    <TableCell>
                      <Input
                        value={value}
                        onChange={(e) => setQtyEdits((m) => ({ ...m, [sg.serviceId]: e.target.value }))}
                      />
                    </TableCell>
                    <TableCell>{unitLabel(sg.unit)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveQty(sg)} disabled={savingId === sg.serviceId || !dirty}>
                          {savingId === sg.serviceId ? "..." : "Zapisz"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          onClick={() => removeFromService(sg)}
                          disabled={savingId === sg.serviceId}
                        >
                          Usuń
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Dodawanie zabiegu do preparatu */}
        <div className="space-y-3 border-t pt-4">
          <div className="text-sm font-medium">Dodaj zabieg wykorzystujący ten preparat</div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Zabieg</Label>
              <div className="relative">
                <Input
                  value={selected ? selected.name : query}
                  onChange={(e) => {
                    setSelected(null);
                    setQuery(e.target.value);
                    setOpen(true);
                  }}
                  onFocus={() => setOpen(true)}
                  onBlur={() => setTimeout(() => setOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setOpen(false);
                  }}
                  placeholder="Zacznij pisać, aby wyszukać zabieg..."
                />
                {open && !selected && serviceSuggestions.length > 0 ? (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
                    {serviceSuggestions.map((sv) => (
                      <button
                        key={sv.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelected(sv);
                          setOpen(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                      >
                        <div className="truncate">{sv.name}</div>
                        <div className="truncate text-xs text-zinc-500">{sv.category || "Bez kategorii"}</div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ilość na zabieg</Label>
              <Input value={newQty} onChange={(e) => setNewQty(e.target.value)} placeholder="np. 1, 0.5, 20" />
            </div>
            <div className="space-y-2">
              <Label>Jednostka</Label>
              <Select value={newUnit} onValueChange={setNewUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={addToService} disabled={adding || !selected}>
              {adding ? "Dodawanie..." : "Dodaj do zabiegu"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
