"use client";

import * as React from "react";
import { toast } from "sonner";
import { NEW_PATIENT, PatientPicker } from "@/components/patient-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PickedPatient = { id: string; name: string };

// Wybór pacjenta z bazy z możliwością szybkiego założenia kartoteki nowego klienta w miejscu (imię, nazwisko,
// telefon, e-mail). Klient z tym samym numerem telefonu nie jest dublowany — wybieramy istniejącą kartotekę.
export function PatientQuickField({
  value,
  onChange,
}: {
  value: PickedPatient | null;
  onChange: (value: PickedPatient | null) => void;
}) {
  const [pickerValue, setPickerValue] = React.useState(value?.id ?? "");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const isNew = pickerValue === NEW_PATIENT;

  async function create() {
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) return toast.error("Podaj imię, nazwisko i numer telefonu klienta");
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error("Niepoprawny adres e-mail");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/patients/quick", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), email: email.trim() }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się dodać klienta");
      toast.success(out.created ? `Dodano klienta ${out.patient.name}` : `Klient z tym numerem już jest w bazie: ${out.patient.name}`);
      setPickerValue(out.patient.id);
      onChange({ id: out.patient.id, name: out.patient.name });
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <PatientPicker
        value={pickerValue}
        valueLabel={value?.id === pickerValue ? value.name : undefined}
        onChange={(next) => {
          setPickerValue(next);
          onChange(null);
        }}
        onPick={(picked) => onChange(picked)}
      />
      {isNew ? (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
          <div className="text-sm font-medium">Nowy klient — szybkie założenie kartoteki</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Imię *</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="np. Jan" />
            </div>
            <div className="space-y-1">
              <Label>Nazwisko *</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="np. Kowalski" />
            </div>
            <div className="space-y-1">
              <Label>Telefon *</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="np. +48 600 000 000" />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="opcjonalnie" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={create} disabled={saving}>
              {saving ? "Dodawanie…" : "Dodaj klienta do bazy"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
