"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ServicePatientsTable } from "@/components/service-patients-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type EditableField = "name" | "category" | "description" | "durationMin" | "price";

type Product = { id: string; name: string; unit: string };
type Specialist = { id: string; name: string };
type Service = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  durationMin: number;
  price: number | null;
  suggestedProducts: Array<{
    id: string;
    productId: string;
    quantity: string;
    unit: string;
    product: Product;
  }>;
  specialistAssignments: Array<{
    specialistId: string;
    specialist: Specialist;
  }>;
};

type ServiceResponse = {
  ok: boolean;
  message?: string;
  viewerRole?: string;
  service?: Service;
  services?: Service[];
  specialists?: Specialist[];
  products?: Product[];
};

const FIELD_LABELS: Record<EditableField, string> = {
  name: "Nazwa usługi",
  category: "Kategoria",
  description: "Opis usługi",
  durationMin: "Czas trwania",
  price: "Cena",
};

const UNIT_OPTIONS = [
  { value: "UNIT", label: "szt." },
  { value: "ML", label: "ml" },
  { value: "MG", label: "mg" },
  { value: "G", label: "g" },
  { value: "AMPULE", label: "ampułka" },
  { value: "BOTOX_UNIT", label: "jedn. botox" },
] as const;

function fieldDraft(service: Service, field: EditableField) {
  const value = service[field];
  if (field === "price") {
    return typeof value === "number" ? (value / 100).toFixed(2).replace(".", ",") : "";
  }
  return value === null ? "" : String(value);
}

function fieldValue(service: Service, field: EditableField) {
  const value = service[field];
  if (field === "price") {
    return formatPLNFromGrosze(value as number | null);
  }
  if (field === "durationMin") return `${value} min`;
  return value || "—";
}

