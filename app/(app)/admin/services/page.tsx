"use client";

import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

// Kolejność kategorii jak w cenniku na stronie www.
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

const ALL_CATEGORIES = "__all__";

type Specialist = { id: string; name: string };
type Service = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  durationMin: number;
  price?: number | null;
  suggestedProducts: Suggestion[];
  specialistAssignments: Array<{ specialistId: string }>;
};

type ServicesPageProps = {
  searchParams?: {
    serviceId?: string | string[];
  };
};

export default function ServicesPage({ searchParams }: ServicesPageProps) {
  const router = useRouter();
  const requestedServiceId = Array.isArray(searchParams?.serviceId)
    ? searchParams?.serviceId[0]
    : searchParams?.serviceId;
  const handledServiceId = useRef<string | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const { data, mutate, isLoading } = useSWR("/api/admin/services", fetcher);
  const services: Service[] = data?.services ?? [];
  const specialists: Specialist[] = data?.specialists ?? [];

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(SERVICE_CATEGORIES[0]);
  const [durationMin, setDurationMin] = useState("30");
  const [price, setPrice] = useState("");
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
          price: price ? parsePLNToGrosze(price) : null,
          specialistIds: newServiceSpecialists,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Usługa dodana");
      setName("");
      setCategory(SERVICE_CATEGORIES[0]);
      setDurationMin("30");
      setPrice("");
      setNewServiceSpecialists([]);
      mutate();
    } finally {
      setSaving(false);
    }
  }

  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const [categoryQuery, setCategoryQuery] = useState("");
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
    setQuery("");
    setSuggestionsOpen(false);
    router.push(`/admin/services/${sv.id}`);
  }

  useEffect(() => {
    if (!requestedServiceId || handledServiceId.current === requestedServiceId) return;
    const service = services.find((item) => item.id === requestedServiceId);
    if (!service) return;

    handledServiceId.current = requestedServiceId;
    const category = service.category?.trim() || "Bez kategorii";
    setSelectedCategory(category);
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

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const service of services) {
      const categoryName = service.category?.trim() || "Bez kategorii";
      counts.set(categoryName, (counts.get(categoryName) ?? 0) + 1);
    }

    const orderIndex = (categoryName: string) => {
      const index = CATEGORY_ORDER.indexOf(categoryName);
      return index === -1 ? CATEGORY_ORDER.length : index;
    };

    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((first, second) => {
        const orderDifference = orderIndex(first.name) - orderIndex(second.name);
        return orderDifference !== 0
          ? orderDifference
          : first.name.localeCompare(second.name, "pl");
      });
  }, [services]);

  const visibleCategories = useMemo(() => {
    const normalizedQuery = categoryQuery.trim().toLocaleLowerCase("pl");
    if (!normalizedQuery) return categories;
    return categories.filter((item) =>
      item.name.toLocaleLowerCase("pl").includes(normalizedQuery),
    );
  }, [categories, categoryQuery]);

  const visibleServices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services
      .filter((service) => {
        const serviceCategory = service.category?.trim() || "Bez kategorii";
        if (selectedCategory !== ALL_CATEGORIES && serviceCategory !== selectedCategory) {
          return false;
        }
        if (!q) return true;
        return (
          service.name.toLowerCase().includes(q) ||
          serviceCategory.toLowerCase().includes(q) ||
          service.suggestedProducts.some((suggestion) =>
            suggestion.product.name.toLowerCase().includes(q),
          )
        );
      })
      .sort((first, second) => first.name.localeCompare(second.name, "pl"));
  }, [services, selectedCategory, query]);

  const selectedCategoryLabel =
    selectedCategory === ALL_CATEGORIES ? "Wszystkie usługi" : selectedCategory;

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
            <Label>Cena (PLN)</Label>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="np. 800" />
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

      <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium">Katalog zabiegów</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              Wybierz kategorię, aby wyświetlić przypisane do niej usługi.
            </div>
          </div>
          <div className="relative w-full sm:w-80">
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSuggestionsOpen(true);
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSuggestionsOpen(false);
                if (event.key === "Enter" && suggestions.length > 0) goToService(suggestions[0]);
              }}
              placeholder="Szukaj usługi, kategorii lub preparatu..."
            />
            {suggestionsOpen && suggestions.length > 0 ? (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
                {suggestions.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      goToService(service);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  >
                    <div className="truncate">{service.name}</div>
                    <div className="truncate text-xs text-zinc-500">
                      {service.category || "Bez kategorii"}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
          <div className="border-b p-4">
            <div className="font-medium">Kategorie</div>
            <Input
              className="mt-3"
              value={categoryQuery}
              onChange={(event) => setCategoryQuery(event.target.value)}
              placeholder="Szukaj kategorii..."
            />
          </div>
          <div className="max-h-[680px] space-y-1 overflow-y-auto p-2">
            <button
              type="button"
              onClick={() => setSelectedCategory(ALL_CATEGORIES)}
              className={
                "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors " +
                (selectedCategory === ALL_CATEGORIES
                  ? "bg-emerald-100 font-medium text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900")
              }
            >
              <span>Wszystkie usługi</span>
              <span className="text-xs text-zinc-500">{services.length}</span>
            </button>
            {visibleCategories.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => setSelectedCategory(item.name)}
                className={
                  "flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors " +
                  (selectedCategory === item.name
                    ? "bg-emerald-100 font-medium text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900")
                }
              >
                <span className="min-w-0 leading-5">{item.name}</span>
                <span className="shrink-0 text-xs text-zinc-500">{item.count}</span>
              </button>
            ))}
            {visibleCategories.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-zinc-500">
                Brak pasujących kategorii.
              </div>
            ) : null}
          </div>
        </aside>

        <section className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <div className="font-medium">{selectedCategoryLabel}</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {visibleServices.length}{" "}
                {visibleServices.length === 1
                  ? "usługa"
                  : visibleServices.length > 1 && visibleServices.length < 5
                    ? "usługi"
                    : "usług"}
              </div>
            </div>
            {selectedCategory !== ALL_CATEGORIES ? (
              <Button variant="outline" size="sm" onClick={() => setSelectedCategory(ALL_CATEGORIES)}>
                Pokaż wszystkie
              </Button>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[minmax(260px,1.5fr)_minmax(190px,1fr)_100px_130px_minmax(240px,1.2fr)_130px] gap-3 border-b bg-zinc-50/70 px-4 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60">
                <div>Usługa</div>
                <div>Kategoria</div>
                <div>Czas</div>
                <div>Cena</div>
                <div>Preparaty</div>
                <div className="text-right">Działania</div>
              </div>

              {isLoading ? (
                <div className="p-6 text-sm text-zinc-500">Ładowanie...</div>
              ) : visibleServices.length === 0 ? (
                <div className="p-8 text-center text-sm text-zinc-500">
                  Brak usług w wybranej kategorii.
                </div>
              ) : (
                <div className="divide-y">
                  {visibleServices.map((service) => (
                    <div
                      key={service.id}
                      id={`service-row-${service.id}`}
                      className={
                        "grid grid-cols-[minmax(260px,1.5fr)_minmax(190px,1fr)_100px_130px_minmax(240px,1.2fr)_130px] items-center gap-3 px-4 py-4 transition-colors " +
                        (highlightId === service.id
                          ? "bg-emerald-50 ring-1 ring-inset ring-emerald-300 dark:bg-emerald-500/10 dark:ring-emerald-500/40"
                          : "hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40")
                      }
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/admin/services/${service.id}`}
                          className="font-medium text-zinc-900 underline-offset-2 hover:text-emerald-700 hover:underline dark:text-zinc-100 dark:hover:text-emerald-300"
                        >
                          {service.name}
                        </Link>
                        {service.description ? (
                          <div className="mt-1 line-clamp-1 text-xs text-zinc-500">
                            {service.description}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-sm text-zinc-600 dark:text-zinc-300">
                        {service.category || "Bez kategorii"}
                      </div>
                      <div className="whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
                        {service.durationMin} min
                      </div>
                      <div className="whitespace-nowrap text-sm font-medium">
                        {formatPLNFromGrosze(service.price)}
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        {service.suggestedProducts.length === 0 ? (
                          <span className="text-sm text-zinc-400">—</span>
                        ) : (
                          <>
                            {service.suggestedProducts.slice(0, 2).map((suggestion) => (
                              <span
                                key={suggestion.id}
                                className="max-w-40 truncate rounded-full border bg-zinc-50 px-2.5 py-1 text-xs dark:bg-zinc-900"
                                title={`${suggestion.product.name} • ${suggestion.quantity} ${suggestion.product.unit}`}
                              >
                                {suggestion.product.name}
                              </span>
                            ))}
                            {service.suggestedProducts.length > 2 ? (
                              <span className="rounded-full border bg-zinc-50 px-2.5 py-1 text-xs dark:bg-zinc-900">
                                +{service.suggestedProducts.length - 2}
                              </span>
                            ) : null}
                          </>
                        )}
                      </div>
                      <div className="text-right">
                        <Link
                          href={`/admin/services/${service.id}`}
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 px-3 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                        >
                          Otwórz usługę
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
