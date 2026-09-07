"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Merge, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type GroupPatient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  hasPassword: boolean;
  appointments: number;
  retailSales: number;
  createdAt: string;
};

type Group = {
  locationId: string;
  suggestedKeepId: string;
  passwordConflict: boolean;
  patients: GroupPatient[];
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function GroupCard({ group, onMerged }: { group: Group; onMerged: () => void }) {
  const [keepId, setKeepId] = React.useState(group.suggestedKeepId);
  const [merging, setMerging] = React.useState(false);

  async function handleMerge() {
    const mergeIds = group.patients.filter((p) => p.id !== keepId).map((p) => p.id);
    if (mergeIds.length === 0) return;
    const keptPatient = group.patients.find((p) => p.id === keepId);
    const confirmed = window.confirm(
      `Scalić ${group.patients.length} rekordy w jeden (zachowany: ${keptPatient?.name ?? "?"})? ` +
        `Wizyty i sprzedaże pozostałych zostaną przeniesione, a ich rekordy usunięte. Tej operacji nie da się cofnąć.`,
    );
    if (!confirmed) return;

    setMerging(true);
    try {
      const response = await fetch("/api/admin/patients/dedupe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keepId, mergeIds }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się scalić pacjentów");
        return;
      }
      toast.success(
        `Scalono. Przeniesiono ${result.movedAppointments} wizyt i ${result.movedRetailSales} sprzedaży.`,
      );
      onMerged();
    } catch {
      toast.error("Nie udało się połączyć z serwerem");
    } finally {
      setMerging(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          Grupa duplikatów ({group.patients.length} rekordy)
          {group.passwordConflict ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
              <ShieldAlert className="h-3 w-3" /> konflikt haseł
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {group.patients.map((p) => (
            <label
              key={p.id}
              className={
                "flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border p-3 text-sm transition " +
                (keepId === p.id
                  ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                  : "border-zinc-200 dark:border-zinc-800")
              }
            >
              <input
                type="radio"
                name={`keep-${group.patients.map((x) => x.id).join("-")}`}
                checked={keepId === p.id}
                onChange={() => setKeepId(p.id)}
                className="h-4 w-4"
              />
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{p.name}</span>
              <span className="text-zinc-500">{p.phone || "—"}</span>
              <span className="text-zinc-500">{p.email || "—"}</span>
              <span className="text-zinc-500">{p.appointments} wizyt</span>
              <span className="text-zinc-500">{p.retailSales} sprzedaży</span>
              {p.hasPassword ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  ma konto (hasło)
                </span>
              ) : null}
              <span className="text-xs text-zinc-400">od {formatDate(p.createdAt)}</span>
              {keepId === p.id ? (
                <span className="ml-auto text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  Zachowaj ten rekord
                </span>
              ) : null}
            </label>
          ))}
        </div>
        <Button
          className="mt-3"
          size="sm"
          onClick={handleMerge}
          disabled={merging || group.passwordConflict}
          title={group.passwordConflict ? "Kilku pacjentów ma różne hasła — rozwiąż konflikt ręcznie" : undefined}
        >
          {merging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Merge className="mr-2 h-4 w-4" />}
          Scal duplikaty
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PatientsDedupePage() {
  const [groups, setGroups] = React.useState<Group[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/patients/dedupe");
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się pobrać listy duplikatów");
        setGroups([]);
        return;
      }
      setGroups(result.groups ?? []);
    } catch {
      toast.error("Nie udało się połączyć z serwerem");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/patients"
            className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Wróć do listy pacjentów
          </Link>
          <h1 className="text-xl font-semibold">Duplikaty pacjentów</h1>
          <p className="text-sm text-zinc-500">
            Rekordy z tym samym numerem telefonu lub adresem e-mail w obrębie jednej lokalizacji.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Odśwież
        </Button>
      </div>

      {groups === null || loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Szukanie duplikatów…
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-zinc-500">
            Nie znaleziono duplikatów. Wszyscy pacjenci mają unikalny telefon i e-mail w obrębie swojej lokalizacji.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group, i) => (
            <GroupCard key={i} group={group} onMerged={load} />
          ))}
        </div>
      )}
    </div>
  );
}
