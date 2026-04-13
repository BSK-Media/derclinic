"use client";

import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  patient: { name: string };
  service: { name: string };
};

export default function SpecialistAppointmentsPage() {
  const today = new Date();
  const fromDefault = new Date(today); fromDefault.setDate(fromDefault.getDate() - 7);
  const toDefault = new Date(today); toDefault.setDate(toDefault.getDate() + 14);
  const [from, setFrom] = useState(fromDefault.toISOString().slice(0, 10));
  const [to, setTo] = useState(toDefault.toISOString().slice(0, 10));

  const { data, isLoading } = useSWR(`/api/specialist/appointments?from=${from}&to=${to}`, fetcher);
  const appointments: Appointment[] = data?.appointments ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Moje wizyty</h1>

      <Card className="p-4 space-y-3">
        <div className="font-medium">Zakres</div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-2">
            <div className="text-sm text-zinc-500">Od</div>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-sm text-zinc-500">Do</div>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="text-sm text-zinc-500">{isLoading ? "Ładowanie…" : `Wyniki: ${appointments.length}`}</div>
        </div>
      </Card>

      <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
        <div className="p-4 border-b font-medium">Lista</div>
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
              {!isLoading && appointments.length === 0 && <tr><td className="p-3 text-zinc-500" colSpan={5}>Brak wizyt.</td></tr>}
              {appointments.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3">{new Date(a.startsAt).toLocaleString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="p-3 font-medium">{a.patient.name}</td>
                  <td className="p-3">{a.service.name}</td>
                  <td className="p-3">{a.status}</td>
                  <td className="p-3 text-right"><Link className="underline" href={`/specialist/appointments/${a.id}`}>Otwórz</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
