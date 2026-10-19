"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Service = { id: string; name: string; category: string | null; durationMin: number; visits: number };
type Specialist = { id: string; name: string; role: string; visits: number };
type Resp = { ok: boolean; message?: string; services?: Service[]; specialists?: Specialist[] };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ArchivePage() {
  const { user } = useAuth();
  const allowed = user?.role === "ADMIN" || user?.role === "MANAGER";
  const { data, mutate } = useSWR<Resp>(allowed ? "/api/admin/settings/archive" : null, fetcher);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function restore(serviceId: string) {
    setBusyId(serviceId);
    try {
      const res = await fetch("/api/admin/settings/archive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serviceId }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się przywrócić usługi");
      toast.success("Usługa przywrócona");
      await mutate();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <Link href="/admin/settings" className="text-sm text-slate-500 hover:underline">← Ustawienia</Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Archiwum</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Usługi i konta pracowników zachowane tylko po to, żeby historia wizyt pokazywała właściwą nazwę zabiegu i osobę.
          Nie pojawiają się na zwykłych listach, w kalendarzu, rozliczeniach ani w rezerwacjach.
        </p>
      </div>

      {!data ? <Card className="p-5 text-sm text-slate-500">Ładowanie…</Card> : null}
      {data && !data.ok ? <Card className="p-5 text-sm text-red-600">{data.message || "Brak dostępu."}</Card> : null}

      {data?.ok ? (
        <>
          <Card className="space-y-3 p-5">
            <div className="font-semibold">Usługi archiwalne ({data.services?.length ?? 0})</div>
            {data.services?.length ? (
              <div className="max-h-[32rem] overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {data.services.map((service) => (
                      <tr key={service.id} className="border-t border-slate-200 dark:border-white/10">
                        <td className="py-1.5 pr-3">{service.name}</td>
                        <td className="py-1.5 pr-3 text-right text-xs text-slate-500">
                          {service.visits} {service.visits === 1 ? "wizyta" : "wizyt"}
                        </td>
                        <td className="py-1.5 text-right">
                          {user?.role === "ADMIN" ? (
                            <Button size="sm" variant="outline" disabled={busyId === service.id} onClick={() => restore(service.id)}>
                              Przywróć
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Brak usług w archiwum.</p>
            )}
          </Card>

          <Card className="space-y-3 p-5">
            <div className="font-semibold">Konta archiwalne ({data.specialists?.length ?? 0})</div>
            <p className="text-xs text-slate-500">Dawni specjaliści — wyłączone konta bez możliwości logowania.</p>
            {data.specialists?.length ? (
              <table className="w-full text-sm">
                <tbody>
                  {data.specialists.map((s) => (
                    <tr key={s.id} className="border-t border-slate-200 dark:border-white/10">
                      <td className="py-1.5 pr-3">{s.name}</td>
                      <td className="py-1.5 text-right text-xs text-slate-500">
                        {s.visits} {s.visits === 1 ? "wizyta" : "wizyt"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-500">Brak kont w archiwum.</p>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
