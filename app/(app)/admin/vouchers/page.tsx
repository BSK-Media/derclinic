"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { useConfirm } from "@/components/confirm-provider";
import { PatientPicker } from "@/components/patient-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";
import { BENEFIT_STATUS_LABELS, type BenefitStatus } from "@/lib/vouchers";
import { cn } from "@/lib/utils";

type VoucherRow = {
  id: string;
  code: string;
  title: string;
  amount: number;
  remaining: number;
  expiresAt: string | null;
  createdAt: string;
  saleMethod: string;
  status: BenefitStatus;
  patient: { id: string; name: string; phone: string | null };
};
type VoucherDetail = VoucherRow & {
  createdBy: string | null;
  note: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  usage: { id: string; amount: number; at: string; appointmentId: string | null; visitAt: string | null; serviceName: string | null }[];
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const METHOD_LABELS: Record<string, string> = { CASH: "Gotówka", CARD: "Karta", TRANSFER: "Przelew", BLIK: "BLIK" };
const dateFmt = new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Warsaw" });
const fmtDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "bez terminu");
const STATUS_TONE: Record<BenefitStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  EXHAUSTED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  EXPIRED: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  CANCELED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200",
};

export default function VouchersPage() {
  const { user } = useAuth();
  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [status, setStatus] = React.useState<string>("ALL");
  const [page, setPage] = React.useState(1);
  const [sellOpen, setSellOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const { data, mutate, isLoading } = useSWR(
    `/api/admin/vouchers?q=${encodeURIComponent(debouncedQ)}&status=${status}&page=${page}&pageSize=25`,
    fetcher,
    { keepPreviousData: true },
  );
  const vouchers: VoucherRow[] = data?.vouchers ?? [];
  const summary = data?.summary as { activeCount: number; activeRemaining: number; soldTotal: number } | undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vouchery i karty podarunkowe</h1>
          <p className="text-sm text-zinc-500">Sprzedaż voucherów na kwotę dla konkretnego pacjenta. Saldo i wykorzystanie widać też na karcie pacjenta.</p>
        </div>
        <Button onClick={() => setSellOpen(true)}>+ Sprzedaj voucher</Button>
      </div>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs text-zinc-500">Aktywne vouchery</div>
            <div className="mt-1 text-2xl font-semibold">{summary.activeCount}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500">Do wykorzystania (saldo aktywnych)</div>
            <div className="mt-1 text-2xl font-semibold">{formatPLNFromGrosze(summary.activeRemaining)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500">Sprzedane łącznie</div>
            <div className="mt-1 text-2xl font-semibold">{formatPLNFromGrosze(summary.soldTotal)}</div>
          </Card>
        </div>
      ) : null}

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-sm" placeholder="Szukaj: pacjent, telefon, kod, tytuł" value={q} onChange={(e) => setQ(e.target.value)} />
          {[
            ["ALL", "Wszystkie"],
            ["ACTIVE", "Aktywne"],
            ["EXHAUSTED", "Wykorzystane"],
            ["EXPIRED", "Wygasłe"],
            ["CANCELED", "Anulowane"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium",
                status === value ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white text-zinc-600 dark:bg-[#0b1220] dark:text-zinc-300",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="p-2">Kod</th>
                <th className="p-2">Pacjent</th>
                <th className="p-2">Tytuł</th>
                <th className="p-2 text-right">Kwota</th>
                <th className="p-2 text-right">Pozostało</th>
                <th className="p-2">Ważny do</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id} className="cursor-pointer border-t hover:bg-zinc-50 dark:hover:bg-zinc-900" onClick={() => setDetailId(v.id)}>
                  <td className="p-2 font-mono text-xs">{v.code}</td>
                  <td className="p-2">
                    <div className="font-medium">{v.patient.name}</div>
                    <div className="text-xs text-zinc-500">{v.patient.phone ?? ""}</div>
                  </td>
                  <td className="p-2">{v.title}</td>
                  <td className="p-2 text-right">{formatPLNFromGrosze(v.amount)}</td>
                  <td className="p-2 text-right font-semibold">{formatPLNFromGrosze(v.remaining)}</td>
                  <td className="p-2">{fmtDate(v.expiresAt)}</td>
                  <td className="p-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[v.status])}>{BENEFIT_STATUS_LABELS[v.status]}</span>
                  </td>
                </tr>
              ))}
              {!isLoading && vouchers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-zinc-500">
                    Brak voucherów.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>
            {data?.total ?? 0} {(data?.total ?? 0) === 1 ? "voucher" : "voucherów"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={(data?.page ?? 1) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ‹
            </Button>
            <span>
              Strona {data?.page ?? 1} z {data?.pageCount ?? 1}
            </span>
            <Button variant="outline" size="sm" disabled={(data?.page ?? 1) >= (data?.pageCount ?? 1)} onClick={() => setPage((p) => p + 1)}>
              ›
            </Button>
          </div>
        </div>
      </Card>

      <SellVoucherDialog
        open={sellOpen}
        onOpenChange={setSellOpen}
        onSold={(code) => {
          toast.success(`Sprzedano voucher ${code}`);
          void mutate();
        }}
      />
      <VoucherDetailDialog
        id={detailId}
        canCancel={user?.role === "ADMIN" || user?.role === "MANAGER"}
        onClose={() => setDetailId(null)}
        onChanged={() => void mutate()}
      />
    </div>
  );
}

function SellVoucherDialog({ open, onOpenChange, onSold }: { open: boolean; onOpenChange: (open: boolean) => void; onSold: (code: string) => void }) {
  const [patientId, setPatientId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [saleMethod, setSaleMethod] = React.useState("CARD");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [pickerKey, setPickerKey] = React.useState(0);

  function reset() {
    setPatientId("");
    setTitle("");
    setAmount("");
    setExpiresAt("");
    setSaleMethod("CARD");
    setNote("");
    setPickerKey((k) => k + 1);
  }

  async function sell() {
    const grosze = parsePLNToGrosze(amount);
    if (!patientId) return toast.error("Wybierz pacjenta");
    if (title.trim().length < 2) return toast.error("Podaj tytuł vouchera");
    if (!grosze || grosze < 100) return toast.error("Podaj kwotę vouchera (min. 1 zł)");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/vouchers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patientId, title: title.trim(), amount: grosze, expiresAt: expiresAt || null, saleMethod, note: note.trim() || null }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się sprzedać vouchera");
      onSold(out.voucher.code);
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sprzedaż vouchera</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Pacjent (imię, nazwisko lub telefon)</Label>
            <PatientPicker key={pickerKey} value={patientId} onChange={setPatientId} allowNew={false} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="v-title">Tytuł</Label>
            <Input id="v-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. Voucher urodzinowy" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="v-amount">Kwota (zł)</Label>
              <Input id="v-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="np. 500" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="v-exp">Termin ważności</Label>
              <Input id="v-exp" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="v-method">Jak klient płaci za voucher</Label>
            <select
              id="v-method"
              value={saleMethod}
              onChange={(e) => setSaleMethod(e.target.value)}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              {Object.entries(METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="v-note">Notatka (opcjonalnie)</Label>
            <Input id="v-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={sell} disabled={saving}>
            {saving ? "Zapisywanie…" : "Sprzedaj voucher"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoucherDetailDialog({ id, canCancel, onClose, onChanged }: { id: string | null; canCancel: boolean; onClose: () => void; onChanged: () => void }) {
  const confirm = useConfirm();
  const { data, mutate } = useSWR<{ ok: boolean; voucher: VoucherDetail }>(id ? `/api/admin/vouchers/${id}` : null, fetcher);
  const v = data?.voucher;
  const [busy, setBusy] = React.useState(false);

  async function cancelVoucher() {
    if (!v) return;
    const ok = await confirm({
      title: "Anulować voucher?",
      message: `Voucher ${v.code} zostanie anulowany. Niewykorzystane saldo (${formatPLNFromGrosze(v.remaining)}) przepada.`,
      destructive: true,
      confirmLabel: "Anuluj voucher",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/vouchers/${v.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cancel: true }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się anulować");
      toast.success("Voucher anulowany");
      await mutate();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={id !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Voucher {v?.code}</DialogTitle>
        </DialogHeader>
        {!v ? (
          <div className="py-6 text-center text-sm text-zinc-500">Ładowanie…</div>
        ) : (
          <div className="space-y-3 text-sm">
            <div>
              <div className="font-medium">{v.title}</div>
              <div className="text-zinc-500">
                <Link href={`/admin/patients/${v.patient.id}`} className="hover:underline">
                  {v.patient.name}
                </Link>
                {v.patient.phone ? ` · ${v.patient.phone}` : ""}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-zinc-500">Kwota</div>
                <div className="font-semibold">{formatPLNFromGrosze(v.amount)}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-zinc-500">Pozostało</div>
                <div className="font-semibold">{formatPLNFromGrosze(v.remaining)}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-zinc-500">Ważny do</div>
                <div className="font-semibold">{fmtDate(v.expiresAt)}</div>
              </div>
            </div>
            <div className="text-xs text-zinc-500">
              Sprzedany {fmtDate(v.createdAt)} ({METHOD_LABELS[v.saleMethod] ?? v.saleMethod}){v.createdBy ? ` · ${v.createdBy}` : ""}
              {v.note ? ` · ${v.note}` : ""}
            </div>
            {v.canceledAt ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                Anulowany {fmtDate(v.canceledAt)}: {v.cancelReason}
              </div>
            ) : null}
            <div>
              <div className="mb-1 font-medium">Wykorzystanie</div>
              {v.usage.length === 0 ? (
                <div className="text-zinc-500">Voucher nie był jeszcze użyty.</div>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {v.usage.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-2 p-2.5">
                      <span>
                        {u.visitAt ? fmtDate(u.visitAt) : fmtDate(u.at)} · {u.serviceName ?? "wizyta"}
                      </span>
                      <span className="flex items-center gap-2">
                        <strong>−{formatPLNFromGrosze(u.amount)}</strong>
                        {u.appointmentId ? (
                          <Link href={`/admin/appointments/${u.appointmentId}`} className="text-xs text-indigo-600 hover:underline">
                            wizyta
                          </Link>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          {v && canCancel && v.status !== "CANCELED" ? (
            <Button variant="destructive" onClick={cancelVoucher} disabled={busy}>
              Anuluj voucher
            </Button>
          ) : (
            <span />
          )}
          <Button variant="outline" onClick={onClose}>
            Zamknij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
