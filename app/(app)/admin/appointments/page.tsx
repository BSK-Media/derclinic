"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";
import { appointmentStatusLabel } from "@/lib/appointment-status";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type Patient = { id: string; name: string };
type Specialist = { id: string; name: string };
type Service = {
  id: string;
  name: string;
  durationMin: number;
  priceSuggested?: number | null;
  priceFrom?: number | null;
};
type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  approvalStatus?: string;
  priceEstimate?: number | null;
  priceFinal?: number | null;
  customServiceName?: string | null;
  patient: Patient;
  specialist: Specialist;
  service: Service;
};

export default function AdminAppointmentsPage() {
  const today = useMemo(() => new Date(), []);
  const fromDefault = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const toDefault = useMemo(() => new Date(today.getFullYear(), today.getMonth() + 1, 0), [today]);

  const [from, setFrom] = useState(toDateInput(fromDefault));
  const [to, setTo] = useState(toDateInput(toDefault));

  const { data, mutate, isLoading } = useSWR(
    `/api/admin/appointments?from=${from}&to=${to}`,
    fetcher,
  );

  const appointments: Appointment[] = data?.appointments ?? [];
  const patients: Patient[] = data?.patients ?? [];
  const specialists: Specialist[] = data?.specialists ?? [];
  const services: Service[] = data?.services ?? [];

  const [patientId, setPatientId] = useState<string>("");
  const [specialistId, setSpecialistId] = useState<string>("");
  const [serviceId, setServiceId] = useState<string>("");
  const [startsAt, setStartsAt] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [priceFinal, setPriceFinal] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function decide(id: string, action: "APPROVE" | "REJECT") {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/admin/appointments/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać decyzji");
      toast.success(
        action === "APPROVE" ? "Wizyta zaakceptowana — liczy się do rozliczeń" : "Wizyta odrzucona",
      );
      mutate();
    } finally {
      setApprovingId(null);
    }
  }

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId],
  );
  const durationMin = selectedService?.durationMin ?? 30;
  const standardPrice = selectedService?.priceSuggested ?? selectedService?.priceFrom ?? null;
  const enteredPrice = priceFinal ? parsePLNToGrosze(priceFinal) : null;
  const isStandardPrice = standardPrice !== null && enteredPrice === standardPrice;

  function selectService(value: string) {
    setServiceId(value);
    const service = services.find((item) => item.id === value);
    const price = service?.priceSuggested ?? service?.priceFrom ?? null;
    setPriceFinal(price === null ? "" : (price / 100).toFixed(2).replace(".", ","));
  }

  async function create() {
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
      setNote("");
      setPriceFinal("");
      mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Wizyty</h1>

      <Card className="space-y-4 p-4">
        <div className="font-medium">Nowa wizyta (pacjent → specjalista → usługa → termin)</div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Pacjent</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz" />
              </SelectTrigger>
              <SelectContent>
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
            <Select value={specialistId} onValueChange={setSpecialistId}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz" />
              </SelectTrigger>
              <SelectContent>
                {specialists.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Usługa</Label>
            <Select value={serviceId} onValueChange={selectService}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-zinc-500">
              Czas: {durationMin} min • Sugerowana cena:{" "}
              {formatPLNFromGrosze(selectedService?.priceSuggested ?? null)}
            </div>
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
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800")
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
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Notatka</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <Button onClick={create} disabled={saving || !patientId || !specialistId || !serviceId}>
          {saving ? "Zapisywanie..." : "Dodaj wizytę"}
        </Button>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="font-medium">Zakres listy</div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Od</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Do</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="text-sm text-zinc-500">
            {isLoading ? "Ładowanie…" : `Wyniki: ${appointments.length}`}
          </div>
        </div>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="border-b p-4 font-medium">Lista wizyt</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Pacjent</th>
                <th className="p-3">Specjalista</th>
                <th className="p-3">Usługa</th>
                <th className="p-3">Status</th>
                <th className="p-3">Cena</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && appointments.length === 0 && (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={7}>
                    Brak wizyt.
                  </td>
                </tr>
              )}
              {appointments.map((a) => {
                const isHistorical = toDateInput(new Date(a.startsAt)) < toDateInput(today);
                return (
                  <tr
                    key={a.id}
                    className={
                      "border-t " +
                      (isHistorical
                        ? "bg-zinc-50 hover:bg-zinc-100 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-900/40")
                    }
                  >
                    <td className="p-3">
                      {new Date(a.startsAt).toLocaleString("pl-PL", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="p-3 font-medium">{a.patient.name}</td>
                    <td className="p-3">{a.specialist.name}</td>
                    <td className="p-3">{a.customServiceName || a.service.name}</td>
                    <td className="p-3">
                      <div>{appointmentStatusLabel(a.status)}</div>
                      {a.approvalStatus === "PENDING" ? (
                        <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                          Do akceptacji
                        </span>
                      ) : null}
                      {a.approvalStatus === "REJECTED" ? (
                        <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-500/10 dark:text-red-300">
                          Odrzucona
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3">{formatPLNFromGrosze(a.priceFinal ?? a.priceEstimate)}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {a.approvalStatus === "PENDING" ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => decide(a.id, "APPROVE")}
                              disabled={approvingId === a.id}
                            >
                              {approvingId === a.id ? "..." : "✓ Akceptuj"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => decide(a.id, "REJECT")}
                              disabled={approvingId === a.id}
                            >
                              ✕ Odrzuć
                            </Button>
                          </>
                        ) : null}
                        <Link className="underline" href={`/admin/appointments/${a.id}`}>
                          Szczegóły
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-zinc-500">
        Po wizycie: ustaw status „Zakończona”, wpisz cenę końcową, dodaj zużyte preparaty (z
        magazynu) i zarejestruj płatność.
      </div>
    </div>
  );
}
