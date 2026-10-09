"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BUILTIN_UNITS, type ProductOptions } from "@/lib/product-options";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const API = "/api/admin/settings/product-options";

async function addOption(kind: "category" | "unit", name: string) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, name }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out?.ok) {
    toast.error(out?.message || "Nie udało się dodać");
    return false;
  }
  return true;
}

function OptionList({
  title,
  description,
  kind,
  items,
  fixed,
  placeholder,
  onChanged,
}: {
  title: string;
  description: string;
  kind: "category" | "unit";
  items: { id: string | null; name: string }[];
  fixed?: string[];
  placeholder: string;
  onChanged: () => void;
}) {
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (await addOption(kind, name)) {
        setName("");
        toast.success("Dodano");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`${API}?kind=${kind}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się usunąć");
    toast.success("Usunięto z listy");
    onChanged();
  }

  return (
    <section className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>

      <form onSubmit={add} className="mt-4 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={60} />
        <Button type="submit" disabled={busy || !name.trim()}>Dodaj</Button>
      </form>

      <ul className="mt-4 divide-y divide-slate-200/70 dark:divide-white/10">
        {(fixed ?? []).map((label) => (
          <li key={`fixed-${label}`} className="flex items-center justify-between py-2 text-sm">
            <span>{label}</span>
            <span className="text-xs text-slate-400">wbudowana</span>
          </li>
        ))}
        {items.map((item) => (
          <li key={item.id ?? `used-${item.name}`} className="flex items-center justify-between py-2 text-sm">
            <span>{item.name}</span>
            {item.id ? (
              <button
                type="button"
                onClick={() => remove(item.id!)}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Usuń ${item.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  if (await addOption(kind, item.name)) onChanged();
                }}
                className="text-xs text-emerald-700 hover:underline"
                title="Występuje przy produktach — zapisz na liście"
              >
                zapisz na liście
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && !(fixed ?? []).length ? (
          <li className="py-2 text-sm text-slate-500">Brak pozycji.</li>
        ) : null}
      </ul>
    </section>
  );
}

export default function ProductSettingsPage() {
  const { user } = useAuth();
  const { data, mutate } = useSWR<{ ok: boolean } & ProductOptions>(API, fetcher);
  const allowed = user && ["ADMIN", "MANAGER", "RECEPTION"].includes(user.role);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <Link href="/admin/settings" className="text-sm text-slate-500 hover:underline">← Ustawienia</Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Produkty</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Listy kategorii i jednostek miary, z których wybiera się wartości przy dodawaniu produktów.
        </p>
      </div>

      {!allowed ? (
        <p className="text-sm text-slate-500">Brak uprawnień do zarządzania listami.</p>
      ) : (
        <>
          <OptionList
            title="Kategorie produktów"
            description="Kategoria jest wybierana z listy przy dodawaniu produktu do magazynu."
            kind="category"
            items={data?.categories ?? []}
            placeholder="Nowa kategoria, np. Preparaty medyczne"
            onChanged={() => mutate()}
          />
          <OptionList
            title="Jednostki miary"
            description="Własne jednostki pojawią się na liście obok wbudowanych."
            kind="unit"
            items={(data?.units ?? []).map((u) => ({ id: u.id, name: u.name }))}
            fixed={BUILTIN_UNITS.map((u) => u.label)}
            placeholder="Nowa jednostka, np. fiolka"
            onChanged={() => mutate()}
          />
        </>
      )}
    </div>
  );
}
