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
import { formatPLNFromGrosze, parsePLNToGrosze } from "@/lib/money";
import { appointmentStatusLabel, effectiveAppointmentStatus } from "@/lib/appointment-status";
import { ApprovalBadge, RejectReasonDialog } from "@/components/appointment-approval";
import { AppointmentPhotos } from "@/components/appointment-photos";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const UNIT_LABELS: Record<string, string> = {
  UNIT: "szt.",
  ML: "ml",
  MG: "mg",
  G: "g",
  AMPULE: "ampułka",
  BOTOX_UNIT: "jedn. botox",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Gotówka",
  CARD: "Karta",
  VOUCHER: "Voucher",
};

export default function AdminAppointmentDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, mutate, isLoading } = useSWR(`/api/admin/appointments/${id}`, fetcher);
  const appt = data?.appointment;

  const [clock, setClock] = useState(() => new Date());
  const [status, setStatus] = useState<string>("SCHEDULED");
  const [priceFinal, setPriceFinal] = useState<string>("");
  const [priceEstimate, setPriceEstimate] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [productId, setProductId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [qty, setQty] = useState<string>("1");
  const [consumptionEdits, setConsumptionEdits] = useState<Record<string, string>>({});
  const [consumptionSavingId, setConsumptionSavingId] = useState<string | null>(null);

  const [payMethod, setPayMethod] = useState<string>("CARD");
  const [payAmount, setPayAmount] = useState<string>("");
  // Edycja / usuwanie pojedynczej zapisanej płatności
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editingPaymentAmount, setEditingPaymentAmount] = useState<string>("");
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);

  const [decidingApproval, setDecidingApproval] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  async function decideApproval(action: "APPROVE" | "REJECT", reason?: string) {
    setDecidingApproval(true);
    try {
      const res = await fetch(`/api/admin/appointments/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się zapisać decyzji");
        return false;
      }
      toast.success(action === "APPROVE" ? "Wizyta zaakceptowana" : "Wizyta odrzucona");
      mutate();
      return true;
    } finally {
      setDecidingApproval(false);
    }
  }

  async function confirmReject(reason: string) {
    const ok = await decideApproval("REJECT", reason);
    if (ok) setRejectOpen(false);
  }

  useEffect(() => {
    if (appt?.status) {
      setStatus(
        appt.approvalStatus === "REJECTED"
          ? appt.status
          : (effectiveAppointmentStatus(appt.status, appt.startsAt) ?? appt.status),
      );
    }
  }, [appt?.approvalStatus, appt?.startsAt, appt?.status]);

  useEffect(() => {
    if (!appt?.id) return;
    const standardPrice = appt.priceEstimate ?? appt.service?.price ?? null;
    const finalPrice = appt.priceFinal ?? standardPrice;
    setPriceEstimate(standardPrice === null ? "" : String(standardPrice / 100));
    setPriceFinal(finalPrice === null ? "" : String(finalPrice / 100));
    setNote(appt.note ?? "");
  }, [appt?.id, appt?.note, appt?.priceEstimate, appt?.priceFinal, appt?.service?.price]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextClock = new Date();
      setClock(nextClock);
      setStatus((current) =>
        current === "SCHEDULED" &&
        appt?.approvalStatus !== "REJECTED" &&
        effectiveAppointmentStatus(current, appt?.startsAt, nextClock) === "AWAITING"
          ? "AWAITING"
          : current,
      );
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [appt?.approvalStatus, appt?.startsAt]);

  if (isLoading) return <div className="p-6 text-sm text-zinc-500">Ładowanie…</div>;
  if (!appt) return <div className="p-6 text-sm text-zinc-500">Nie znaleziono.</div>;

  async function save() {
    if (status === "AWAITING") {
      return toast.error("Wybierz status: Zakończona, Odwołana albo Nieobecność pacjenta.");
    }
    const res = await fetch(`/api/admin/appointments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status,
        priceFinal: priceFinal ? parsePLNToGrosze(priceFinal) : null,
        priceEstimate: priceEstimate ? parsePLNToGrosze(priceEstimate) : null,
        note,
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success("Zapisano");
    mutate();
  }

  async function addConsumption() {
    const q = Number(qty.replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) return toast.error("Niepoprawna ilość");
    const res = await fetch(`/api/admin/appointments/${id}/consume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId, warehouseId, quantity: q, kind: "APPOINTMENT" }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success("Dodano zużycie");
    setQty("1");
    mutate();
  }

  async function updateConsumption(consumptionId: string) {
    const quantity = Number((consumptionEdits[consumptionId] ?? "").replace(",", "."));
    if (!Number.isFinite(quantity) || quantity <= 0) return toast.error("Niepoprawna ilość");
    setConsumptionSavingId(consumptionId);
    try {
      const res = await fetch(`/api/admin/appointments/${id}/consume`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consumptionId, quantity }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Zapisano ilość i skorygowano stan magazynu");
      setConsumptionEdits((current) => {
        const next = { ...current };
        delete next[consumptionId];
        return next;
      });
      mutate();
    } finally {
      setConsumptionSavingId(null);
    }
  }

  async function deleteConsumption(consumptionId: string) {
    if (!window.confirm("Usunąć to zużycie? Ilość wróci na stan magazynu.")) return;
    setConsumptionSavingId(consumptionId);
    try {
      const res = await fetch(
        `/api/admin/appointments/${id}/consume?consumptionId=${encodeURIComponent(consumptionId)}`,
        { method: "DELETE" },
      );
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
      toast.success("Usunięto zużycie i zwrócono ilość na magazyn");
      mutate();
    } finally {
      setConsumptionSavingId(null);
    }
  }

  async function reviewAdjustment(consumptionId: string, action: "approve" | "reject") {
    const res = await fetch(`/api/admin/consumption-adjustments/${consumptionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success(action === "approve" ? "Zaakceptowano zmianę ilości" : "Odrzucono zmianę ilości");
    mutate();
  }

  async function addPayment() {
    const amount = parsePLNToGrosze(payAmount);
    if (!amount || amount <= 0) return toast.error("Niepoprawna kwota");
    if (amount > paymentLimitForSelectedMethod) {
      return toast.error(
        `Kwota przekracza należność dostępną dla tej metody o ${formatPLNFromGrosze(amount - paymentLimitForSelectedMethod)}.`,
      );
    }
    const res = await fetch(`/api/admin/appointments/${id}/pay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: payMethod, amount }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Błąd");
    toast.success(out.replaced ? "Zaktualizowano płatność" : "Dodano płatność");
    setPayAmount("");
    mutate();
  }

  function startEditPayment(p: any) {
    setEditingPaymentId(p.id);
    setEditingPaymentAmount((p.amount / 100).toFixed(2).replace(".", ","));
  }

  function cancelEditPayment() {
    setEditingPaymentId(null);
    setEditingPaymentAmount("");
  }

  async function saveEditedPayment(paymentId: string) {
    const amount = parsePLNToGrosze(editingPaymentAmount);
    if (!amount || amount <= 0) return toast.error("Niepoprawna kwota");
    setPaymentBusyId(paymentId);
    try {
      const res = await fetch(`/api/admin/appointments/${id}/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zmienić kwoty");
      toast.success("Zmieniono kwotę płatności");
      cancelEditPayment();
      mutate();
    } finally {
      setPaymentBusyId(null);
    }
  }

  async function deletePayment(p: any) {
    const label = `${PAYMENT_METHOD_LABELS[p.method] ?? p.method} • ${formatPLNFromGrosze(p.amount)}`;
    if (!window.confirm(`Czy na pewno usunąć płatność: ${label}?`)) return;
    setPaymentBusyId(p.id);
    try {
      const res = await fetch(`/api/admin/appointments/${id}/payments/${p.id}`, {
        method: "DELETE",
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się usunąć płatności");
      toast.success("Usunięto płatność");
      if (editingPaymentId === p.id) cancelEditPayment();
      mutate();
    } finally {
      setPaymentBusyId(null);
    }
  }

  const products = data?.products ?? [];
  const warehouses = data?.warehouses ?? [];
  const selectedProduct = products.find((product: any) => product.id === productId);
  const canEditStandardPrice = data?.viewerRole === "ADMIN";

  const paymentsSum = (appt.payments ?? []).reduce((a: number, p: any) => a + (p.amount ?? 0), 0);
  const paymentTotal = appt.priceFinal ?? appt.service?.price ?? appt.priceEstimate ?? 0;
  const paymentBalance = paymentTotal - paymentsSum;
  const paymentRemaining = Math.max(0, paymentBalance);
  const paymentOverpaid = Math.max(0, -paymentBalance);
  const selectedMethodAmount = (appt.payments ?? [])
    .filter((payment: any) => payment.method === payMethod)
    .reduce((sum: number, payment: any) => sum + (payment.amount ?? 0), 0);
  const paymentLimitForSelectedMethod = paymentRemaining + selectedMethodAmount;
  const enteredPaymentAmount = payAmount.trim() ? parsePLNToGrosze(payAmount) : null;
  const balanceAfterEnteredPayment =
    enteredPaymentAmount && enteredPaymentAmount > 0
      ? paymentLimitForSelectedMethod - enteredPaymentAmount
      : null;
  const appointmentIsAwaiting =
    appt.approvalStatus !== "REJECTED" &&
    effectiveAppointmentStatus(appt.status, appt.startsAt, clock) === "AWAITING";
  const startHasPassed = new Date(appt.startsAt).getTime() <= clock.getTime();
  const enteredStandardPrice = priceEstimate ? parsePLNToGrosze(priceEstimate) : null;
  const enteredFinalPrice = priceFinal ? parsePLNToGrosze(priceFinal) : null;
  const isStandardPrice =
    enteredStandardPrice !== null &&
    enteredFinalPrice !== null &&
    enteredStandardPrice === enteredFinalPrice;

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
        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          Specjalista: {appt.specialist.name} • Status:{" "}
          {appointmentStatusLabel(appointmentIsAwaiting ? "AWAITING" : appt.status)}
        </div>
      </Card>

      {appt.status === "COMPLETED" ? (
        <>
          <Card className="space-y-3 p-4">
            <div className="font-medium">Akceptacja wizyty</div>
            <div className="flex flex-wrap items-center gap-3">
              <ApprovalBadge status={appt.approvalStatus} reason={appt.rejectionReason} />
              {appt.approvalStatus === "PENDING" ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => decideApproval("APPROVE")}
                    disabled={decidingApproval}
                  >
                    {decidingApproval ? "…" : "✓ Zaakceptuj"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
                    onClick={() => setRejectOpen(true)}
                    disabled={decidingApproval}
                  >
                    ✕ Odrzuć
                  </Button>
                </div>
              ) : null}
            </div>
            {appt.approvalStatus === "PENDING" ? (
              <div className="text-xs text-zinc-500">
                Zakończona wizyta czeka na decyzję recepcji lub administratora. Do statystyk i
                rozliczeń liczą się tylko wizyty zaakceptowane.
              </div>
            ) : null}
            {appt.approvalStatus === "REJECTED" && appt.rejectionReason ? (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
                Powód odrzucenia: {appt.rejectionReason}
              </div>
            ) : null}
          </Card>

          <RejectReasonDialog
            open={rejectOpen}
            onOpenChange={setRejectOpen}
            onConfirm={confirmReject}
            saving={decidingApproval}
            contextLabel={`${new Date(appt.startsAt).toLocaleString("pl-PL", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })} • ${appt.patient.name} • ${appt.customServiceName || appt.service.name}`}
          />
        </>
      ) : null}

      <Card className="space-y-4 p-4">
        <div className="font-medium">Status i rozliczenie wizyty</div>
        <div className="grid gap-3 md:grid-cols-4">
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
          </div>
          <div className="space-y-2">
            <Label>Cena orientacyjna (PLN)</Label>
            <Input
              value={priceEstimate}
              onChange={(e) => setPriceEstimate(e.target.value)}
              disabled={!canEditStandardPrice}
            />
            {!canEditStandardPrice ? (
              <p className="text-xs text-zinc-500">Cena standardowa ustawiona w karcie zabiegu.</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Cena końcowa (PLN)</Label>
              {enteredFinalPrice !== null && enteredStandardPrice !== null ? (
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
            <Input value={priceFinal} onChange={(e) => setPriceFinal(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-4">
            <Label>Notatka</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <Button onClick={save} disabled={status === "AWAITING"}>
          Zapisz
        </Button>
        <div className="text-xs text-zinc-500">
          Płatności: {formatPLNFromGrosze(paymentsSum)} • Pozostało do zapłaty:{" "}
          {formatPLNFromGrosze(paymentRemaining)}
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="font-medium">Zużycie preparatów (magazyn)</div>

        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          Sugerowane preparaty dla tej usługi:
          <div className="mt-2 flex flex-wrap gap-2">
            {(appt.service?.suggestedProducts ?? []).map((sp: any) => (
              <span
                key={sp.id}
                className="rounded-full border bg-zinc-50 px-3 py-1 text-xs dark:bg-zinc-900"
              >
                {sp.product.name} • {sp.quantity} {UNIT_LABELS[sp.product.unit] ?? sp.product.unit}
              </span>
            ))}
            {(appt.service?.suggestedProducts ?? []).length === 0 && (
              <span className="text-xs text-zinc-500">—</span>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <div className="space-y-2">
            <Label>Produkt</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Magazyn</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Ilość</Label>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Jednostka</Label>
            <Select value={selectedProduct?.unit} disabled>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz produkt" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(UNIT_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end space-y-2">
            <Button onClick={addConsumption} disabled={!productId || !warehouseId}>
              Dodaj zużycie
            </Button>
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
                <th className="p-3">Autor</th>
                <th className="p-3">Data</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(appt.consumptions ?? []).length === 0 && (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={9}>
                    Brak zużyć.
                  </td>
                </tr>
              )}
              {(appt.consumptions ?? []).map((c: any) => {
                const currentQuantity = String(c.quantity);
                const editedQuantity = consumptionEdits[c.id] ?? currentQuantity;
                const rowValue =
                  c.product.salePrice == null ? null : Number(c.quantity) * c.product.salePrice;
                const busy = consumptionSavingId === c.id;
                return (
                  <tr key={c.id} className="border-t">
                    <td className="p-3">{c.product.name}</td>
                    <td className="p-3">{c.warehouse?.name ?? "—"}</td>
                    <td className="p-3">
                      <Input
                        className="w-24"
                        value={editedQuantity}
                        onChange={(event) =>
                          setConsumptionEdits((current) => ({
                            ...current,
                            [c.id]: event.target.value,
                          }))
                        }
                      />
                      <span className="mt-1 block text-xs text-zinc-500">
                        {UNIT_LABELS[c.product.unit] ?? c.product.unit}
                      </span>
                      {c.suggestedQuantity ? (
                        <span className="mt-1 block text-xs text-zinc-500">
                          (sugerowano: {c.suggestedQuantity})
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3">{formatPLNFromGrosze(c.product.salePrice)}</td>
                    <td className="p-3 font-medium">{formatPLNFromGrosze(rowValue)}</td>
                    <td className="p-3">{c.createdBy?.name ?? "—"}</td>
                    <td className="p-3">{new Date(c.createdAt).toLocaleString("pl-PL")}</td>
                    <td className="p-3">
                      {c.status === "PENDING" && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                          Do akceptacji
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
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        {c.status === "PENDING" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => reviewAdjustment(c.id, "approve")}
                            >
                              Zaakceptuj
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => reviewAdjustment(c.id, "reject")}
                            >
                              Odrzuć
                            </Button>
                          </>
                        ) : null}
                        <Button
                          size="sm"
                          onClick={() => updateConsumption(c.id)}
                          disabled={busy || editedQuantity === currentQuantity}
                        >
                          {busy ? "..." : "Zapisz"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          onClick={() => deleteConsumption(c.id)}
                          disabled={busy}
                        >
                          Usuń
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium">Płatności</div>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
            {appt.priceFinal != null ? "Według ceny końcowej" : "Według ceny usługi"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs font-medium text-zinc-500">Do zapłaty</div>
            <div className="mt-1 text-xl font-semibold">{formatPLNFromGrosze(paymentTotal)}</div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs font-medium text-zinc-500">Opłacono</div>
            <div className="mt-1 text-xl font-semibold text-emerald-700 dark:text-emerald-300">
              {formatPLNFromGrosze(paymentsSum)}
            </div>
          </div>
          <div
            className={
              "rounded-2xl border p-4 " +
              (paymentRemaining > 0
                ? "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
                : "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10")
            }
          >
            <div className="text-xs font-medium text-zinc-500">Pozostało</div>
            <div
              className={
                "mt-1 text-xl font-semibold " +
                (paymentRemaining > 0
                  ? "text-amber-800 dark:text-amber-300"
                  : "text-emerald-700 dark:text-emerald-300")
              }
            >
              {formatPLNFromGrosze(paymentRemaining)}
            </div>
          </div>
        </div>

        {paymentOverpaid > 0 ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            Nadpłata: {formatPLNFromGrosze(paymentOverpaid)}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Metoda</Label>
            <Select value={payMethod} onValueChange={setPayMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Gotówka</SelectItem>
                <SelectItem value="CARD">Karta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Kwota (PLN)</Label>
            <Input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          </div>
          <div className="flex items-end space-y-2">
            <Button
              onClick={addPayment}
              disabled={
                paymentLimitForSelectedMethod <= 0 ||
                !enteredPaymentAmount ||
                enteredPaymentAmount <= 0 ||
                enteredPaymentAmount > paymentLimitForSelectedMethod
              }
            >
              Dodaj płatność
            </Button>
          </div>
        </div>

        {balanceAfterEnteredPayment === null ? (
          paymentRemaining <= 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              Wizyta jest opłacona w całości.
            </div>
          ) : (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
            {selectedMethodAmount > 0 ? (
              <>
                Dla metody {PAYMENT_METHOD_LABELS[payMethod] ?? payMethod} zapisano obecnie{" "}
                {formatPLNFromGrosze(selectedMethodAmount)}. Nowa kwota zastąpi tę wartość.
              </>
            ) : (
              <>
                Do rozliczenia pozostało {formatPLNFromGrosze(paymentRemaining)}. Możesz dodać płatność częściową.
              </>
            )}
          </div>
          )
        ) : balanceAfterEnteredPayment > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            Po dodaniu tej płatności pozostanie {formatPLNFromGrosze(balanceAfterEnteredPayment)} do zapłaty.
          </div>
        ) : balanceAfterEnteredPayment === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            Ta płatność rozliczy wizytę w całości.
          </div>
        ) : (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            Kwota przekracza pozostałą należność o {formatPLNFromGrosze(Math.abs(balanceAfterEnteredPayment))}.
          </div>
        )}

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Metoda</th>
                <th className="p-3">Kwota</th>
                <th className="p-3 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {(appt.payments ?? []).length === 0 && (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={4}>
                    Brak płatności.
                  </td>
                </tr>
              )}
              {(appt.payments ?? []).map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">{new Date(p.createdAt).toLocaleString("pl-PL")}</td>
                  <td className="p-3">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
                  <td className="p-3">
                    {editingPaymentId === p.id ? (
                      <Input
                        value={editingPaymentAmount}
                        onChange={(e) => setEditingPaymentAmount(e.target.value)}
                        className="h-8 w-28"
                        autoFocus
                      />
                    ) : (
                      formatPLNFromGrosze(p.amount)
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2">
                      {editingPaymentId === p.id ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() => saveEditedPayment(p.id)}
                            disabled={paymentBusyId === p.id}
                          >
                            {paymentBusyId === p.id ? "…" : "Zapisz"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEditPayment}
                            disabled={paymentBusyId === p.id}
                          >
                            Anuluj
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEditPayment(p)}
                            disabled={paymentBusyId !== null}
                          >
                            Zmień kwotę
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
                            onClick={() => deletePayment(p)}
                            disabled={paymentBusyId !== null}
                          >
                            {paymentBusyId === p.id ? "…" : "Usuń"}
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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
