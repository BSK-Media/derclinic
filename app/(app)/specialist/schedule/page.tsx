"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  patient: { name: string };
  service: { name: string };
};

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function SpecialistSchedulePage() {
  const [anchor, setAnchor] = useState(() => new Date());
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    return d;
  }, [weekStart]);

  const from = weekStart.toISOString();
  const to = weekEnd.toISOString();
  const { data, isLoading } = useSWR(`/api/specialist/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, fetcher);
  const appointments: Appointment[] = data?.appointments ?? [];

  const days = useMemo(() => {
    const arr: { date: Date; key: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      arr.push({ date: d, key: d.toISOString().slice(0, 10) });
    }
    return arr;
  }, [weekStart]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const d of days) map.set(d.key, []);
    for (const a of appointments) {
      const key = new Date(a.startsAt).toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    for (const v of map.values()) v.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    return map;
  }, [appointments, days]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Grafik (tydzień)</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAnchor((d) => { const x = new Date(d); x.setDate(x.getDate() - 7); return x; })}>← Poprzedni</Button>
          <Button variant="outline" onClick={() => setAnchor(new Date())}>Dziś</Button>
          <Button variant="outline" onClick={() => setAnchor((d) => { const x = new Date(d); x.setDate(x.getDate() + 7); return x; })}>Następny →</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="text-sm text-zinc-500">{weekStart.toLocaleDateString("pl-PL")} – {new Date(weekEnd.getTime() - 1).toLocaleDateString("pl-PL")}{isLoading ? " • Ładowanie…" : ""}</div>
      </Card>

      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const list = byDay.get(d.key) ?? [];
          return (
            <div key={d.key} className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950 overflow-hidden">
              <div className="p-3 border-b">
                <div className="text-xs text-zinc-500">{d.date.toLocaleDateString("pl-PL", { weekday: "short" })}</div>
                <div className="font-medium">{d.date.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" })}</div>
              </div>
              <div className="p-3 space-y-2">
                {list.length === 0 && <div className="text-xs text-zinc-500">Brak wizyt</div>}
                {list.map((a) => (
                  <Link key={a.id} href={`/specialist/appointments/${a.id}`} className="block rounded-lg border p-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                    <div className="text-xs text-zinc-500">{new Date(a.startsAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })} – {new Date(a.endsAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}</div>
                    <div className="text-sm font-medium truncate">{a.patient.name}</div>
                    <div className="text-xs text-zinc-500 truncate">{a.service.name} • {a.status}</div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
