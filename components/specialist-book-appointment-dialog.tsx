"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CUSTOM_SERVICE = "__custom__";

type UnitKey = "UNIT" | "ML" | "MG" | "G" | "AMPULE" | "BOTOX_UNIT";

type SuggestedProduct = {
  productId: string;
  productName: string;
  quantity: number;
  unit: UnitKey;
};

export type SpecialistServiceOption = {
  id: string;
  name: string;
  category?: string | null;
  durationMin: number;
  suggestedProducts: SuggestedProduct[];
};

type Product = { id: string; name: string; unit: UnitKey };

type PreparationRow = {
  id: number;
  productId: string;
  quantity: string;
  unit: UnitKey | null;
  suggestedQuantity?: number;
};

const UNIT_LABELS: Record<UnitKey, string> = {
  ML: "ml",
  MG: "mg",
  G: "g",
  UNIT: "szt.",
  AMPULE: "ampułka",
  BOTOX_UNIT: "jednostka botoksu",
};

function unitLabel(unit?: UnitKey | null) {
  return unit ? UNIT_LABELS[unit] : "—";
}

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function newPreparation(id: number): PreparationRow {
  return { id, productId: "", quantity: "", unit: null };
}

export function SpecialistBookAppointmentDialog({
  open,
  onOpenChange,
  services,
  products,
  defaultDate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: SpecialistServiceOption[];
  products: Product[];
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
  const [preparations, setPreparations] = React.useState<PreparationRow[]>([newPreparation(1)]);
  const [nextPreparationId, setNextPreparationId] = React.useState(2);
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
    setPreparations([newPreparation(1)]);
    setNextPreparationId(2);
  }, [open, defaultDate]);

  function selectService(value: string) {
    setServiceId(value);
    if (value === CUSTOM_SERVICE) {
      toast.warning("UWAGA! Sprawdź czy Twojego zabiegu nie ma na liście.");
      setCustomServiceName("");
      setPreparations([newPreparation(nextPreparationId)]);
      setNextPreparationId((n) => n + 1);
      return;
    }
    const service = services.find((s) => s.id === value);
    const suggested = service?.suggestedProducts ?? [];
    if (suggested.length > 0) {
      let id = nextPreparationId;
      const rows: PreparationRow[] = suggested.map((sp) => ({
        id: id++,
        productId: sp.productId,
        quantity: String(sp.quantity),
        unit: products.find((product) => product.id === sp.productId)?.unit ?? sp.unit,
        suggestedQuantity: sp.quantity,
      }));
      setPreparations(rows);
      setNextPreparationId(id);
    } else {
      setPreparations([newPreparation(nextPreparationId)]);
      setNextPreparationId((n) => n + 1);
    }
  }

  function updatePreparation(id: number, patch: Partial<PreparationRow>) {
    setPreparations((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
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

  function removePreparation(id: number) {
    setPreparations((current) => current.filter((item) => item.id !== id));
  }

  async function createAppointment() {
    if (!firstName.trim() || !lastName.trim()) return toast.error("Podaj imię i nazwisko");
    if (!phone.trim()) return toast.error("Podaj numer telefonu");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error("Podaj prawidłowy adres email");
    if (!serviceId) return toast.error("Wybierz zabieg");
    if (serviceId === CUSTOM_SERVICE && customServiceName.trim().length < 2) {
      return toast.error("Wpisz nazwę niestandardowego zabiegu");
    }

    const preparedItems: Array<{ productId: string; quantity: number }> = [];
    let hasDeviation = false;
    for (const row of preparations) {
      const hasAnyValue = Boolean(row.productId || row.quantity.trim());
      if (!hasAnyValue) continue;
      if (!row.productId || !row.quantity.trim()) {
        return toast.error("Uzupełnij preparat i ilość albo pozostaw oba pola puste");
      }
      const quantity = Number(row.quantity.replace(",", "."));
      if (!Number.isFinite(quantity) || quantity <= 0) return toast.error("Podaj poprawną ilość preparatu");
      if (row.suggestedQuantity !== undefined && quantity !== row.suggestedQuantity) hasDeviation = true;
      preparedItems.push({ productId: row.productId, quantity });
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
          preparations: preparedItems,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        return toast.error(result?.message || "Nie udało się utworzyć wizyty");
      }

      toast.success(
        hasDeviation
          ? "Wizyta utworzona. Zmieniona ilość preparatu czeka na akceptację administratora."
          : "Wizyta została utworzona",
      );
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
              <div className="text-xs text-amber-700">Do Twojego konta nie przypisano jeszcze żadnych usług.</div>
            ) : null}
          </div>

          {serviceId === CUSTOM_SERVICE ? (
            <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <div className="text-sm font-semibold">UWAGA! Sprawdź czy Twojego zabiegu nie ma na liście.</div>
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

          <div className="space-y-3">
            <div>
              <div className="font-medium">Zużyte preparaty</div>
              <div className="text-xs text-zinc-500">
                Ilości sugerowane dla wybranego zabiegu wypełniają się automatycznie. Zmiana ilości wymaga akceptacji
                administratora.
              </div>
            </div>

            {preparations.map((row) => {
              const modified = row.suggestedQuantity !== undefined && row.quantity.trim() !== "" &&
                Number(row.quantity.replace(",", ".")) !== row.suggestedQuantity;
              return (
                <div
                  key={row.id}
                  className={
                    "grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_130px_170px_auto] " +
                    (modified ? "border-amber-400 bg-amber-50 dark:bg-amber-500/10" : "")
                  }
                >
                  <div className="space-y-2">
                    <Label>Preparat</Label>
                    <Select value={row.productId} onValueChange={(value) => selectProduct(row.id, value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Wybierz preparat" />
                      </SelectTrigger>
                      <SelectContent disablePortal>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {row.suggestedQuantity !== undefined ? (
                      <div className="text-[11px] text-zinc-500">
                        Sugerowana ilość: {row.suggestedQuantity} {unitLabel(row.unit)}
                      </div>
                    ) : null}
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
                    <Input
                      value={unitLabel(row.unit)}
                      disabled
                      aria-label="Jednostka przypisana do preparatu"
                      className="disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="ghost" onClick={() => removePreparation(row.id)}>
                      Usuń
                    </Button>
                  </div>
                  {modified ? (
                    <div className="md:col-span-4 text-[11px] font-medium text-amber-700">
                      Zmieniona ilość względem sugerowanej — po zapisaniu będzie czekać na akceptację administratora.
                    </div>
                  ) : null}
                </div>
              );
            })}

            <Button type="button" variant="outline" onClick={addPreparation}>
              Dodaj kolejny preparat
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
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
