"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const fetcher = (url: string) => fetch(url).then((response) => response.json());
const CUSTOM_SERVICE = "__custom__";

type UnitKey = "UNIT" | "ML" | "MG" | "G" | "AMPULE" | "BOTOX_UNIT";

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  customServiceName?: string | null;
  patient: { name: string };
  service: { name: string };
};

type Service = {
  id: string;
  name: string;
  category?: string | null;
  durationMin: number;
};

type Product = {
  id: string;
  name: string;
  unit: UnitKey;
};

type PreparationRow = {
  id: number;
  productId: string;
  quantity: string;
  unit: UnitKey;
};

const UNITS: Array<{ value: UnitKey; label: string }> = [
  { value: "ML", label: "ml" },
  { value: "MG", label: "mg" },
  { value: "G", label: "g" },
  { value: "UNIT", label: "szt." },
  { value: "AMPULE", label: "ampułka" },
  { value: "BOTOX_UNIT", label: "jednostka botoksu" },
];

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultStartTime() {
  const now = new Date();
  const roundedMinutes = Math.ceil(now.getMinutes() / 5) * 5;
  now.setMinutes(roundedMinutes, 0, 0);
  if (toDateInput(now) !== toDateInput(new Date())) return "23:55";
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function newPreparation(id: number): PreparationRow {
  return { id, productId: "", quantity: "", unit: "ML" };
}

export default function SpecialistAppointmentsPage() {
  const today = React.useMemo(() => new Date(), []);
  const todayValue = React.useMemo(() => toDateInput(today), [today]);
  const fromDefault = React.useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - 7);
    return toDateInput(date);
  }, [today]);
  const toDefault = React.useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() + 14);
    return toDateInput(date);
  }, [today]);

  const [from, setFrom] = React.useState(fromDefault);
  const [to, setTo] = React.useState(toDefault);
  const { data, mutate, isLoading } = useSWR(
    `/api/specialist/appointments?from=${from}&to=${to}`,
    fetcher,
  );

  const appointments: Appointment[] = data?.appointments ?? [];
  const services: Service[] = data?.services ?? [];
  const products: Product[] = data?.products ?? [];
  const timeOptions = React.useMemo(
    () =>
      Array.from({ length: 24 * 12 }, (_, index) => {
        const hour = Math.floor(index / 12);
        const minute = (index % 12) * 5;
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      }),
    [],
  );

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [serviceId, setServiceId] = React.useState("");
  const [customServiceName, setCustomServiceName] = React.useState("");
  const [startTime, setStartTime] = React.useState(defaultStartTime);
  const [preparations, setPreparations] = React.useState<PreparationRow[]>([
    newPreparation(1),
  ]);
  const [nextPreparationId, setNextPreparationId] = React.useState(2);
  const [saving, setSaving] = React.useState(false);

  function resetForm() {
    setFirstName("");
    setLastName("");
    setPhone("");
    setServiceId("");
    setCustomServiceName("");
    setStartTime(defaultStartTime());
    setPreparations([newPreparation(1)]);
    setNextPreparationId(2);
  }

  function selectService(value: string) {
    setServiceId(value);
    if (value === CUSTOM_SERVICE) {
      toast.warning("UWAGA! Sprawdź czy Twojego zabiegu nie ma na liście.");
    } else {
      setCustomServiceName("");
    }
  }

  function updatePreparation(id: number, patch: Partial<PreparationRow>) {
    setPreparations((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function selectProduct(rowId: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    updatePreparation(rowId, { productId, ...(product ? { unit: product.unit } : {}) });
  }

  function addPreparation() {
    if (preparations.length >= 10) return toast.error("Możesz dodać maksymalnie 10 preparatów");
    setPreparations((current) => [...current, newPreparation(nextPreparationId)]);
    setNextPreparationId((current) => current + 1);
  }

  async function createAppointment() {
    if (!firstName.trim() || !lastName.trim()) return toast.error("Podaj imię i nazwisko");
    if (!phone.trim()) return toast.error("Podaj numer telefonu");
    if (!serviceId) return toast.error("Wybierz zabieg");
    if (serviceId === CUSTOM_SERVICE && customServiceName.trim().length < 2) {
      return toast.error("Wpisz nazwę niestandardowego zabiegu");
    }

    const preparedItems: Array<{ productId: string; quantity: number; unit: UnitKey }> = [];
    for (const row of preparations) {
      const hasAnyValue = Boolean(row.productId || row.quantity.trim());
      if (!hasAnyValue) continue;
      if (!row.productId || !row.quantity.trim()) {
        return toast.error("Uzupełnij preparat i ilość albo pozostaw oba pola puste");
      }
      const quantity = Number(row.quantity.replace(",", "."));
      if (!Number.isFinite(quantity) || quantity <= 0) return toast.error("Podaj poprawną ilość preparatu");
      preparedItems.push({ productId: row.productId, quantity, unit: row.unit });
    }

    const startsAt = new Date(`${todayValue}T${startTime}:00`);
    if (Number.isNaN(startsAt.getTime())) return toast.error("Wybierz godzinę rozpoczęcia");

    setSaving(true);
    try {
      const response = await fetch("/api/specialist/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          serviceId: serviceId === CUSTOM_SERVICE ? null : serviceId,
          customServiceName: serviceId === CUSTOM_SERVICE ? customServiceName.trim() : null,
          startsAt: startsAt.toISOString(),
          preparations: preparedItems,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        return toast.error(result?.message || "Nie udało się utworzyć wizyty");
      }

      toast.success("Wizyta została utworzona");
      setDialogOpen(false);
      resetForm();
      await mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Moje wizyty</h1>
        <Button onClick={() => setDialogOpen(true)}>Nowa Wizyta</Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nowa Wizyta</DialogTitle>
            <div className="mt-1 text-sm text-zinc-500">
              Termin: {today.toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" })}
            </div>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Imię</Label>
                <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nazwisko</Label>
                <Input value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Numer telefonu</Label>
              <Input
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="np. +48 500 000 000"
              />
            </div>

            <div className="space-y-2">
              <Label>Zabieg</Label>
              <Select value={serviceId} onValueChange={selectService}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz zabieg" />
                </SelectTrigger>
                <SelectContent disablePortal>
                  <SelectItem value={CUSTOM_SERVICE}>Niestandardowe</SelectItem>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.category ? `${service.category} — ` : ""}{service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isLoading && services.length === 0 ? (
                <div className="text-xs text-amber-700">
                  Do Twojego konta nie przypisano jeszcze żadnych usług.
                </div>
              ) : null}
            </div>

            {serviceId === CUSTOM_SERVICE ? (
              <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                <div className="text-sm font-semibold">
                  UWAGA! Sprawdź czy Twojego zabiegu nie ma na liście.
                </div>
                <div className="space-y-2">
                  <Label>Nazwa niestandardowego zabiegu</Label>
                  <Input
                    value={customServiceName}
                    onChange={(event) => setCustomServiceName(event.target.value)}
                    placeholder="Wpisz nazwę zabiegu"
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Godzina rozpoczęcia</Label>
              <Select value={startTime} onValueChange={setStartTime}>
                <SelectTrigger className="md:w-52">
                  <SelectValue placeholder="Wybierz godzinę" />
                </SelectTrigger>
                <SelectContent disablePortal>
                  {timeOptions.map((time) => (
                    <SelectItem key={time} value={time}>{time}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div>
                <div className="font-medium">Zużyte preparaty</div>
                <div className="text-xs text-zinc-500">
                  Preparat jest wybierany z magazynu. Jeżeli podczas wizyty nic nie zużyto, pozostaw wiersz pusty.
                </div>
              </div>

              {preparations.map((row, index) => (
                <div key={row.id} className="grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_130px_170px_auto]">
                  <div className="space-y-2">
                    <Label>Preparat</Label>
                    <Select value={row.productId} onValueChange={(value) => selectProduct(row.id, value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Wybierz preparat" />
                      </SelectTrigger>
                      <SelectContent disablePortal>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Ilość</Label>
                    <Input
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(event) => updatePreparation(row.id, { quantity: event.target.value })}
                      placeholder="np. 1,5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Jednostka</Label>
                    <Select value={row.unit} onValueChange={(value) => updatePreparation(row.id, { unit: value as UnitKey })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent disablePortal>
                        {UNITS.map((unit) => (
                          <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    {index > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setPreparations((current) => current.filter((item) => item.id !== row.id))}
                      >
                        Usuń
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" onClick={addPreparation}>
                Dodaj kolejny preparat
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Anuluj
            </Button>
            <Button type="button" onClick={createAppointment} disabled={saving}>
              {saving ? "Zapisywanie..." : "Utwórz wizytę"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="space-y-3 p-4">
        <div className="font-medium">Zakres</div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <div className="text-sm text-zinc-500">Od</div>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-sm text-zinc-500">Do</div>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <div className="text-sm text-zinc-500">
            {isLoading ? "Ładowanie…" : `Wyniki: ${appointments.length}`}
          </div>
        </div>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="border-b p-4 font-medium">Lista</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Pacjent</th>
                <th className="p-3">Usługa</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && appointments.length === 0 ? (
                <tr><td className="p-3 text-zinc-500" colSpan={5}>Brak wizyt.</td></tr>
              ) : null}
              {appointments.map((appointment) => (
                <tr key={appointment.id} className="border-t">
                  <td className="p-3">
                    {new Date(appointment.startsAt).toLocaleString("pl-PL", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="p-3 font-medium">{appointment.patient.name}</td>
                  <td className="p-3">{appointment.customServiceName || appointment.service.name}</td>
                  <td className="p-3">{appointment.status}</td>
                  <td className="p-3 text-right">
                    <Link className="underline" href={`/specialist/appointments/${appointment.id}`}>Otwórz</Link>
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
