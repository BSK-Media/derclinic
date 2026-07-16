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
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";

type Patient = { id: string; name: string };
type Specialist = { id: string; name: string; serviceIds?: string[] };
type Service = {
  id: string;
  name: string;
  durationMin: number;
  priceSuggested?: number | null;
  priceFrom?: number | null;
};

function toLocalDateTimeInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminBookAppointmentDialog({
  open,
  onOpenChange,
  patients,
  specialists,
  services,
  defaultDate,
  defaultSpecialistId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patients: Patient[];
  specialists: Specialist[];
  services: Service[];
  defaultDate?: Date | null;
  defaultSpecialistId?: string;
  onCreated: () => void;
}) {
  const [patientId, setPatientId] = React.useState("");
  const [specialistId, setSpecialistId] = React.useState(defaultSpecialistId ?? "");
  const [serviceId, setServiceId] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [priceFinal, setPriceFinal] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const base = defaultDate ? new Date(defaultDate) : new Date();
    if (!defaultDate) {
      base.setMinutes(0, 0, 0);
      base.setHours(base.getHours() + 1);
    } else {
      base.setHours(10, 0, 0, 0);
    }
    setStartsAt(toLocalDateTimeInput(base));
    setSpecialistId(defaultSpecialistId ?? "");
    setPatientId("");
    setServiceId("");
    setPriceFinal("");
    setNote("");
  }, [open, defaultDate, defaultSpecialistId]);

  const selectedSpecialist = React.useMemo(
    () => specialists.find((s) => s.id === specialistId),
    [specialists, specialistId],
  );
  const availableServices = React.useMemo(() => {
    if (!selectedSpecialist) return [];
    if (!selectedSpecialist.serviceIds || selectedSpecialist.serviceIds.length === 0) return [];
    const allowed = new Set(selectedSpecialist.serviceIds);
    return services.filter((s) => allowed.has(s.id));
  }, [services, selectedSpecialist]);

  function selectSpecialist(value: string) {
    setSpecialistId(value);
    setServiceId("");
    setPriceFinal("");
  }

  const selectedService = React.useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId],
  );
  const durationMin = selectedService?.durationMin ?? 30;
  const standardPrice = selectedService?.priceSuggested ?? selectedService?.priceFrom ?? null;
  const enteredPrice = priceFinal.trim() ? parsePLNToGrosze(priceFinal) : null;
  const isStandardPrice = standardPrice !== null && enteredPrice === standardPrice;

  function selectService(value: string) {
    setServiceId(value);
    const service = services.find((item) => item.id === value);
    const price = service?.priceSuggested ?? service?.priceFrom ?? null;
    setPriceFinal(price === null ? "" : (price / 100).toFixed(2).replace(".", ","));
  }

  async function create() {
    if (!patientId || !specialistId || !serviceId || !startsAt) {
      toast.error("Uzupełnij wszystkie wymagane pola");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          patientId,
          specialistId,
          serviceId,
          startsAt: new Date(startsAt).toISOString(),
          durationMin,
          priceFinal: priceFinal ? parsePLNToGrosze(priceFinal) : null,
          note,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Wizyta dodana");
      onOpenChange(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nowa rezerwacja</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Pacjent</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz" />
              </SelectTrigger>
              <SelectContent disablePortal>
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Specjalista</Label>
            <Select value={specialistId} onValueChange={selectSpecialist}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz" />
              </SelectTrigger>
              <SelectContent disablePortal>
                {specialists.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Usługa</Label>
            <Select value={serviceId} onValueChange={selectService} disabled={!specialistId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={specialistId ? "Wybierz" : "Najpierw wybierz specjalistę"}
                />
              </SelectTrigger>
              <SelectContent disablePortal>
                {availableServices.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {specialistId && availableServices.length === 0 ? (
              <div className="text-xs text-amber-700">
                Ten specjalista nie ma jeszcze przypisanych usług.
              </div>
            ) : null}
            <div className="text-xs text-zinc-500">Czas trwania: {durationMin} min</div>
          </div>
          <div className="space-y-2">
            <Label>Termin</Label>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Cena końcowa (PLN)</Label>
              {enteredPrice !== null && standardPrice !== null ? (
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-xs font-medium " +
                    (isStandardPrice
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300")
                  }
                >
                  {isStandardPrice ? "Standardowa cena" : "Niestandardowa cena"}
                </span>
              ) : null}
            </div>
            <Input
              value={priceFinal}
              onChange={(e) => setPriceFinal(e.target.value)}
              placeholder="np. 500"
            />
            {standardPrice !== null ? (
              <div className="text-xs text-zinc-500">
                Cena zabiegu: {formatPLNFromGrosze(standardPrice)}. Możesz ją zmienić dla tej
                wizyty.
              </div>
            ) : null}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Notatka</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Anuluj
          </Button>
          <Button onClick={create} disabled={saving}>
            {saving ? "Zapisywanie…" : "Dodaj rezerwację"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
