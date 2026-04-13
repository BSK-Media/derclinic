"use client";

import useSWR from "swr";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type U = { id: string; login: string; name: string; role: string; email?: string | null; payoutPercent?: number };

export default function AdminUsersPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/users", fetcher);

  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("SPECIALIST");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [payoutPercent, setPayoutPercent] = useState("50");
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          login,
          name,
          role,
          email,
          password,
          payoutPercent: role === "SPECIALIST" ? Number(payoutPercent) : undefined,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Błąd");
        return;
      }
      toast.success("Użytkownik dodany");
      setLogin(""); setName(""); setEmail(""); setPassword(""); setPayoutPercent("50");
      mutate();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Usunąć użytkownika?")) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success("Usunięto");
    mutate();
  }

  const users: U[] = data?.users ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Użytkownicy</h1>

      <Card className="p-4 space-y-4">
        <div className="font-medium">Dodaj konto</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Login</Label>
            <Input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="np. anna" />
          </div>
          <div className="space-y-2">
            <Label>Imię i nazwisko</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. dr Anna Kowalska" />
          </div>
          <div className="space-y-2">
            <Label>Rola</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Administrator</SelectItem>
                <SelectItem value="RECEPTION">Recepcja</SelectItem>
                <SelectItem value="SPECIALIST">Specjalista</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Email (opcjonalnie)</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@..." />
          </div>
          <div className="space-y-2">
            <Label>Hasło</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
          </div>
          <div className="space-y-2">
            <Label>% rozliczenia (specjalista)</Label>
            <Input value={payoutPercent} onChange={(e) => setPayoutPercent(e.target.value)} disabled={role !== "SPECIALIST"} />
          </div>
        </div>
        <Button onClick={create} disabled={saving || !login || !name || !password}>
          {saving ? "Zapisywanie..." : "Dodaj"}
        </Button>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="p-4 border-b font-medium">Lista</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Login</th>
                <th className="p-3">Nazwa</th>
                <th className="p-3">Rola</th>
                <th className="p-3">Email</th>
                <th className="p-3">% (specjalista)</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td className="p-3 text-zinc-500" colSpan={6}>Ładowanie...</td></tr>
              )}
              {!isLoading && users.length === 0 && (
                <tr><td className="p-3 text-zinc-500" colSpan={6}>Brak użytkowników.</td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-3 font-medium">{u.login}</td>
                  <td className="p-3">{u.name}</td>
                  <td className="p-3">{u.role}</td>
                  <td className="p-3">{u.email ?? "—"}</td>
                  <td className="p-3">{u.role === "SPECIALIST" ? (u.payoutPercent ?? 0) + "%" : "—"}</td>
                  <td className="p-3 text-right">
                    <Button variant="destructive" size="sm" onClick={() => remove(u.id)}>Usuń</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
