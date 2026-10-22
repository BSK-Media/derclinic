"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-provider";

export type SpecialistOption = { id: string; name: string; assignedToService: boolean; busy: boolean };

// Zmiana specjalisty przy istniejącej wizycie (np. zastępstwo): termin, usługa, cena i płatności zostają bez zmian,
// wizyta tylko przechodzi na innego specjalistę. Dotyczy każdej wizyty — starej, bieżącej i przyszłej.
export function AppointmentSpecialistSelect({
  appointmentId,
  currentId,
  currentName,
  options,
  onChanged,
}: {
  appointmentId: string;
  currentId: string;
  currentName: string;
  options: SpecialistOption[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState(currentId);
  const [saving, setSaving] = React.useState(false);

  const target = options.find((o) => o.id === selected);

  async function save() {
    if (!target || selected === currentId) return;
    const notes: string[] = [];
    if (target.busy) notes.push(`${target.name} ma już w tym terminie inną wizytę.`);
    if (!target.assignedToService) notes.push(`${target.name} nie ma przypisanej tej usługi.`);
    const ok = await confirm({
      title: "Zmienić specjalistę?",
      message:
        `Wizyta przejdzie z „${currentName}” na „${target.name}”. Termin, cena i płatności zostają bez zmian.` +
        (notes.length ? `\n\nUwaga: ${notes.join(" ")}` : "") +
        "\n\nPacjent dostanie e-mail o zmianie wizyty (jeśli ma adres e-mail).",
      confirmLabel: "Zmień specjalistę",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ specialistId: selected }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zmienić specjalisty");
      toast.success(`Specjalista zmieniony na: ${target.name}`);
      setOpen(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <span>
        Specjalista: <strong>{currentName}</strong>{" "}
        <button
          type="button"
          onClick={() => {
            setSelected(currentId);
            setOpen(true);
          }}
          className="ml-1 rounded-lg border px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
        >
          Zmień
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>Specjalista:</span>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="h-9 rounded-xl border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
        aria-label="Specjalista"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.id === currentId ? " (obecny)" : ""}
            {o.busy && o.id !== currentId ? " — zajęty w tym terminie" : ""}
            {!o.assignedToService && o.id !== currentId ? " — bez tej usługi" : ""}
          </option>
        ))}
      </select>
      <Button size="sm" onClick={save} disabled={saving || selected === currentId}>
        {saving ? "Zapisywanie…" : "Zapisz"}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
        Anuluj
      </Button>
    </span>
  );
}
