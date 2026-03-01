"use client";

import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Patient = { id: string; name: string; phone?: string | null; email?: string | null; note?: string | null; createdAt: string };

export default function AdminPatientsPage() {
  const [q, setQ] = useState("");
  const { data, mutate, isLoading } = useSWR(`/api/admin/patients?q=${encodeURIComponent(q)}`, fetcher);
  const patients: Patient[] = data?.patients ?? [];

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/patients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, phone, email, note }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Pacjent dodany");
      setName(""); setPhone(""); setEmail(""); setNote("");
      mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Pacjenci</h1>

      <Card className="p-4 space-y-4">
        <div className="font-medium">Dodaj pacjenta</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Imię i nazwisko</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Telefon</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Notatka</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <Button onClick={create} disabled={!name || saving}>{saving ? "Zapisywanie..." : "Dodaj"}</Button>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="p-4 border-b flex items-center gap-3">
          <div className="font-medium">Lista</div>
          <Input className="max-w-sm" placeholder="Szukaj: nazwisko, telefon, email" value={q} onChange={(e)=>setQ(e.target.value)} />
          {isLoading && <div className="text-sm text-zinc-500">Ładowanie…</div>}
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Nazwa</th>
                <th className="p-3">Telefon</th>
                <th className="p-3">Email</th>
                <th className="p-3">Notatka</th>
              </tr>
            </thead>
            <tbody>
              {patients.length === 0 && !isLoading && <tr><td className="p-3 text-zinc-500" colSpan={4}>Brak wyników.</td></tr>}
              {patients.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-medium"><Link className="underline" href={`/admin/patients/${p.id}`}>{p.name}</Link></td>
                  <td className="p-3">{p.phone ?? "—"}</td>
                  <td className="p-3">{p.email ?? "—"}</td>
                  <td className="p-3">{p.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
