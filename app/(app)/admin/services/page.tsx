"use client";

import useSWR from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";
import { useAuth } from "@/components/auth-provider";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Product = { id: string; name: string; unit: string };
type Suggestion = {
  id: string;
  productId: string;
  quantity: string;
  unit: string;
  product: Product;
};
const SERVICE_CATEGORIES = [
  "Medycyna estetyczna",
  "Dermatologia",
  "Kosmetologia estetyczna",
  "Ginekologia",
  "Chirurgia plastyczna",
  "Chirurgia naczyniowa",
  "Badania USG",
  "Centrum leczenia ran",
  "Leczenie otyłości",
] as const;

type Specialist = { id: string; name: string };
type Service = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  durationMin: number;
  priceFrom?: number | null;
  priceSuggested?: number | null;
  suggestedProducts: Suggestion[];
  specialistAssignments: Array<{ specialistId: string }>;
};

type ServicesPageProps = {
  searchParams?: {
    serviceId?: string | string[];
  };
};

export default function ServicesPage({ searchParams }: ServicesPageProps) {
  const requestedServiceId = Array.isArray(searchParams?.serviceId)
    ? searchParams?.serviceId[0]
    : searchParams?.serviceId;
  const handledServiceId = useRef<string | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { data, mutate, isLoading } = useSWR("/api/admin/services", fetcher);
  const services: Service[] = data?.services ?? [];
  const products: Product[] = data?.products ?? [];
  const specialists: Specialist[] = data?.specialists ?? [];

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(SERVICE_CATEGORIES[0]);
  const [durationMin, setDurationMin] = useState("30");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceSuggested, setPriceSuggested] = useState("");
  const [newServiceSpecialists, setNewServiceSpecialists] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function toggleNewServiceSpecialist(id: string) {
    setNewServiceSpecialists((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  async function create() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          durationMin: Number(durationMin),
          priceFrom: priceFrom ? parsePLNToGrosze(priceFrom) : null,
          priceSuggested: priceSuggested ? parsePLNToGrosze(priceSuggested) : null,
          specialistIds: newServiceSpecialists,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Usługa dodana");
      setName("");
      setCategory(SERVICE_CATEGORIES[0]);
      setDurationMin("30");
      setPriceFrom("");
      setPriceSuggested("");
      setNewServiceSpecialists([]);
      mutate();
    } finally {
      setSaving(false);
    }
  }

  const [managingId, setManagingId] = useState<string | null>(null);
  const managingService = services.find((sv) => sv.id === managingId) ?? null;

  async function toggleAssignment(serviceId: string, specialistId: string, assigned: boolean) {
    const res = await fetch(`/api/admin/services/${serviceId}/specialists`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ specialistId, assigned }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok)
      return toast.error(out?.message || "Nie udało się zapisać przypisania");
    toast.success(assigned ? "Przypisano specjaliście" : "Odpisano od specjalisty");
    mutate();
  }

  async function removeSuggestion(serviceId: string, productId: string) {
    const res = await fetch(
      `/api/admin/services/${serviceId}/suggestions?productId=${encodeURIComponent(productId)}`,
      { method: "DELETE" },
    );
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success("Usunięto");
    mutate();
  }

  // Kolejność kategorii jak w cenniku na stronie www
  const CATEGORY_ORDER = [
    "Autorskie terapie Dr Marty",
    "Laser tulowy",
    "Kosmetologia",
    "PRO XN - Twarz",
    "Toksyna botulinowa BOTOX - likwidacja zmarszczek",
    "Dermatologia",
    "Chirurgia plastyczna",
    "Ginekologia",
    "Chirurgia naczyniowa",
    "Chirurgia ogólna",
    "Leczenie otyłości",
    "Hydrafacial nr 1 w USA ( oczyszczanie wodorowe)",
    "MEDIDERMA - zabiegi na twarz",
    "MedEstelle - zabiegi bankietowe na twarz",
    "Mezoterapia igłowa / Stymulatory tkankowe",
    "Icoone - zabiegi na ciało",
    "Radiofrekwencja mikroigłowa RF",
    "Kwas Hialuronowy - wypełnienie / modelowanie",
    "Konsultacje Specjalistyczne",
    "Nici - liftingujące, stymulujące",
    "DERMAPEN 4.0",
    "Tropokolagen GUNA",
    "Zabiegi ANTI-AGING odmłodzenie/ujędrnienie",
    "Bandaże AROSHA",
    "Nebula",
    "ScarINK – Kompleksowa Terapia",
    "Makijaż permanentny",
  ];

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Podpowiedzi na żywo podczas wpisywania (maks. 8 trafień)
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const startsWith = services.filter((sv) => sv.name.toLowerCase().startsWith(q));
    const contains = services.filter(
      (sv) => !sv.name.toLowerCase().startsWith(q) && sv.name.toLowerCase().includes(q),
    );
    return [...startsWith, ...contains].slice(0, 8);
  }, [services, query]);

  function goToService(sv: Service) {
    const cat = sv.category?.trim() || "Bez kategorii";
    setQuery("");
    setSuggestionsOpen(false);
    setExpanded((prev) => new Set(prev).add(cat));
    setHighlightId(sv.id);
    // Poczekaj aż sekcja się wyrenderuje, potem przewiń do zabiegu
    setTimeout(() => {
      document
        .getElementById(`service-row-${sv.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    setTimeout(() => setHighlightId(null), 2500);
  }

  useEffect(() => {
    if (!requestedServiceId || handledServiceId.current === requestedServiceId) return;
    const service = services.find((item) => item.id === requestedServiceId);
    if (!service) return;

    handledServiceId.current = requestedServiceId;
    const category = service.category?.trim() || "Bez kategorii";
    setExpanded((current) => new Set(current).add(category));
    setHighlightId(service.id);

    const scrollTimer = window.setTimeout(() => {
      document
        .getElementById(`service-row-${service.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    const highlightTimer = window.setTimeout(() => setHighlightId(null), 2500);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [requestedServiceId, services]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? services.filter(
          (sv) =>
            sv.name.toLowerCase().includes(q) || (sv.category ?? "").toLowerCase().includes(q),
        )
      : services;

    const byCategory = new Map<string, Service[]>();
    for (const sv of filtered) {
      const key = sv.category?.trim() || "Bez kategorii";
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(sv);
    }
    for (const list of byCategory.values()) list.sort((a, b) => a.name.localeCompare(b.name, "pl"));

    const orderIndex = (cat: string) => {
      const i = CATEGORY_ORDER.indexOf(cat);
      return i === -1 ? CATEGORY_ORDER.length : i;
    };
    return [...byCategory.entries()].sort((a, b) => {
      const d = orderIndex(a[0]) - orderIndex(b[0]);
      return d !== 0 ? d : a[0].localeCompare(b[0], "pl");
    });
  }, [services, query]);

  const searching = query.trim().length > 0;

  function toggleCategory(cat: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Usługi i zabiegi</h1>

      <Card className="space-y-4 p-4">
        <div className="font-medium">Dodaj usługę</div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Nazwa</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Kategoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz kategorię" />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Czas trwania (min)</Label>
            <Input value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Cena od (PLN)</Label>
            <Input
              value={priceFrom}
              onChange={(e) => setPriceFrom(e.target.value)}
              placeholder="np. 500"
            />
          </div>
          <div className="space-y-2">
            <Label>Cena sugerowana (PLN)</Label>
            <Input
              value={priceSuggested}
              onChange={(e) => setPriceSuggested(e.target.value)}
              placeholder="np. 800"
            />
          </div>
        </div>
        {isAdmin ? (
          <div className="space-y-2">
            <Label>Przypisz specjalistom (opcjonalnie)</Label>
            <div className="flex flex-wrap gap-2">
              {specialists.map((sp) => {
                const selected = newServiceSpecialists.includes(sp.id);
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => toggleNewServiceSpecialist(sp.id)}
                    className={
                      "rounded-full border px-3 py-1 text-xs transition " +
                      (selected
                        ? "border-emerald-300 bg-emerald-100 font-medium text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800")
                    }
                  >
                    {selected ? "✓ " : ""}
                    {sp.name}
                  </button>
                );
              })}
              {specialists.length === 0 ? (
                <span className="text-xs text-zinc-500">Brak specjalistów.</span>
              ) : null}
            </div>
            <div className="text-xs text-zinc-500">
              Usługa będzie widoczna na liście zabiegów tylko u przypisanych specjalistów.
            </div>
          </div>
        ) : null}
        <Button onClick={create} disabled={!name || saving}>
          {saving ? "Zapisywanie..." : "Dodaj"}
        </Button>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="font-medium">Lista zabiegów</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Input
                className="w-72"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSuggestionsOpen(false);
                  if (e.key === "Enter" && suggestions.length > 0) goToService(suggestions[0]);
                }}
                placeholder="Szukaj zabiegu lub kategorii..."
              />
              {suggestionsOpen && suggestions.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
                  {suggestions.map((sv) => (
                    <button
                      key={sv.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        goToService(sv);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    >
                      <div className="truncate">{sv.name}</div>
                      <div className="truncate text-xs text-zinc-500">
                        {sv.category || "Bez kategorii"}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded(new Set(grouped.map(([c]) => c)))}
            >
              Rozwiń wszystkie
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExpanded(new Set())}>
              Zwiń wszystkie
            </Button>
          </div>
        </div>
        <div className="divide-y">
          {isLoading && <div className="p-4 text-sm text-zinc-500">Ładowanie...</div>}
          {!isLoading && grouped.length === 0 && (
            <div className="p-4 text-sm text-zinc-500">Brak usług.</div>
          )}
          {grouped.map(([cat, items]) => {
            const open = searching || expanded.has(cat);
            return (
              <div key={cat}>
                <button
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className="flex w-full items-center justify-between gap-3 bg-zinc-50/70 px-4 py-3 text-left hover:bg-zinc-100 dark:bg-zinc-900/60 dark:hover:bg-zinc-900"
                >
                  <span className="text-sm font-semibold uppercase tracking-wide text-zinc-800 dark:text-zinc-100">
                    {cat}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-zinc-500">
                    <span>
                      {items.length}{" "}
                      {items.length === 1 ? "zabieg" : items.length < 5 ? "zabiegi" : "zabiegów"}
                    </span>
                    <span className="text-base leading-none">{open ? "−" : "+"}</span>
                  </span>
                </button>

                {open ? (
                  <div className="divide-y border-t">
                    {items.map((s) => (
                      <div
                        key={s.id}
                        id={`service-row-${s.id}`}
                        className={
                          "space-y-2 p-4 pl-6 transition-colors " +
                          (highlightId === s.id
                            ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-500/10 dark:ring-emerald-500/40"
                            : "")
                        }
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">{s.name}</div>
                            <div className="text-xs text-zinc-500">
                              {s.category || "Bez kategorii"}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {s.durationMin} min •{" "}
                              {s.priceFrom ? `od ${formatPLNFromGrosze(s.priceFrom)}` : "—"} •
                              sugerowana: {formatPLNFromGrosze(s.priceSuggested)}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => setManagingId(s.id)}>
                            Preparaty
                          </Button>
                        </div>
                        <div className="text-sm text-zinc-600 dark:text-zinc-300">
                          Sugerowane preparaty (warianty A/B/C):{" "}
                          {s.suggestedProducts.length === 0 ? "—" : ""}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {s.suggestedProducts.map((sp) => (
                            <div
                              key={sp.id}
                              className="flex items-center gap-2 rounded-full border bg-zinc-50 px-3 py-1 text-xs dark:bg-zinc-900"
                            >
                              <span>
                                {sp.product.name} • {sp.quantity} {sp.unit}
                              </span>
                              <button
                                className="text-red-600"
                                onClick={() => removeSuggestion(s.id, sp.productId)}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        {isAdmin ? (
                          <div className="space-y-1 border-t pt-2">
                            <div className="text-sm text-zinc-600 dark:text-zinc-300">
                              Przypisani specjaliści (kliknij, aby przypisać/odpisać):
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {specialists.map((sp) => {
                                const assigned =
                                  s.specialistAssignments?.some((a) => a.specialistId === sp.id) ??
                                  false;
                                return (
                                  <button
                                    key={sp.id}
                                    type="button"
                                    onClick={() => toggleAssignment(s.id, sp.id, !assigned)}
                                    className={
                                      "rounded-full border px-3 py-1 text-xs transition " +
                                      (assigned
                                        ? "border-emerald-300 bg-emerald-100 font-medium text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                                        : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800")
                                    }
                                  >
                                    {assigned ? "✓ " : ""}
                                    {sp.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <SuggestionsDialog
        service={managingService}
        products={products}
        onClose={() => setManagingId(null)}
        onChanged={() => mutate()}
        onRemove={(productId) => managingService && removeSuggestion(managingService.id, productId)}
      />
    </div>
  );
}

const UNIT_OPTIONS = [
  { value: "UNIT", label: "szt." },
  { value: "ML", label: "ml" },
  { value: "AMPULE", label: "ampułka" },
  { value: "BOTOX_UNIT", label: "jedn. botox" },
] as const;

function SuggestionsDialog({
  service,
  products,
  onClose,
  onChanged,
  onRemove,
}: {
  service: Service | null;
  products: Product[];
  onClose: () => void;
  onChanged: () => void;
  onRemove: (productId: string) => void;
}) {
  const [productQuery, setProductQuery] = useState("");
  const [productOpen, setProductOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState<string>("UNIT");
  const [saving, setSaving] = useState(false);

  // Reset formularza przy każdym otwarciu okna dla innego zabiegu
  const serviceId = service?.id ?? null;
  useEffect(() => {
    setProductQuery("");
    setSelectedProduct(null);
    setQty("1");
    setUnit("UNIT");
  }, [serviceId]);

  // Podpowiedzi produktów na żywo
  const productSuggestions = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (q.length < 1) return products.slice(0, 8);
    const startsWith = products.filter((pr) => pr.name.toLowerCase().startsWith(q));
    const contains = products.filter(
      (pr) => !pr.name.toLowerCase().startsWith(q) && pr.name.toLowerCase().includes(q),
    );
    return [...startsWith, ...contains].slice(0, 8);
  }, [products, productQuery]);

  async function add() {
    if (!service || !selectedProduct) return toast.error("Wybierz preparat z listy.");
    const q = Number(qty.replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) return toast.error("Niepoprawna ilość");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/services/${service.id}/suggestions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: selectedProduct.id, quantity: q, unit }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się dodać preparatu");
      toast.success("Dodano preparat do zabiegu");
      setSelectedProduct(null);
      setProductQuery("");
      setQty("1");
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!service} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Preparaty: {service?.name}</DialogTitle>
        </DialogHeader>

        {/* Aktualnie przypisane preparaty */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Przypisane preparaty</div>
          {service && service.suggestedProducts.length === 0 ? (
            <div className="text-sm text-zinc-500">Brak przypisanych preparatów.</div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {service?.suggestedProducts.map((sp) => (
              <div
                key={sp.id}
                className="flex items-center gap-2 rounded-full border bg-zinc-50 px-3 py-1 text-xs dark:bg-zinc-900"
              >
                <span>
                  {sp.product.name} • {sp.quantity}{" "}
                  {UNIT_OPTIONS.find((u) => u.value === sp.unit)?.label ?? sp.unit}
                </span>
                <button
                  className="text-red-600"
                  onClick={() => onRemove(sp.productId)}
                  title="Usuń"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Dodawanie preparatu */}
        <div className="space-y-3 border-t pt-4">
          <div className="text-sm font-medium">Dodaj preparat</div>

          <div className="space-y-2">
            <Label>Preparat (z magazynu)</Label>
            <div className="relative">
              <Input
                value={selectedProduct ? selectedProduct.name : productQuery}
                onChange={(e) => {
                  setSelectedProduct(null);
                  setProductQuery(e.target.value);
                  setProductOpen(true);
                }}
                onFocus={() => setProductOpen(true)}
                onBlur={() => setTimeout(() => setProductOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setProductOpen(false);
                }}
                placeholder="Zacznij pisać, aby wyszukać..."
              />
              {productOpen && !selectedProduct && productSuggestions.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-[1100] mt-1 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
                  {productSuggestions.map((pr) => (
                    <button
                      key={pr.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSelectedProduct(pr);
                        setProductOpen(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    >
                      {pr.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Ilość</Label>
              <Input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="np. 1, 0.5, 20"
              />
            </div>
            <div className="space-y-2">
              <Label>Jednostka</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent disablePortal>
                  {UNIT_OPTIONS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={add} disabled={saving || !selectedProduct}>
              {saving ? "Dodawanie..." : "Dodaj preparat"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