export default function ServiceDetailsPage({ params }: { params: { id: string } }) {
  const { data, error, isLoading, mutate } = useSWR<ServiceResponse>(
    "/api/admin/services",
    fetcher,
  );
  const service = data?.services?.find((item) => item.id === params.id);
  const specialists = data?.specialists ?? [];
  const products = data?.products ?? [];
  const isAdmin = data?.viewerRole === "ADMIN";

  const [confirmField, setConfirmField] = React.useState<EditableField | null>(null);
  const [editingField, setEditingField] = React.useState<EditableField | null>(null);
  const [draft, setDraft] = React.useState("");
  const [savingField, setSavingField] = React.useState<EditableField | null>(null);
  const [savingSpecialist, setSavingSpecialist] = React.useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [unit, setUnit] = React.useState("UNIT");
  const [savingProduct, setSavingProduct] = React.useState(false);

  function beginEditing() {
    if (!service || !confirmField) return;
    setDraft(fieldDraft(service, confirmField));
    setEditingField(confirmField);
    setConfirmField(null);
  }

  function cancelEditing() {
    setEditingField(null);
    setDraft("");
  }

  async function saveField(field: EditableField) {
    if (!service) return;

    let value: string | number | null = draft.trim();
    if (field === "name" && value.length < 2) {
      toast.error("Nazwa usługi musi mieć co najmniej 2 znaki.");
      return;
    }
    if (field === "category" || field === "description") value = value || null;
    if (field === "durationMin") {
      const duration = Number(value);
      if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
        toast.error("Czas trwania musi wynosić od 5 do 480 minut.");
        return;
      }
      value = duration;
    }
    if (field === "price") {
      if (!value) {
        value = null;
      } else {
        const price = parsePLNToGrosze(String(value));
        if (price === null || price < 0) {
          toast.error("Podaj poprawną, nieujemną cenę.");
          return;
        }
        value = price;
      }
    }

    setSavingField(field);
    try {
      const response = await fetch("/api/admin/services", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: service.id, [field]: value }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się zapisać zmiany.");
        return;
      }
      await mutate();
      cancelEditing();
      toast.success("Dane usługi zostały zaktualizowane.");
    } finally {
      setSavingField(null);
    }
  }

  async function toggleSpecialist(specialistId: string, assigned: boolean) {
    if (!service) return;
    setSavingSpecialist(specialistId);
    try {
      const response = await fetch(`/api/admin/services/${service.id}/specialists`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ specialistId, assigned }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się zmienić przypisania.");
        return;
      }
      await mutate();
      toast.success(assigned ? "Przypisano specjalistę." : "Usunięto przypisanie specjalisty.");
    } finally {
      setSavingSpecialist(null);
    }
  }

  async function addProduct() {
    if (!service || !selectedProductId) return;
    const parsedQuantity = Number(quantity.replace(",", "."));
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      toast.error("Podaj poprawną ilość preparatu.");
      return;
    }
    setSavingProduct(true);
    try {
      const response = await fetch(`/api/admin/services/${service.id}/suggestions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: selectedProductId, quantity: parsedQuantity, unit }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się przypisać preparatu.");
        return;
      }
      setSelectedProductId("");
      setQuantity("1");
      await mutate();
      toast.success("Preparat został przypisany do usługi.");
    } finally {
      setSavingProduct(false);
    }
  }

  async function removeProduct(productId: string) {
    if (!service) return;
    const response = await fetch(
      `/api/admin/services/${service.id}/suggestions?productId=${encodeURIComponent(productId)}`,
      { method: "DELETE" },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) {
      toast.error(result?.message || "Nie udało się usunąć preparatu.");
      return;
    }
    await mutate();
    toast.success("Preparat został odłączony od usługi.");
  }

  if (isLoading) return <div className="text-sm text-zinc-500">Ładowanie usługi...</div>;
  if (error || !data?.ok) {
    return (
      <div className="space-y-4">
        <Link href="/admin/services" className="text-sm underline">
          Wróć do listy usług
        </Link>
        <div className="rounded-2xl border bg-white p-6 text-sm text-red-600 dark:bg-zinc-950">
          {data?.message || "Nie udało się wczytać usług."}
        </div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="space-y-4">
        <Link href="/admin/services" className="text-sm underline">
          Wróć do listy usług
        </Link>
        <div className="rounded-2xl border bg-white p-6 text-sm text-red-600 dark:bg-zinc-950">
          Nie znaleziono wybranej usługi.
        </div>
      </div>
    );
  }

  const editableFields: EditableField[] = [
    "name",
    "category",
    "durationMin",
    "price",
    "description",
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-zinc-500">Karta usługi</div>
          <h1 className="text-2xl font-semibold">{service.name}</h1>
        </div>
        <Link href="/admin/services" className="text-sm underline underline-offset-2">
          Wróć do listy usług
        </Link>
      </div>

      <section className="rounded-2xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {editableFields.map((field) => {
            const isEditing = editingField === field;
            const isDescription = field === "description";
            return (
              <div
                key={field}
                className={
                  "rounded-xl border p-3 " + (isDescription ? "md:col-span-2 xl:col-span-3" : "")
                }
              >
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {FIELD_LABELS[field]}
                </div>
                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    {isDescription ? (
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        rows={4}
                        className="w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-300 dark:border-zinc-800"
                      />
                    ) : (
                      <Input
                        autoFocus
                        type={field === "durationMin" ? "number" : "text"}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                      />
                    )}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={cancelEditing}>
                        Anuluj
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingField === field}
                        onClick={() => saveField(field)}
                      >
                        {savingField === field ? "Zapisywanie..." : "Zapisz"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <div className="whitespace-pre-wrap text-sm font-medium">
                      {fieldValue(service, field)}
                    </div>
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => setConfirmField(field)}
                        className="rounded-lg border p-2 text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        aria-label={`Edytuj: ${FIELD_LABELS[field]}`}
                        title="Edytuj"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
        <div className="font-semibold">Przypisani specjaliści</div>
        <div className="mt-1 text-xs text-zinc-500">
          {isAdmin
            ? "Kliknij specjalistę, aby przypisać go do usługi lub usunąć przypisanie."
            : "Specjaliści wykonujący tę usługę."}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(isAdmin
            ? specialists
            : specialists.filter((specialist) =>
                service.specialistAssignments.some(
                  (assignment) => assignment.specialistId === specialist.id,
                ),
              )
          ).map((specialist) => {
            const assigned = service.specialistAssignments.some(
              (assignment) => assignment.specialistId === specialist.id,
            );
            return (
              <button
                key={specialist.id}
                type="button"
                disabled={!isAdmin || savingSpecialist === specialist.id}
                onClick={() => toggleSpecialist(specialist.id, !assigned)}
                className={
                  "rounded-full border px-3 py-1.5 text-xs transition disabled:cursor-default " +
                  (assigned
                    ? "border-emerald-300 bg-emerald-100 font-medium text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300")
                }
              >
                {assigned ? "✓ " : ""}
                {specialist.name}
              </button>
            );
          })}
          {specialists.length === 0 ? (
            <span className="text-sm text-zinc-500">Brak specjalistów.</span>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm dark:bg-zinc-950">
        <div className="font-semibold">Preparaty przypisane do usługi</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {service.suggestedProducts.map((suggestion) => (
            <div
              key={suggestion.id}
              className="flex items-center gap-2 rounded-full border bg-zinc-50 px-3 py-1.5 text-xs dark:bg-zinc-900"
            >
              <span>
                {suggestion.product.name} • {suggestion.quantity}{" "}
                {UNIT_OPTIONS.find((option) => option.value === suggestion.unit)?.label ??
                  suggestion.unit}
              </span>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => removeProduct(suggestion.productId)}
                  className="text-red-600 hover:text-red-700"
                  title="Usuń przypisanie preparatu"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ))}
          {service.suggestedProducts.length === 0 ? (
            <span className="text-sm text-zinc-500">Brak przypisanych preparatów.</span>
          ) : null}
        </div>

        {isAdmin ? (
          <div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-[minmax(220px,1fr)_140px_180px_auto] md:items-end">
            <div className="space-y-2">
              <Label>Preparat</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz preparat" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ilość</Label>
              <Input value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Jednostka</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={addProduct}
              disabled={!selectedProductId || savingProduct}
            >
              <Plus className="mr-2 h-4 w-4" />
              {savingProduct ? "Dodawanie..." : "Dodaj preparat"}
            </Button>
          </div>
        ) : null}
      </section>

      <ServicePatientsTable serviceId={service.id} />

      <Dialog open={confirmField !== null} onOpenChange={(open) => !open && setConfirmField(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Czy na pewno chcesz edytować?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Zamierzasz zmienić pole „{confirmField ? FIELD_LABELS[confirmField] : ""}”.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmField(null)}>
              Anuluj
            </Button>
            <Button type="button" onClick={beginEditing}>
              Tak, edytuj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
