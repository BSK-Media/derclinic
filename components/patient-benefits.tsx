"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { formatPLNFromGrosze } from "@/lib/money";
import { BENEFIT_STATUS_LABELS, type BenefitStatus } from "@/lib/vouchers";
import { cn } from "@/lib/utils";

type Usage = { id: string; amount: number; sessions: number | null; at: string; appointmentId: string | null; visitAt: string | null; serviceName: string | null };
type VoucherItem = { id: string; code: string; title: string; amount: number; remaining: number; expiresAt: string | null; status: BenefitStatus; usage: Usage[] };
type PackageItem = {
  id: string;
  code: string;
  title: string;
  serviceName: string | null;
  sessionsTotal: number;
  sessionsLeft: number;
  expiresAt: string | null;
  status: BenefitStatus;
  usage: Usage[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const dateFmt = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Warsaw" });
const fmtDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "bez terminu");
const TONE: Record<BenefitStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  EXHAUSTED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  EXPIRED: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  CANCELED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200",
};

// Vouchery i pakiety pacjenta z saldem / pozostałymi zabiegami i historią wykorzystania (karta pacjenta).
export function PatientBenefits({ patientId }: { patientId: string }) {
  const { data } = useSWR<{ ok: boolean; vouchers: VoucherItem[]; packages: PackageItem[] }>(`/api/admin/patients/${patientId}/benefits`, fetcher);
  if (!data?.ok || (data.vouchers.length === 0 && data.packages.length === 0)) return null;

  return (
    <Card className="space-y-4 p-4">
      <div className="font-semibold">Vouchery i pakiety</div>

      {data.vouchers.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Vouchery</div>
          {data.vouchers.map((v) => (
            <details key={v.id} className="rounded-xl border p-3">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{v.title}</span>{" "}
                  <span className="font-mono text-xs text-zinc-500">{v.code}</span>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <strong>
                    {formatPLNFromGrosze(v.remaining)} <span className="font-normal text-zinc-500">z {formatPLNFromGrosze(v.amount)}</span>
                  </strong>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TONE[v.status])}>{BENEFIT_STATUS_LABELS[v.status]}</span>
                </span>
              </summary>
              <div className="mt-2 space-y-1 text-sm">
                <div className="text-xs text-zinc-500">Ważny do: {fmtDate(v.expiresAt)}</div>
                {v.usage.length === 0 ? (
                  <div className="text-zinc-500">Voucher nie był jeszcze użyty.</div>
                ) : (
                  v.usage.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-2">
                      <span>
                        {fmtDate(u.visitAt ?? u.at)} · {u.serviceName ?? "wizyta"}
                      </span>
                      <span className="flex items-center gap-2">
                        <strong>−{formatPLNFromGrosze(u.amount)}</strong>
                        {u.appointmentId ? (
                          <Link href={`/admin/appointments/${u.appointmentId}`} className="text-xs text-indigo-600 hover:underline">
                            wizyta
                          </Link>
                        ) : null}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </details>
          ))}
        </div>
      ) : null}

      {data.packages.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Pakiety</div>
          {data.packages.map((p) => (
            <details key={p.id} className="rounded-xl border p-3">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{p.title}</span>{" "}
                  <span className="font-mono text-xs text-zinc-500">{p.code}</span>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <strong>
                    {p.sessionsLeft} <span className="font-normal text-zinc-500">z {p.sessionsTotal} zabiegów</span>
                  </strong>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TONE[p.status])}>{BENEFIT_STATUS_LABELS[p.status]}</span>
                </span>
              </summary>
              <div className="mt-2 space-y-1 text-sm">
                <div className="text-xs text-zinc-500">
                  {p.serviceName ? `Usługa: ${p.serviceName} · ` : ""}Ważny do: {fmtDate(p.expiresAt)}
                </div>
                {p.usage.length === 0 ? (
                  <div className="text-zinc-500">Żaden zabieg nie został jeszcze rozliczony.</div>
                ) : (
                  p.usage.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-2">
                      <span>
                        {fmtDate(u.visitAt ?? u.at)} · {u.serviceName ?? "wizyta"}
                      </span>
                      <span className="flex items-center gap-2">
                        <strong>−{u.sessions ?? 1}</strong>
                        {u.appointmentId ? (
                          <Link href={`/admin/appointments/${u.appointmentId}`} className="text-xs text-indigo-600 hover:underline">
                            wizyta
                          </Link>
                        ) : null}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
