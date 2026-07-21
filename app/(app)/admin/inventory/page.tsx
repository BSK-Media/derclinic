"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, Boxes, Package, Plus, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/components/auth-provider";

async function fetcher(url: string) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || "Nie udało się pobrać magazynów");
  return data;
}

type WarehouseSummary = {
  id: string;
  name: string;
  parentId: string | null;
  totalQuantity: number;
  totalValue: number;
  productsCount: number;
  lowStockCount: number;
  shortExpiryCount: number;
};

type LocationOption = {
  id: string;
  name: string;
};

function money(value: number) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value / 100);
}

function quantity(value: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(value);
}

export default function InventoryPage() {
  const { user } = useAuth();
  const { data, error, isLoading, mutate } = useSWR("/api/admin/inventory", fetcher);
  const { data: locationsData, isLoading: locationsLoading } = useSWR(
    user?.role === "ADMIN" ? "/api/admin/locations" : null,
    fetcher,
  );
  const warehouses: WarehouseSummary[] = data?.warehouses ?? [];
  const locations: LocationOption[] = locationsData?.locations ?? [];
  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [warehouseToDelete, setWarehouseToDelete] = React.useState<WarehouseSummary | null>(null);
  const [adminPassword, setAdminPassword] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  async function createWarehouse() {
    if (name.trim().length < 2) return toast.error("Podaj nazwę magazynu");
    if (!locationId) return toast.error("Wybierz lokalizację magazynu");
    setSaving(true);
    try {
      const response = await fetch("/api/admin/warehouses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), locationId, parentId: null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Nie udało się dodać magazynu");

      toast.success("Magazyn został dodany");
      setName("");
      setLocationId("");
      setCreateOpen(false);
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się dodać magazynu");
    } finally {
      setSaving(false);
    }
  }

  function closeDeleteDialog() {
    if (deleting) return;
    setWarehouseToDelete(null);
    setAdminPassword("");
  }

  async function deleteWarehouse(event: React.FormEvent) {
    event.preventDefault();
    if (!warehouseToDelete || !adminPassword) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/warehouses/${warehouseToDelete.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Nie udało się usunąć magazynu");

      toast.success("Magazyn został usunięty");
      setWarehouseToDelete(null);
      setAdminPassword("");
      await mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się usunąć magazynu");
    } finally {
      setDeleting(false);
    }
  }

  function openCreateDialog() {
    setName("");
    setLocationId("");
    setCreateOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Magazyny</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Wybierz magazyn, aby sprawdzić jego stan i zarządzać produktami.
          </p>
        </div>
        {user?.role === "ADMIN" ? (
          <Button onClick={openCreateDialog} className="gap-2 bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:text-white">
            <Plus className="h-4 w-4" />
            Dodaj magazyn
          </Button>
        ) : null}
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10">
          <CardContent className="p-5 text-sm text-red-700 dark:text-red-200">{error.message}</CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-52 animate-pulse rounded-3xl bg-white/70 dark:bg-white/5" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {warehouses.map((warehouse) => (
            <Card key={warehouse.id} className="group overflow-hidden border-white/60 bg-white/80 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-[#0b1220]/55">
              <CardContent className="p-0">
                <Link href={`/admin/inventory/${warehouse.id}`} className="block p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                      <WarehouseIcon className="h-6 w-6" />
                    </div>
                    <ArrowRight className="mt-2 h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-emerald-600" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">{warehouse.name}</h2>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
                      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Package className="h-4 w-4" /> Sztuki</div>
                      <div className="mt-1 font-semibold text-slate-900 dark:text-white">{quantity(warehouse.totalQuantity)}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
                      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><Boxes className="h-4 w-4" /> Produkty</div>
                      <div className="mt-1 font-semibold text-slate-900 dark:text-white">{warehouse.productsCount}</div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    Wartość zakupu: <span className="font-semibold text-slate-700 dark:text-slate-200">{money(warehouse.totalValue)}</span>
                  </div>
                </Link>
                {user?.role === "ADMIN" ? (
                  <div className="border-t border-slate-100 px-5 py-3 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        setAdminPassword("");
                        setWarehouseToDelete(warehouse);
                      }}
                      className="inline-flex items-center gap-2 text-xs font-medium text-red-600 transition hover:text-red-700 dark:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Usuń magazyn
                    </button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}

          {!isLoading && warehouses.length === 0 ? (
            <Card className="border-dashed border-slate-300 bg-white/50 md:col-span-2 xl:col-span-3 dark:border-white/15 dark:bg-white/5">
              <CardContent className="flex flex-col items-center p-10 text-center">
                <WarehouseIcon className="h-10 w-10 text-slate-300" />
                <div className="mt-3 font-medium text-slate-700 dark:text-slate-200">Brak magazynów</div>
                <div className="mt-1 text-sm text-slate-500">Dodaj pierwszy magazyn, aby rozpocząć zarządzanie stanami.</div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!saving) setCreateOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dodaj magazyn</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="warehouse-name">Nazwa magazynu</Label>
              <Input
                id="warehouse-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && name.trim().length >= 2 && locationId) createWarehouse();
                }}
                placeholder="np. Magazyn Kraków"
                autoFocus
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label>Lokalizacja</Label>
              <Select value={locationId} onValueChange={setLocationId} disabled={saving || locationsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={locationsLoading ? "Ładowanie lokalizacji..." : "Wybierz lokalizację"} />
                </SelectTrigger>
                <SelectContent disablePortal>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!locationsLoading && locations.length === 0 ? (
                <p className="text-xs text-red-600 dark:text-red-300">Brak aktywnych lokalizacji. Najpierw dodaj lokalizację.</p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Anuluj</Button>
            <Button onClick={createWarehouse} disabled={saving || name.trim().length < 2 || !locationId} className="bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:text-white">
              {saving ? "Dodawanie..." : "Dodaj magazyn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(warehouseToDelete)}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <DialogContent>
          <form onSubmit={deleteWarehouse}>
            <DialogHeader>
              <DialogTitle>Usuń magazyn</DialogTitle>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Aby usunąć magazyn <strong>{warehouseToDelete?.name}</strong>, wpisz hasło aktualnie
                zalogowanego administratora. Zostaną również usunięte stany i partie produktów z tego magazynu.
              </p>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="delete-warehouse-password">Hasło administratora</Label>
              <Input
                id="delete-warehouse-password"
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
              <Button type="button" variant="outline" onClick={closeDeleteDialog} disabled={deleting}>
                Anuluj
              </Button>
              <Button type="submit" disabled={deleting || !adminPassword} className="bg-red-600 text-white hover:bg-red-700">
                {deleting ? "Usuwanie..." : "Usuń magazyn"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
