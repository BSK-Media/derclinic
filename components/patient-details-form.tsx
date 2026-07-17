"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PatientDetails = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export function PatientDetailsForm({ patient }: { patient: PatientDetails }) {
  const router = useRouter();
  const [name, setName] = React.useState(patient.name);
  const [phone, setPhone] = React.useState(patient.phone ?? "");
  const [email, setEmail] = React.useState(patient.email ?? "");
  const [savedValues, setSavedValues] = React.useState({
    name: patient.name,
    phone: patient.phone ?? "",
    email: patient.email ?? "",
  });
  const [saving, setSaving] = React.useState(false);

  const dirty =
    name !== savedValues.name || phone !== savedValues.phone || email !== savedValues.email;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Podaj imię i nazwisko pacjenta");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        toast.error(result?.message || "Nie udało się zapisać danych pacjenta");
        return;
      }

      const updatedName = result.patient.name ?? "";
      const updatedPhone = result.patient.phone ?? "";
      const updatedEmail = result.patient.email ?? "";
      setName(updatedName);
      setPhone(updatedPhone);
      setEmail(updatedEmail);
      setSavedValues({ name: updatedName, phone: updatedPhone, email: updatedEmail });
      toast.success("Dane pacjenta zostały zapisane");
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
          <h1 className="text-2xl font-semibold">{name || "Pacjent"}</h1>
        </div>
        <Link className="text-sm underline underline-offset-4" href="/admin/patients">
          Wróć do listy
        </Link>
      </div>

      <Card className="p-4">
        <form
          onSubmit={save}
          className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.4fr)_minmax(190px,1fr)_minmax(260px,1.4fr)_auto]"
        >
          <div className="space-y-2">
            <Label htmlFor="patient-name">Imię i nazwisko</Label>
            <Input
              id="patient-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patient-phone">Numer telefonu</Label>
            <Input
              id="patient-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={40}
              placeholder="Brak numeru"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patient-email">Adres e-mail</Label>
            <Input
              id="patient-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={200}
              placeholder="Brak adresu e-mail"
            />
          </div>
          <Button type="submit" disabled={saving || !dirty || !name.trim()}>
            {saving ? "Zapisywanie…" : "Zapisz zmiany"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
