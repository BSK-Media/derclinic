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

type PackageRow = {
  id: string;
  code: string;
  title: string;
  serviceName: string | null;
  sessionsTotal: number;
  sessionsLeft: number;
  price: number;
  expiresAt: string | null;
  createdAt: string;
  saleMethod: string;
  status: BenefitStatus;
  patient: { id: string; name: string; phone: string | null };
};
type PackageDetail = PackageRow & {
  createdBy: string | null;
  note: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  usage: { id: string; sessions: number; at: string; appointmentId: string | null; visitAt: string | null; serviceName: string | null }[];
};
type Template = {
  id: string;
  name: string;
  description: string | null;
  serviceId: string | null;
  serviceName: string | null;
  sessions: number;
  price: number;
  validityDays: number | null;
  isActive: boolean;
};
type ServiceOption = { id: string; name: string };

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
const selectClass = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950";
const toInput = (grosze: number) => (grosze / 100).toFixed(2).replace(".", ",");

export default function PackagesPage() {
  const { user } = useAuth();
  const canManageCatalog = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [tab, setTab] = React.useState<"sold" | "catalog">("sold");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Pakiety zabiegów</h1>
        <p className="text-sm text-zinc-500">
          Sprzedaż pakietów (np. 10 zabiegów Icoone 2 obszary) i rozliczanie nimi wizyt. Pozostałe zabiegi widać tu i na karcie pacjenta.
        </p>
      </div>
      <div className="flex gap-2">
        {(
          [
            ["sold", "Sprzedane pakiety"],
            ["catalog", "Katalog pakietów"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium",
              tab === key ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white text-zinc-600 dark:bg-[#0b1220] dark:text-zinc-300",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "sold" ? <SoldTab canCancel={canManageCatalog} /> : <CatalogTab canEdit={canManageCatalog} />}
    </div>
  );
}

function SoldTab({ canCancel }: { canCancel: boolean }) {
  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [status, setStatus] = React.useState("ALL");
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

  const { data, mutate, isLoading } = useSWR(`/api/admin/packages?q=${encodeURIComponent(debouncedQ)}&status=${status}&page=${page}&pageSize=25`, fetcher, {
    keepPreviousData: true,
  });
  const rows: PackageRow[] = data?.packages ?? [];
  const summary = data?.summary as { activeCount: number; sessionsLeft: number; soldTotal: number } | undefined;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setSellOpen(true)}>+ Sprzedaj pakiet</Button>
      </div>
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs text-zinc-500">Aktywne pakiety</div>
            <div className="mt-1 text-2xl font-semibold">{summary.activeCount}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500">Zabiegi do wykorzystania</div>
            <div className="mt-1 text-2xl font-semibold">{summary.sessionsLeft}</div>
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
                <th className="p-2">Pakiet</th>
                <th className="p-2 text-right">Zabiegi</th>
                <th className="p-2">Ważny do</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="cursor-pointer border-t hover:bg-zinc-50 dark:hover:bg-zinc-900" onClick={() => setDetailId(p.id)}>
                  <td className="p-2 font-mono text-xs">{p.code}</td>
                  <td className="p-2">
                    <div className="font-medium">{p.patient.name}</div>
                    <div className="text-xs text-zinc-500">{p.patient.phone ?? ""}</div>
                  </td>
                  <td className="p-2">
                    <div>{p.title}</div>
                    {p.serviceName ? <div className="text-xs text-zinc-500">{p.serviceName}</div> : null}
                  </td>
                  <td className="p-2 text-right font-semibold">
                    {p.sessionsLeft} / {p.sessionsTotal}
                  </td>
                  <td className="p-2">{fmtDate(p.expiresAt)}</td>
                  <td className="p-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[p.status])}>{BENEFIT_STATUS_LABELS[p.status]}</span>
                  </td>
                </tr>
              ))}
              {!isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-zinc-500">
                    Brak pakietów.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>{data?.total ?? 0} pakietów</span>
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

      <SellPackageDialog
        open={sellOpen}
        onOpenChange={setSellOpen}
        onSold={(code) => {
          toast.success(`Sprzedano pakiet ${code}`);
          void mutate();
        }}
      />
      <PackageDetailDialog id={detailId} canCancel={canCancel} onClose={() => setDetailId(null)} onChanged={() => void mutate()} />
    </div>
  );
}

