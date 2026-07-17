"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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

type PatientDetails = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type EditableField = "name" | "phone" | "email";

const FIELD_DETAILS: Record<
  EditableField,
  { label: string; emptyLabel: string; type: "text" | "tel" | "email"; maxLength: number }
> = {
  name: {
    label: "Imię i nazwisko",
    emptyLabel: "Brak imienia i nazwiska",
    type: "text",
    maxLength: 100,
  },
  phone: {
    label: "Numer telefonu",
    emptyLabel: "Brak numeru telefonu",
    type: "tel",
    maxLength: 40,
  },
  email: {
    label: "Adres e-mail",
    emptyLabel: "Brak adresu e-mail",
    type: "email",
    maxLength: 200,
  },
};

export function PatientDetailsForm({
  patient,
  children,
}: {
  patient: PatientDetails;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState<Record<EditableField, string>>({
    name: patient.name,
    phone: patient.phone ?? "",
    email: patient.email ?? "",
  });
  const [confirmationField, setConfirmationField] = React.useState<EditableField | null>(null);
  const [editingField, setEditingField] = React.useState<EditableField | null>(null);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  function requestEdit(field: EditableField) {
    if (saving) return;
    setConfirmationField(field);
  }

  function confirmEdit() {
    if (!confirmationField) return;
    setDraft(values[confirmationField]);
    setEditingField(confirmationField);
    setConfirmationField(null);
  }

  function cancelEdit() {
    setEditingField(null);
    setDraft("");
  }

  async function saveField(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingField) return;

    const nextValue = draft.trim();
    if (editingField === "name" && nextValue.length < 2) {
      toast.error("Podaj imię i nazwisko pacjenta");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [editingField]: nextValue }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się zapisać danych pacjenta");
        return;
      }

      const savedValue = result.patient[editingField] ?? "";
      setValues((current) => ({ ...current, [editingField]: savedValue }));
      toast.success(`${FIELD_DETAILS[editingField].label} — zapisano zmianę`);
      setEditingField(null);
      setDraft("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-zinc-500">Karta pacjenta</div>
          <h1 className="text-2xl font-semibold">{values.name || "Pacjent"}</h1>
        </div>
        <Link className="text-sm underline underline-offset-4" href="/admin/patients">
          Wróć do listy
        </Link>
      </div>

      {children}

      <Card className="grid gap-3 p-4 md:grid-cols-3">
        {(Object.keys(FIELD_DETAILS) as EditableField[]).map((field) => {
          const details = FIELD_DETAILS[field];
          const isEditing = editingField === field;

          return (
            <div key={field} className="rounded-xl border bg-white p-3 dark:bg-zinc-950">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                {details.label}
              </div>
              {isEditing ? (
                <form onSubmit={saveField} className="space-y-2">
                  <Input
                    type={details.type}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={details.maxLength}
                    autoFocus
                    required={field === "name"}
                    disabled={saving}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={cancelEdit}
                      disabled={saving}
                    >
                      Anuluj
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={saving || (field === "name" && draft.trim().length < 2)}
                    >
                      {saving ? "Zapisywanie…" : "Zapisz"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex min-h-10 items-center justify-between gap-3">
                  <div
                    className={
                      values[field]
                        ? "break-words font-medium text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-400"
                    }
                  >
                    {values[field] || details.emptyLabel}
                  </div>
                  <button
                    type="button"
                    onClick={() => requestEdit(field)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
                    aria-label={`Edytuj: ${details.label}`}
                    title={`Edytuj: ${details.label}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Dialog
        open={confirmationField !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmationField(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Potwierdź edycję</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-zinc-700 dark:text-zinc-200">
            Czy na pewno chcesz edytować pole „
            {confirmationField ? FIELD_DETAILS[confirmationField].label : ""}”?
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmationField(null)}>
              Anuluj
            </Button>
            <Button onClick={confirmEdit}>Tak, edytuj</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
