"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Patient = { id: string; name: string };
type Specialist = { id: string; name: string };
type Service = { id: string; name: string; durationMin: number; priceSuggested?: number | null };
type Appointment = { id: string; startsAt: string; endsAt: string; status: string; priceEstimate?: number | null; priceFinal?: number | null;
  patient: Patient; specialist: Specialist; service: Service };

export default function AdminAppointmentsPage() {
  const today = new Date();
  const fromDefault = new Date(today); fromDefault.setDate(fromDefault.getDate()-1); fromDefault.setHours(0,0,0,0);
  const toDefault = new Date(today); toDefault.setDate(toDefault.getDate()+14); toDefault.setHours(0,0,0,0);

  const [from, setFrom] = useState(fromDefault.toISOString().slice(0,10));
  const [to, setTo] = useState(toDefault.toISOString().slice(0,10));

  const { data, mutate, isLoading } = useSWR(`/api/admin/appointments?from=${from}&to=${to}`, fetcher);

  const appointments: Appointment[] = data?.appointments ?? [];
  const patients: Patient[] = data?.patients ?? [];
  const specialists: Specialist[] = data?.specialists ?? [];
  const services: Service[] = data?.services ?? [];

  const [patientId, setPatientId] = useState<string>("");
  const [specialistId, setSpecialistId] = useState<string>("");
  const [serviceId, setServiceId] = useState<string>("");
  const [startsAt, setStartsAt] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(0,0,0);
    d.setHours(d.getHours()+1);
    return d.toISOString().slice(0,16);
  });
  const [priceEstimate, setPriceEstimate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedService = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);
  const durationMin = selectedService?.durationMin ?? 30;

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
          priceEstimate: priceEstimate ? parsePLNToGrosze(priceEstimate) : null,
          note,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Wizyta dodana");
      setNote(""); setPriceEstimate("");
      mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Wizyty</h1>

      <Card className="p-4 space-y-4">
        <div className="font-medium">Nowa wizyta (pacjent → specjalista → usługa → termin)</div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Pacjent</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
              <SelectContent>
                {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Specjalista</Label>
            <Select value={specialistId} onValueChange={setSpecialistId}>
              <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
              <SelectContent>
                {specialists.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Usługa</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger><SelectValue placeholder="Wybierz" /></SelectTrigger>
              <SelectContent>
                {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="text-xs text-zinc-500">Czas: {durationMin} min • Sugerowana cena: {formatPLNFromGrosze(selectedService?.priceSuggested ?? null)}</div>
          </div>
          <div className="space-y-2">
            <Label>Termin</Label>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Cena orientacyjna (PLN)</Label>
            <Input value={priceEstimate} onChange={(e) => setPriceEstimate(e.target.value)} placeholder="np. 500" />
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

      <Card className="p-4 space-y-3">
        <div className="font-medium">Zakres listy</div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-2">
            <Label>Od</Label>
            <Input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Do</Label>
            <Input type="date" value={to} onChange={(e)=>setTo(e.target.value)} />
          </div>
          <div className="text-sm text-zinc-500">{isLoading ? "Ładowanie…" : `Wyniki: ${appointments.length}`}</div>
        </div>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="p-4 border-b font-medium">Lista wizyt</div>
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
                <tr><td className="p-3 text-zinc-500" colSpan={7}>Brak wizyt.</td></tr>
              )}
              {appointments.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3">{new Date(a.startsAt).toLocaleString("pl-PL",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</td>
                  <td className="p-3 font-medium">{a.patient.name}</td>
                  <td className="p-3">{a.specialist.name}</td>
                  <td className="p-3">{a.service.name}</td>
                  <td className="p-3">{a.status}</td>
                  <td className="p-3">{formatPLNFromGrosze(a.priceFinal ?? a.priceEstimate)}</td>
                  <td className="p-3 text-right">
                    <Link className="underline" href={`/admin/appointments/${a.id}`}>Szczegóły</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-zinc-500">
        Po wizycie: ustaw status „COMPLETED”, wpisz cenę końcową, dodaj zużyte preparaty (z magazynu) i zarejestruj płatność.
      </div>
    </div>
  );
}