function SellPackageDialog({ open, onOpenChange, onSold }: { open: boolean; onOpenChange: (open: boolean) => void; onSold: (code: string) => void }) {
  const { data } = useSWR<{ ok: boolean; templates: Template[]; services: ServiceOption[] }>(open ? "/api/admin/packages/templates" : null, fetcher);
  const templates = React.useMemo(() => (data?.templates ?? []).filter((t) => t.isActive), [data]);
  const services = data?.services ?? [];

  const [patientId, setPatientId] = React.useState("");
  const [pickerKey, setPickerKey] = React.useState(0);
  const [templateId, setTemplateId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [sessions, setSessions] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [serviceId, setServiceId] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [saleMethod, setSaleMethod] = React.useState("CARD");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setTitle(t.name);
    setSessions(String(t.sessions));
    setPrice(toInput(t.price));
    setServiceId(t.serviceId ?? "");
    if (t.validityDays) {
      const date = new Date(Date.now() + t.validityDays * 24 * 3600 * 1000);
      setExpiresAt(date.toISOString().slice(0, 10));
    } else setExpiresAt("");
  }

  function reset() {
    setPatientId("");
    setPickerKey((k) => k + 1);
    setTemplateId("");
    setTitle("");
    setSessions("");
    setPrice("");
    setServiceId("");
    setExpiresAt("");
    setSaleMethod("CARD");
    setNote("");
  }

  async function sell() {
    const grosze = parsePLNToGrosze(price);
    const count = Number(sessions);
    if (!patientId) return toast.error("Wybierz pacjenta");
    if (title.trim().length < 2) return toast.error("Podaj tytuł pakietu");
    if (!Number.isInteger(count) || count < 1) return toast.error("Podaj liczbę zabiegów");
    if (grosze === null || grosze < 0) return toast.error("Podaj cenę pakietu");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          patientId,
          templateId: templateId || null,
          title: title.trim(),
          sessions: count,
          price: grosze,
          serviceId: serviceId || null,
          expiresAt: expiresAt || null,
          saleMethod,
          note: note.trim() || null,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się sprzedać pakietu");
      onSold(out.package.code);
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
          <DialogTitle>Sprzedaż pakietu</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label>Pacjent (imię, nazwisko lub telefon)</Label>
            <PatientPicker key={pickerKey} value={patientId} onChange={setPatientId} allowNew={false} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-template">Pakiet z katalogu (lub wpisz własny poniżej)</Label>
            <select id="p-template" value={templateId} onChange={(e) => chooseTemplate(e.target.value)} className={selectClass}>
              <option value="">— własny pakiet —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.sessions} zabiegów · {formatPLNFromGrosze(t.price)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-title">Tytuł</Label>
            <Input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. 10 zabiegów Icoone 2 obszary" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="p-sessions">Liczba zabiegów</Label>
              <Input id="p-sessions" inputMode="numeric" value={sessions} onChange={(e) => setSessions(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-price">Cena pakietu (zł)</Label>
              <Input id="p-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-service">Usługa (do jakiej wizyty pasuje pakiet)</Label>
            <select id="p-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={selectClass}>
              <option value="">dowolna usługa</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="p-exp">Termin ważności</Label>
              <Input id="p-exp" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-method">Jak klient płaci za pakiet</Label>
              <select id="p-method" value={saleMethod} onChange={(e) => setSaleMethod(e.target.value)} className={selectClass}>
                {Object.entries(METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-note">Notatka (opcjonalnie)</Label>
            <Input id="p-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={sell} disabled={saving}>
            {saving ? "Zapisywanie…" : "Sprzedaj pakiet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PackageDetailDialog({ id, canCancel, onClose, onChanged }: { id: string | null; canCancel: boolean; onClose: () => void; onChanged: () => void }) {
  const confirm = useConfirm();
  const { data, mutate } = useSWR<{ ok: boolean; package: PackageDetail }>(id ? `/api/admin/packages/${id}` : null, fetcher);
  const p = data?.package;
  const [busy, setBusy] = React.useState(false);

  async function cancelPackage() {
    if (!p) return;
    const ok = await confirm({
      title: "Anulować pakiet?",
      message: `Pakiet ${p.code} zostanie anulowany. Niewykorzystane zabiegi (${p.sessionsLeft}) przepadają.`,
      destructive: true,
      confirmLabel: "Anuluj pakiet",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/packages/${p.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cancel: true }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się anulować");
      toast.success("Pakiet anulowany");
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
          <DialogTitle>Pakiet {p?.code}</DialogTitle>
        </DialogHeader>
        {!p ? (
          <div className="py-6 text-center text-sm text-zinc-500">Ładowanie…</div>
        ) : (
          <div className="space-y-3 text-sm">
            <div>
              <div className="font-medium">{p.title}</div>
              <div className="text-zinc-500">
                <Link href={`/admin/patients/${p.patient.id}`} className="hover:underline">
                  {p.patient.name}
                </Link>
                {p.patient.phone ? ` · ${p.patient.phone}` : ""}
                {p.serviceName ? ` · ${p.serviceName}` : ""}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-zinc-500">Zabiegi</div>
                <div className="font-semibold">
                  {p.sessionsLeft} / {p.sessionsTotal}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-zinc-500">Cena</div>
                <div className="font-semibold">{formatPLNFromGrosze(p.price)}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-zinc-500">Ważny do</div>
                <div className="font-semibold">{fmtDate(p.expiresAt)}</div>
              </div>
            </div>
            <div className="text-xs text-zinc-500">
              Sprzedany {fmtDate(p.createdAt)} ({METHOD_LABELS[p.saleMethod] ?? p.saleMethod}){p.createdBy ? ` · ${p.createdBy}` : ""}
              {p.note ? ` · ${p.note}` : ""}
            </div>
            {p.canceledAt ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                Anulowany {fmtDate(p.canceledAt)}: {p.cancelReason}
              </div>
            ) : null}
            <div>
              <div className="mb-1 font-medium">Wykorzystanie</div>
              {p.usage.length === 0 ? (
                <div className="text-zinc-500">Żaden zabieg nie został jeszcze rozliczony.</div>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {p.usage.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-2 p-2.5">
                      <span>
                        {u.visitAt ? fmtDate(u.visitAt) : fmtDate(u.at)} · {u.serviceName ?? "wizyta"}
                      </span>
                      <span className="flex items-center gap-2">
                        <strong>−{u.sessions}</strong>
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
          {p && canCancel && p.status !== "CANCELED" ? (
            <Button variant="destructive" onClick={cancelPackage} disabled={busy}>
              Anuluj pakiet
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

function CatalogTab({ canEdit }: { canEdit: boolean }) {
  const { data, mutate } = useSWR<{ ok: boolean; templates: Template[]; services: ServiceOption[] }>("/api/admin/packages/templates", fetcher);
  const templates = data?.templates ?? [];
  const [editing, setEditing] = React.useState<Template | "new" | null>(null);

  return (
    <div className="space-y-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={() => setEditing("new")}>+ Nowy pakiet w katalogu</Button>
        </div>
      ) : null}
      <Card className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="p-2">Pakiet</th>
                <th className="p-2">Usługa</th>
                <th className="p-2 text-right">Zabiegi</th>
                <th className="p-2 text-right">Cena</th>
                <th className="p-2">Ważność</th>
                <th className="p-2">Status</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="p-2">
                    <div className="font-medium">{t.name}</div>
                    {t.description ? <div className="text-xs text-zinc-500">{t.description}</div> : null}
                  </td>
                  <td className="p-2">{t.serviceName ?? "dowolna"}</td>
                  <td className="p-2 text-right">{t.sessions}</td>
                  <td className="p-2 text-right">{formatPLNFromGrosze(t.price)}</td>
                  <td className="p-2">{t.validityDays ? `${t.validityDays} dni` : "bez terminu"}</td>
                  <td className="p-2">{t.isActive ? "Aktywny" : "Wyłączony"}</td>
                  <td className="p-2 text-right">
                    {canEdit ? (
                      <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                        Edytuj
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-zinc-500">
                    Katalog jest pusty. Dodaj pierwszy pakiet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      <TemplateDialog
        editing={editing}
        services={data?.services ?? []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void mutate();
        }}
      />
    </div>
  );
}

function TemplateDialog({ editing, services, onClose, onSaved }: { editing: Template | "new" | null; services: ServiceOption[]; onClose: () => void; onSaved: () => void }) {
  const current = editing && editing !== "new" ? editing : null;
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{current ? "Edycja pakietu" : "Nowy pakiet w katalogu"}</DialogTitle>
        </DialogHeader>
        {editing ? <TemplateForm key={current?.id ?? "new"} template={current} services={services} onClose={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function TemplateForm({ template, services, onClose, onSaved }: { template: Template | null; services: ServiceOption[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = React.useState(template?.name ?? "");
  const [description, setDescription] = React.useState(template?.description ?? "");
  const [serviceId, setServiceId] = React.useState(template?.serviceId ?? "");
  const [sessions, setSessions] = React.useState(template ? String(template.sessions) : "");
  const [price, setPrice] = React.useState(template ? toInput(template.price) : "");
  const [validityDays, setValidityDays] = React.useState(template?.validityDays ? String(template.validityDays) : "");
  const [isActive, setIsActive] = React.useState(template?.isActive ?? true);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    const grosze = parsePLNToGrosze(price);
    const count = Number(sessions);
    if (name.trim().length < 2) return toast.error("Podaj nazwę pakietu");
    if (!Number.isInteger(count) || count < 1) return toast.error("Podaj liczbę zabiegów");
    if (grosze === null || grosze < 0) return toast.error("Podaj cenę pakietu");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/packages/templates", {
        method: template ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(template ? { id: template.id } : {}),
          name: name.trim(),
          description: description.trim() || null,
          serviceId: serviceId || null,
          sessions: count,
          price: grosze,
          validityDays: validityDays ? Number(validityDays) : null,
          isActive,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać pakietu");
      toast.success("Zapisano pakiet w katalogu");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <div className="space-y-1">
          <Label htmlFor="t-name">Nazwa</Label>
          <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="np. 10 zabiegów Icoone 2 obszary" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-desc">Opis (opcjonalnie)</Label>
          <Input id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-service">Usługa, którą rozlicza się pakietem</Label>
          <select id="t-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={selectClass}>
            <option value="">dowolna usługa</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="t-sessions">Liczba zabiegów</Label>
            <Input id="t-sessions" inputMode="numeric" value={sessions} onChange={(e) => setSessions(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-price">Cena (zł)</Label>
            <Input id="t-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-days">Ważność (dni)</Label>
            <Input id="t-days" inputMode="numeric" value={validityDays} onChange={(e) => setValidityDays(e.target.value.replace(/\D/g, ""))} placeholder="bez terminu" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Aktywny (można go sprzedawać)
        </label>
        <p className="text-xs text-zinc-500">Zmiana pakietu w katalogu nie wpływa na pakiety już sprzedane.</p>
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose}>
          Anuluj
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Zapisywanie…" : "Zapisz"}
        </Button>
      </DialogFooter>
    </>
  );
}
