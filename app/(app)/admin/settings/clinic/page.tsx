"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Profile = {
  name: string | null;
  legalForm: string | null;
  address: string | null;
  nip: string | null;
  regon: string | null;
  krs: string | null;
  rpwdl: string | null;
};

const FIELDS: { key: keyof Profile; label: string; placeholder?: string; wide?: boolean }[] = [
  { key: "name", label: "Pełna nazwa podmiotu", wide: true },
  { key: "legalForm", label: "Forma prawna", placeholder: "np. spółka z o.o." },
  { key: "address", label: "Adres siedziby", wide: true },
  { key: "nip", label: "NIP" },
  { key: "regon", label: "REGON" },
  { key: "krs", label: "KRS" },
  { key: "rpwdl", label: "Numer w rejestrze podmiotów leczniczych (RPWDL)" },
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ClinicProfilePage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN";
  const { data, mutate } = useSWR<{ ok: boolean; profile?: Profile; message?: string }>(
    user && (user.role === "ADMIN" || user.role === "MANAGER") ? "/api/admin/settings/clinic-profile" : null,
    fetcher,
  );
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!data?.profile) return;
    setForm(Object.fromEntries(FIELDS.map((field) => [field.key, data.profile?.[field.key] ?? ""])));
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/clinic-profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać danych kliniki");
      toast.success("Zapisano dane kliniki");
      await mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <Link href="/admin/settings" className="text-sm text-slate-500 hover:underline">← Ustawienia</Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Dane kliniki</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Dane podmiotu, które system wstawia do dokumentu zgody na zabieg (nazwa, adres, NIP, REGON, numer w rejestrze
          podmiotów leczniczych). Puste pola są pomijane. Zmiana dotyczy dokumentów generowanych od tego momentu.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        {!data ? <div className="text-sm text-slate-500">Ładowanie…</div> : null}
        {data && !data.ok ? <div className="text-sm text-red-600">{data.message || "Brak dostępu."}</div> : null}
        {data?.ok ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <div key={field.key} className={"space-y-1 " + (field.wide ? "sm:col-span-2" : "")}>
                  <Label htmlFor={`clinic-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`clinic-${field.key}`}
                    value={form[field.key] ?? ""}
                    placeholder={field.placeholder}
                    disabled={!canEdit}
                    onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                </div>
              ))}
            </div>
            {canEdit ? (
              <div className="flex justify-end">
                <Button onClick={save} disabled={saving}>{saving ? "Zapisywanie…" : "Zapisz dane kliniki"}</Button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Dane może zmieniać tylko administrator.</p>
            )}
          </>
        ) : null}
      </Card>
    </div>
  );
}
