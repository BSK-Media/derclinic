"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Product = { id: string; name: string; unit: string };
type Suggestion = { id: string; productId: string; quantity: string; unit: string; product: Product };
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

type Service = { id: string; name: string; category?: string | null; description?: string | null; durationMin: number; priceFrom?: number | null; priceSuggested?: number | null; suggestedProducts: Suggestion[] };

export default function ServicesPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/services", fetcher);
  const services: Service[] = data?.services ?? [];
  const products: Product[] = data?.products ?? [];

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(SERVICE_CATEGORIES[0]);
  const [durationMin, setDurationMin] = useState("30");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceSuggested, setPriceSuggested] = useState("");
  const [saving, setSaving] = useState(false);

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
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Usługa dodana");
      setName(""); setCategory(SERVICE_CATEGORIES[0]); setDurationMin("30"); setPriceFrom(""); setPriceSuggested("");
      mutate();
    } finally {
      setSaving(false);
    }
  }

  async function addSuggestion(serviceId: string) {
    const productId = prompt("Wklej ID produktu (z listy) – szybka opcja. W UI możesz podmienić na dropdown.");
    if (!productId) return;
    const qtyStr = prompt("Ilość sugerowana (np. 1, 0.5, 20)", "1") ?? "1";
    const qty = Number(qtyStr.replace(",", "."));
    if (!Number.isFinite(qty)) return toast.error("Niepoprawna liczba");
    const res = await fetch(`/api/admin/services/${serviceId}/suggestions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, quantity: qty, unit: "UNIT" }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success("Dodano sugerowany preparat");
    mutate();
  }

  async function removeSuggestion(serviceId: string, productId: string) {
    const res = await fetch(`/api/admin/services/${serviceId}/suggestions?productId=${encodeURIComponent(productId)}`, { method: "DELETE" });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success("Usunięto");
    mutate();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Usługi i zabiegi</h1>

      <Card className="p-4 space-y-4">
        <div className="font-medium">Dodaj usługę</div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Nazwa</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Kategoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Wybierz kategorię" /></SelectTrigger>
              <SelectContent>
                {SERVICE_CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
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
            <Input value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} placeholder="np. 500" />
          </div>
          <div className="space-y-2">
            <Label>Cena sugerowana (PLN)</Label>
            <Input value={priceSuggested} onChange={(e) => setPriceSuggested(e.target.value)} placeholder="np. 800" />
          </div>
        </div>
        <Button onClick={create} disabled={!name || saving}>{saving ? "Zapisywanie..." : "Dodaj"}</Button>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="p-4 border-b font-medium">Lista</div>
        <div className="divide-y">
          {isLoading && <div className="p-4 text-sm text-zinc-500">Ładowanie...</div>}
          {!isLoading && services.length === 0 && <div className="p-4 text-sm text-zinc-500">Brak usług.</div>}
          {services.map((s) => (
            <div key={s.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-zinc-500">{s.category || "Bez kategorii"}</div>
                  <div className="text-xs text-zinc-500">
                    {s.durationMin} min • {s.priceFrom ? `od ${formatPLNFromGrosze(s.priceFrom)}` : "—"} • sugerowana: {formatPLNFromGrosze(s.priceSuggested)}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => addSuggestion(s.id)}>+ Preparat</Button>
              </div>
              <div className="text-sm text-zinc-600 dark:text-zinc-300">
                Sugerowane preparaty (warianty A/B/C):{" "}
                {s.suggestedProducts.length === 0 ? "—" : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                {s.suggestedProducts.map((sp) => (
                  <div key={sp.id} className="rounded-full border px-3 py-1 text-xs bg-zinc-50 dark:bg-zinc-900 flex items-center gap-2">
                    <span>{sp.product.name} • {sp.quantity} {sp.unit}</span>
                    <button className="text-red-600" onClick={() => removeSuggestion(s.id, sp.productId)}>×</button>
                  </div>
                ))}
              </div>
              <div className="text-xs text-zinc-500">
                Produkty dostępne: {products.length}. (UI do wyboru z listy możesz rozbudować w kolejnym kroku.)
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
