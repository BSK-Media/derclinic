"use client";

import Link from "next/link";
import * as React from "react";
import useSWR, { mutate as mutateCache } from "swr";
import { ArrowRight, BarChart3, MapPin, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth-provider";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type Location = {
  id: string;
  name: string;
  _count: { appointments: number };
};

export default function LocationsPage() {
  const { user } = useAuth();
  const { data, error, isLoading, mutate } = useSWR("/api/admin/locations", fetcher);
  const locations: Location[] = data?.locations ?? [];
  const [formOpen, setFormOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [locationToDelete, setLocationToDelete] = React.useState<Location | null>(null);
  const [adminPassword, setAdminPassword] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  async function createLocation(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się dodać lokalizacji");
        return;
      }
      toast.success("Lokalizacja została dodana");
      setName("");
      setFormOpen(false);
      await mutate();
      await mutateCache("/api/location-scope");
    } catch {
      toast.error("Nie udało się dodać lokalizacji");
    } finally {
      setSaving(false);
    }
  }

  function closeDeleteDialog() {
    if (deleting) return;
    setLocationToDelete(null);
    setAdminPassword("");
  }

  async function deleteLocation(event: React.FormEvent) {
    event.preventDefault();
    if (!locationToDelete || !adminPassword) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/locations/${locationToDelete.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się usunąć lokalizacji");
        return;
      }

      toast.success(`Lokalizacja „${locationToDelete.name}” została usunięta`);
      setLocationToDelete(null);
      setAdminPassword("");
      await Promise.all([mutate(), mutateCache("/api/location-scope")]);
    } catch {
      toast.error("Nie udało się usunąć lokalizacji");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lokalizacje</h1>
          <p className="mt-1 text-sm text-slate-500">
            Wybierz placówkę, aby zobaczyć jej pełną analitykę.
          </p>
        </div>
        {user?.role === "ADMIN" ? (
          <Button onClick={() => setFormOpen((current) => !current)}>
            {formOpen ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {formOpen ? "Anuluj" : "Dodaj lokalizację"}
          </Button>
        ) : null}
      </div>

      {formOpen && user?.role === "ADMIN" ? (
        <Card className="p-4 sm:p-5">
          <form className="flex flex-col gap-4 sm:flex-row sm:items-end" onSubmit={createLocation}>
            <div className="flex-1 space-y-2">
              <Label htmlFor="location-name">Nazwa lokalizacji</Label>
              <Input
                id="location-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="np. Kraków"
                autoFocus
                maxLength={100}
              />
            </div>
            <Button type="submit" disabled={saving || name.trim().length < 2}>
              {saving ? "Dodawanie..." : "Dodaj lokalizację"}
            </Button>
          </form>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5">
          Ładowanie lokalizacji…
        </div>
      ) : error || data?.ok === false ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          Nie udało się pobrać lokalizacji.
        </div>
      ) : locations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-white/15">
          Brak lokalizacji. Dodaj pierwszą placówkę.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {locations.map((location) => (
            <Card
              key={location.id}
              className="group h-full p-5 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:hover:border-emerald-500/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="flex items-center gap-1">
                  {user?.role === "ADMIN" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAdminPassword("");
                        setLocationToDelete(location);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                      aria-label={`Usuń lokalizację ${location.name}`}
                      title="Usuń lokalizację"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                  <Link
                    href={`/admin/locations/${location.id}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:hover:bg-emerald-500/10"
                    aria-label={`Otwórz lokalizację ${location.name}`}
                  >
                    <ArrowRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
              <Link href={`/admin/locations/${location.id}`} className="block">
                <h2 className="mt-5 text-lg font-semibold">{location.name}</h2>
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <BarChart3 className="h-4 w-4" />
                  <span>Otwórz analitykę lokalizacji</span>
                </div>
                <div className="mt-4 border-t pt-4 text-xs text-slate-500 dark:border-white/10">
                  Wszystkie wizyty: {location._count.appointments}
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(locationToDelete)}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <DialogContent>
          <form onSubmit={deleteLocation}>
            <DialogHeader>
              <DialogTitle>Usuń lokalizację</DialogTitle>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Aby usunąć lokalizację <strong>{locationToDelete?.name}</strong>, wpisz hasło
                aktualnie zalogowanego administratora. Tej operacji nie można cofnąć.
              </p>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="delete-location-password">Hasło administratora</Label>
              <Input
                id="delete-location-password"
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                placeholder="Wpisz hasło"
                autoComplete="current-password"
                autoFocus
                disabled={deleting}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeDeleteDialog}
                disabled={deleting}
              >
                Anuluj
              </Button>
              <Button
                type="submit"
                disabled={deleting || !adminPassword}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deleting ? "Usuwanie..." : "Usuń lokalizację"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
