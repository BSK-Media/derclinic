"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatPLNFromGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Patient = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
  createdAt: string;
  totalSpent?: number;
  completedVisits?: number;
};

type SortKey = "createdAt" | "totalSpent" | "completedVisits";
type SortDirection = "asc" | "desc";

export default function AdminPatientsPage() {
  const [q, setQ] = useState("");
  const { data, mutate, isLoading } = useSWR(
    `/api/admin/patients?q=${encodeURIComponent(q)}`,
    fetcher,
  );
  const patients: Patient[] = data?.patients ?? [];
  const isAdmin = data?.viewerRole === "ADMIN";

  // Statystyki liczone z pełnej listy (niezależnie od pola wyszukiwania)
  const { data: allData } = useSWR(`/api/admin/patients?q=`, fetcher);
  const allPatients: Patient[] = allData?.patients ?? [];
  const topVisits = useMemo(
    () =>
      allPatients.reduce<Patient | null>(
        (best, p) =>
          (p.completedVisits ?? 0) > (best?.completedVisits ?? 0) ? p : best,
        null,
      ),
    [allPatients],
  );
  const topSpender = useMemo(
    () =>
      allPatients.reduce<Patient | null>(
        (best, p) => ((p.totalSpent ?? 0) > (best?.totalSpent ?? 0) ? p : best),
        null,
      ),
    [allPatients],
  );
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedPatients = useMemo(() => {
    return [...patients].sort((left, right) => {
      const leftValue =
        sortKey === "createdAt" ? new Date(left.createdAt).getTime() : (left[sortKey] ?? 0);
      const rightValue =
        sortKey === "createdAt" ? new Date(right.createdAt).getTime() : (right[sortKey] ?? 0);
      return sortDirection === "asc" ? leftValue - rightValue : rightValue - leftValue;
    });
  }, [patients, sortDirection, sortKey]);

  function changeSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("desc");
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortDirection === "desc" ? (
      <ArrowDown className="h-3.5 w-3.5" />
    ) : (
      <ArrowUp className="h-3.5 w-3.5" />
    );
  }

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
      setName("");
      setPhone("");
      setEmail("");
      setNote("");
      mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Pacjenci</h1>

      {isAdmin ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <div className="text-sm text-zinc-500">Najwięcej wizyt</div>
            {topVisits && (topVisits.completedVisits ?? 0) > 0 ? (
              <>
                <div className="mt-2 text-2xl font-semibold">
                  <Link className="underline underline-offset-2" href={`/admin/patients/${topVisits.id}`}>
                    {topVisits.name}
                  </Link>
                </div>
                <div className="mt-1 text-sm text-zinc-500">
                  {topVisits.completedVisits} wykonanych wizyt
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm text-zinc-500">Brak danych.</div>
            )}
          </Card>
          <Card className="p-4">
            <div className="text-sm text-zinc-500">Najwięcej wydał</div>
            {topSpender && (topSpender.totalSpent ?? 0) > 0 ? (
              <>
                <div className="mt-2 text-2xl font-semibold">
                  <Link className="underline underline-offset-2" href={`/admin/patients/${topSpender.id}`}>
                    {topSpender.name}
                  </Link>
                </div>
                <div className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
                  {formatPLNFromGrosze(topSpender.totalSpent ?? 0)} łącznie
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm text-zinc-500">Brak danych.</div>
            )}
          </Card>
        </div>
      ) : null}

      <Card className="space-y-4 p-4">
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
        <Button onClick={create} disabled={!name || saving}>
          {saving ? "Zapisywanie..." : "Dodaj"}
        </Button>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="flex items-center gap-3 border-b p-4">
          <div className="font-medium">Lista</div>
          <Input
            className="max-w-sm"
            placeholder="Szukaj: nazwisko, telefon, email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
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
                {isAdmin ? (
                  <th className="p-3">
                    <button
                      type="button"
                      onClick={() => changeSort("totalSpent")}
                      className="inline-flex items-center gap-1.5 font-medium hover:text-zinc-900 dark:hover:text-white"
                    >
                      Wydano łącznie
                      {sortIcon("totalSpent")}
                    </button>
                  </th>
                ) : null}
                <th className="p-3">
                      <button
                        type="button"
                        onClick={() => changeSort("completedVisits")}
                        className="inline-flex items-center gap-1.5 font-medium hover:text-zinc-900 dark:hover:text-white"
                      >
                        Wykonane wizyty
                        {sortIcon("completedVisits")}
                      </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {patients.length === 0 && !isLoading && (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={isAdmin ? 6 : 5}>
                    Brak wyników.
                  </td>
                </tr>
              )}
              {sortedPatients.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-medium">
                    <Link className="underline" href={`/admin/patients/${p.id}`}>
                      {p.name}
                    </Link>
                  </td>
                  <td className="p-3">{p.phone ?? "—"}</td>
                  <td className="p-3">{p.email ?? "—"}</td>
                  <td className="p-3">{p.note ?? "—"}</td>
                  {isAdmin ? (
                    <td className="p-3 font-medium text-emerald-700 dark:text-emerald-300">
                      {formatPLNFromGrosze(p.totalSpent ?? 0)}
                    </td>
                  ) : null}
                  <td className="p-3 font-medium">{p.completedVisits ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
