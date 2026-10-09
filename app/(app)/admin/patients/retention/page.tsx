"use client";

import Link from "next/link";
import useSWR from "swr";
import { useAuth } from "@/components/auth-provider";
import { Card } from "@/components/ui/card";

type Item = { patientId: string; name: string; lastEntry: string; retentionEnd: string; appointments: number };

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const fmt = (iso: string) => new Date(iso).toLocaleDateString("pl-PL");

export default function RetentionPage() {
  const { user } = useAuth();
  const { data, isLoading } = useSWR<{ ok: boolean; years: number; items: Item[]; message?: string }>(
    user?.role === "ADMIN" ? "/api/admin/patients/retention" : null,
    fetcher,
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div>
        <Link href="/admin/patients" className="text-sm text-zinc-500 hover:underline">← Pacjenci</Link>
        <h1 className="mt-1 text-2xl font-semibold">Karty do brakowania</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pacjenci, których dokumentacja była przechowywana dłużej niż {data?.years ?? 20} lat (liczone od końca roku
          ostatniego wpisu). Dokumentację można zachować do czasu decyzji Administratora; karta nie jest usuwana
          automatycznie. Usunięcie robisz na stronie karty pacjenta — wymaga potwierdzenia MFA i zostaje zapisane w
          dzienniku zdarzeń, który służy jako protokół zniszczenia.
        </p>
      </div>

      {user?.role !== "ADMIN" ? (
        <p className="text-sm text-zinc-500">Ta lista jest dostępna tylko dla administratora.</p>
      ) : isLoading ? (
        <p className="text-sm text-zinc-500">Ładowanie…</p>
      ) : !data?.ok ? (
        <p className="text-sm text-red-600">{data?.message || "Nie udało się pobrać listy."}</p>
      ) : data.items.length === 0 ? (
        <Card className="p-6 text-sm text-zinc-500">Brak kart, dla których minął okres przechowywania.</Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Pacjent</th>
                <th className="px-4 py-3">Ostatni wpis</th>
                <th className="px-4 py-3">Przechowywać do</th>
                <th className="px-4 py-3">Wizyt</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.patientId} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/admin/patients/${item.patientId}`} className="font-medium text-emerald-700 hover:underline">
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{fmt(item.lastEntry)}</td>
                  <td className="px-4 py-3">{fmt(item.retentionEnd)}</td>
                  <td className="px-4 py-3">{item.appointments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
