"use client";

import * as React from "react";
import { toast } from "sonner";
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

const CUSTOM_SERVICE = "__custom__";

type SuggestedProduct = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
};

export type SpecialistServiceOption = {
  id: string;
  name: string;
  category?: string | null;
  durationMin: number;
  suggestedProducts: SuggestedProduct[];
};

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function SpecialistBookAppointmentDialog({
  open,
  onOpenChange,
  services,
  products: _products,
  defaultDate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: SpecialistServiceOption[];
  products?: unknown[];
  defaultDate?: Date | null;
  onCreated: () => void;
}) {
  const timeOptions = React.useMemo(
    () =>
      Array.from({ length: 24 * 12 }, (_, index) => {
        const hour = Math.floor(index / 12);
        const minute = (index % 12) * 5;
        return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      }),
    [],
  );

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [serviceId, setServiceId] = React.useState("");
  const [customServiceName, setCustomServiceName] = React.useState("");
  const [startTime, setStartTime] = React.useState("09:00");
  const [dateValue, setDateValue] = React.useState(() => toDateInput(defaultDate ?? new Date()));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setServiceId("");
    setCustomServiceName("");
    setStartTime("09:00");
    setDateValue(toDateInput(defaultDate ?? new Date()));
  }, [open, defaultDate]);

  function selectService(value: string) {
    setServiceId(value);
    if (value === CUSTOM_SERVICE) {
      toast.warning("UWAGA! Sprawdź czy Twojego zabiegu nie ma na liście.");
      setCustomServiceName("");
    }
  }

  async function createAppointment() {
    if (!firstName.trim() || !lastName.trim()) return toast.error("Podaj imię i nazwisko");
    if (!phone.trim()) return toast.error("Podaj numer telefonu");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return toast.error("Podaj prawidłowy adres email");
    if (!serviceId) return toast.error("Wybierz zabieg");
    if (serviceId === CUSTOM_SERVICE && customServiceName.trim().length < 2) {
      return toast.error("Wpisz nazwę niestandardowego zabiegu");
    }

    if (!dateValue) return toast.error("Wybierz datę wizyty");
    const startsAt = new Date(`${dateValue}T${startTime}:00`);
    if (Number.isNaN(startsAt.getTime())) return toast.error("Wybierz datę i godzinę rozpoczęcia");

    setSaving(true);
    try {
      const response = await fetch("/api/specialist/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          serviceId: serviceId === CUSTOM_SERVICE ? null : serviceId,
          customServiceName: serviceId === CUSTOM_SERVICE ? customServiceName.trim() : null,
          startsAt: startsAt.toISOString(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        return toast.error(result?.message || "Nie udało się utworzyć wizyty");
      }

      toast.success("Wizyta została utworzona");
      onOpenChange(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nowa wizyta</DialogTitle>
          <div className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
            <span>Termin:</span>
            <Input
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
              className="h-9 w-44"
            />
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
            <Label>Adres email (opcjonalnie)</Label>
            <Input
              inputMode="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="np. pacjent@example.com"
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
                    {service.category ? `${service.category} — ` : ""}
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {services.length === 0 ? (
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
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            Zużycie preparatów oraz cenę końcową uzupełni recepcja lub administrator.
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Anuluj
          </Button>
          <Button type="button" onClick={createAppointment} disabled={saving}>
            {saving ? "Zapisywanie..." : "Utwórz wizytę"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
