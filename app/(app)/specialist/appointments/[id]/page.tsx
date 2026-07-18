"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPLNFromGrosze } from "@/lib/money";
import { appointmentStatusLabel, effectiveAppointmentStatus } from "@/lib/appointment-status";
import { AppointmentPhotos } from "@/components/appointment-photos";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Etykiety jednostek — jednostkę produktu ustala administrator w karcie produktu
const UNIT_LABELS: Record<string, string> = {
  UNIT: "szt.",
  ML: "ml",
  AMPULE: "ampułka",
  BOTOX_UNIT: "jedn. botox",
};
const unitLabel = (u?: string | null) => (u ? (UNIT_LABELS[u] ?? u) : "—");

// Date -> wartość dla <input type="datetime-local"> w strefie lokalnej
function toLocalInput(d: string | Date | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function SpecialistAppointmentDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, mutate, isLoading } = useSWR(`/api/specialist/appointments/${id}`, fetcher);
  const appt = data?.appointment;

  const [clock, setClock] = useState(() => new Date());
  const [status, setStatus] = useState<string>("SCHEDULED");
  const [note, setNote] = useState<string>("");
  const [startsAt, setStartsAt] = useState<string>("");
  const [endsAt, setEndsAt] = useState<string>("");

  // Po wczytaniu wizyty ustaw w formularzu jej aktualny status
  const loadedStatus = data?.appointment?.status as string | undefined;
  const loadedStartsAt = data?.appointment?.startsAt as string | undefined;
  const loadedApprovalStatus = data?.appointment?.approvalStatus as string | undefined;
  useEffect(() => {
    if (loadedStatus) {
      setStatus(
        loadedApprovalStatus === "REJECTED"
          ? loadedStatus
          : (effectiveAppointmentStatus(loadedStatus, loadedStartsAt) ?? loadedStatus),
      );
    }
  }, [loadedApprovalStatus, loadedStartsAt, loadedStatus]);

  const loadedAppointmentId = data?.appointment?.id as string | undefined;
  useEffect(() => {
    if (!loadedAppointmentId) return;
    setStartsAt(toLocalInput(data.appointment.startsAt));
    setEndsAt(toLocalInput(data.appointment.endsAt));
    setNote(data.appointment.note ?? "");
  }, [data, loadedAppointmentId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextClock = new Date();
      setClock(nextClock);
      setStatus((current) =>
        current === "SCHEDULED" &&
        loadedApprovalStatus !== "REJECTED" &&
        effectiveAppointmentStatus(current, loadedStartsAt, nextClock) === "AWAITING"
          ? "AWAITING"
          : current,
      );
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadedApprovalStatus, loadedStartsAt]);

  if (isLoading) return <div className="p-6 text-sm text-zinc-500">Ładowanie…</div>;
  if (!appt) return <div className="p-6 text-sm text-zinc-500">Nie znaleziono.</div>;

  async function save() {
    if (status === "AWAITING") {
      return toast.error("Wybierz status: Zakończona, Odwołana albo Nieobecność pacjenta.");
    }
    const res = await fetch(`/api/specialist/appointments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status,
        note,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success("Zapisano");
    mutate();
  }

  const paymentsSum = (appt.payments ?? []).reduce((a: number, p: any) => a + (p.amount ?? 0), 0);
  const standardPrice = appt.priceEstimate ?? appt.service?.price ?? null;
  const displayedFinalPrice = appt.priceFinal ?? standardPrice;
  const isStandardPrice =
    displayedFinalPrice !== null && standardPrice !== null && displayedFinalPrice === standardPrice;
  const materialsValue = (appt.consumptions ?? []).reduce((sum: number, consumption: any) => {
    if (consumption.status === "REJECTED" || consumption.product?.salePrice == null) return sum;
    return sum + Number(consumption.quantity) * consumption.product.salePrice;
  }, 0);
  const appointmentIsAwaiting =
    appt.approvalStatus !== "REJECTED" &&
    effectiveAppointmentStatus(appt.status, appt.startsAt, clock) === "AWAITING";
  const startHasPassed = new Date(appt.startsAt).getTime() <= clock.getTime();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Wizyta — szczegóły</h1>

      <Card className="space-y-2 p-4">
        <div className="text-sm text-zinc-500">
          {new Date(appt.startsAt).toLocaleString("pl-PL")} –{" "}
          {new Date(appt.endsAt).toLocaleTimeString("pl-PL", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <div className="font-medium">
          {appt.patient.name} • {appt.customServiceName || appt.service.name}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span>
            Status: {appointmentStatusLabel(appointmentIsAwaiting ? "AWAITING" : appt.status)}
          </span>
          {appt.status === "COMPLETED" && appt.approvalStatus === "PENDING" ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              Oczekuje na akceptację recepcji — nie liczy się jeszcze do rozliczeń
            </span>
          ) : null}
          {appt.status === "COMPLETED" && appt.approvalStatus === "REJECTED" ? (
            <>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-500/10 dark:text-red-300">
                Odrzucona - nie liczy się do rozliczenia
              </span>
              {appt.rejectionReason?.trim() ? (
                <span className="text-xs font-medium text-red-700 dark:text-red-300">
                  Powód: {appt.rejectionReason}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="font-medium">Wykonanie i opis</div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Rozpoczęcie zabiegu</Label>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Zakończenie zabiegu</Label>
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue
                  placeholder={appointmentStatusLabel(appt.status, appt.startsAt, clock)}
                />
              </SelectTrigger>
              <SelectContent>
                {appointmentIsAwaiting ? (
                  <SelectItem value="AWAITING" disabled>
                    Oczekujące — wybierz status końcowy
                  </SelectItem>
                ) : !startHasPassed ? (
                  <SelectItem value="SCHEDULED">Zaplanowana</SelectItem>
                ) : null}
                <SelectItem value="COMPLETED">Zakończona</SelectItem>
                <SelectItem value="CANCELED">Odwołana</SelectItem>
                <SelectItem value="NO_SHOW">Nieobecność pacjenta</SelectItem>
              </SelectContent>
            </Select>
            {appointmentIsAwaiting ? (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Minęła godzina rozpoczęcia. Wybierz status końcowy wizyty.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Cena końcowa</Label>
            <div className="flex h-10 items-center gap-2 rounded-xl border bg-zinc-50 px-3 dark:bg-zinc-900">
              <span className="font-medium">{formatPLNFromGrosze(displayedFinalPrice)}</span>
              {displayedFinalPrice !== null ? (
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-xs font-medium " +
                    (isStandardPrice
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300")
                  }
                >
                  {isStandardPrice ? "Standardowa cena" : "Niestandardowa cena"}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-zinc-500">
              Cena ustawiana przez recepcję lub administratora.
            </p>
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Notatka (opis zabiegu)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <Button onClick={save} disabled={status === "AWAITING"}>
          Zapisz
        </Button>
        <div className="text-xs text-zinc-500">
          Płatności (podgląd): {formatPLNFromGrosze(paymentsSum)}.
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium">Zużycie preparatów</div>
            <div className="text-xs text-zinc-500">
              Podgląd danych wpisanych przez recepcję lub administratora.
            </div>
          </div>
          <div className="rounded-xl bg-zinc-100 px-3 py-2 text-sm dark:bg-zinc-900">
            Wartość materiałów:{" "}
            <span className="font-semibold">{formatPLNFromGrosze(materialsValue)}</span>
          </div>
        </div>
        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          Sugerowane preparaty:
          <div className="mt-2 flex flex-wrap gap-2">
            {(appt.service?.suggestedProducts ?? []).map((sp: any) => (
              <span
                key={sp.id}
                className="rounded-full border bg-zinc-50 px-3 py-1 text-xs dark:bg-zinc-900"
              >
                {sp.product.name} • {sp.quantity} {sp.unit}
              </span>
            ))}
            {(appt.service?.suggestedProducts ?? []).length === 0 && (
              <span className="text-xs text-zinc-500">—</span>
            )}
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Produkt</th>
                <th className="p-3">Magazyn</th>
                <th className="p-3">Ilość</th>
                <th className="p-3">Cena sprzedaży</th>
                <th className="p-3">Wartość</th>
                <th className="p-3">Data</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(appt.consumptions ?? []).length === 0 && (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={7}>
                    Brak zużyć.
                  </td>
                </tr>
              )}
              {(appt.consumptions ?? []).map((c: any) => {
                const rowValue =
                  c.product.salePrice == null ? null : Number(c.quantity) * c.product.salePrice;
                return (
                  <tr key={c.id} className="border-t">
                    <td className="p-3">{c.product.name}</td>
                    <td className="p-3">{c.warehouse?.name ?? "—"}</td>
                    <td className="p-3">
                      {c.quantity}{" "}
                      <span className="text-xs text-zinc-500">{unitLabel(c.product.unit)}</span>
                      {c.suggestedQuantity ? (
                        <div className="mt-1 text-xs text-zinc-500">
                          sugerowano: {c.suggestedQuantity}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3">{formatPLNFromGrosze(c.product.salePrice)}</td>
                    <td className="p-3 font-medium">{formatPLNFromGrosze(rowValue)}</td>
                    <td className="p-3">{new Date(c.createdAt).toLocaleString("pl-PL")}</td>
                    <td className="p-3">
                      {c.status === "PENDING" && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                          Czeka na akceptację admina
                        </span>
                      )}
                      {c.status === "APPLIED" && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                          Zaakceptowano
                        </span>
                      )}
                      {c.status === "REJECTED" && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-500/10 dark:text-red-300">
                          Odrzucono
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AppointmentPhotos
        appointmentId={id}
        photoBefore={appt.photoBefore}
        photoAfter={appt.photoAfter}
        onChanged={() => mutate()}
      />
    </div>
  );
}
