"use client";

import * as React from "react";
import { appointmentStatusLabel } from "@/lib/appointment-status";
import { formatPLNFromGrosze } from "@/lib/money";
import { PatientAppointmentsMobile } from "@/components/patient-appointments-mobile";

type PatientAppointment = {
  id: string;
  startsAt: string;
  serviceName: string;
  specialistName: string;
  status: string;
  price: number | null;
  paid: number;
};

type PatientPurchaseItem = {
  productName: string;
  quantity: string;
  unit: string;
};

type PatientPurchase = {
  id: string;
  createdAt: string;
  items: PatientPurchaseItem[];
  soldByName: string;
  status: string;
  total: number;
  paid: number;
};

const RETAIL_SALE_STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Zrealizowana",
  CANCELED: "Anulowana",
};

function retailSaleStatusLabel(status: string) {
  return RETAIL_SALE_STATUS_LABELS[status] ?? status;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function productSummary(items: PatientPurchaseItem[]) {
  if (items.length === 0) return "—";
  if (items.length === 1) return items[0].productName;
  return `${items[0].productName} +${items.length - 1} więcej`;
}

function PurchasesMobile({ purchases }: { purchases: PatientPurchase[] }) {
  return (
    <div className="space-y-3 p-4 md:hidden">
      {purchases.length === 0 ? (
        <div className="rounded-2xl border bg-white p-5 text-center text-sm text-zinc-500 dark:bg-[#0b1220]">
          Brak zakupów.
        </div>
      ) : null}

      {purchases.map((purchase) => (
        <div
          key={purchase.id}
          className="min-w-0 overflow-hidden rounded-2xl border bg-white p-4 shadow-sm dark:bg-[#0b1220]"
        >
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Produkt
              </div>
              <div className="mt-1 break-words text-base font-semibold leading-6 text-zinc-950 dark:text-zinc-50">
                {productSummary(purchase.items)}
              </div>
            </div>
            <div className="whitespace-nowrap text-right text-xs text-zinc-500 dark:text-zinc-400">
              {formatDateTime(purchase.createdAt)}
            </div>
          </div>

          <div className="mt-3 border-t pt-3">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Kto sprzedał
            </div>
            <div className="mt-1 break-words text-sm text-zinc-700 dark:text-zinc-200">
              {purchase.soldByName}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Status
            </span>
            <span className="text-right text-sm font-medium text-zinc-800 dark:text-zinc-100">
              {retailSaleStatusLabel(purchase.status)}
            </span>
          </div>

          <div className="relative mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-zinc-200 text-sm dark:border-zinc-800">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-zinc-200 dark:bg-zinc-800"
            />
            <div className="min-w-0 p-3">
              <div className="text-xs text-zinc-500">Cena</div>
              <div className="mt-1 break-words font-semibold tabular-nums">
                {formatPLNFromGrosze(purchase.total)}
              </div>
            </div>
            <div className="min-w-0 p-3 text-right">
              <div className="text-xs text-zinc-500">Zapłacono</div>
              <div className="mt-1 break-words font-semibold tabular-nums">
                {purchase.paid ? formatPLNFromGrosze(purchase.paid) : "—"}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PatientHistoryTabs({
  appointments,
  purchases,
}: {
  appointments: PatientAppointment[];
  purchases: PatientPurchase[];
}) {
  const [tab, setTab] = React.useState<"appointments" | "purchases">("appointments");

  return (
    <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setTab("appointments")}
          className={
            "px-4 py-3 text-sm font-medium transition " +
            (tab === "appointments"
              ? "border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-300"
              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200")
          }
        >
          Historia wizyt
        </button>
        <button
          type="button"
          onClick={() => setTab("purchases")}
          className={
            "px-4 py-3 text-sm font-medium transition " +
            (tab === "purchases"
              ? "border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-300"
              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200")
          }
        >
          Zakupy
        </button>
      </div>

      {tab === "appointments" ? (
        <>
          <PatientAppointmentsMobile appointments={appointments} />

          <div className="hidden overflow-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500">
                <tr>
                  <th className="p-3">Data</th>
                  <th className="p-3">Usługa</th>
                  <th className="p-3">Specjalista</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Cena</th>
                  <th className="p-3">Płatności</th>
                </tr>
              </thead>
              <tbody>
                {appointments.length === 0 && (
                  <tr>
                    <td className="p-3 text-zinc-500" colSpan={6}>
                      Brak wizyt.
                    </td>
                  </tr>
                )}
                {appointments.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="p-3">{formatDateTime(a.startsAt)}</td>
                    <td className="p-3">{a.serviceName}</td>
                    <td className="p-3">{a.specialistName}</td>
                    <td className="p-3">{appointmentStatusLabel(a.status)}</td>
                    <td className="p-3">{formatPLNFromGrosze(a.price)}</td>
                    <td className="p-3">{a.paid ? formatPLNFromGrosze(a.paid) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <PurchasesMobile purchases={purchases} />

          <div className="hidden overflow-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500">
                <tr>
                  <th className="p-3">Data</th>
                  <th className="p-3">Produkt</th>
                  <th className="p-3">Kto sprzedał</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Cena</th>
                  <th className="p-3">Płatności</th>
                </tr>
              </thead>
              <tbody>
                {purchases.length === 0 && (
                  <tr>
                    <td className="p-3 text-zinc-500" colSpan={6}>
                      Brak zakupów.
                    </td>
                  </tr>
                )}
                {purchases.map((purchase) => (
                  <tr key={purchase.id} className="border-t">
                    <td className="p-3">{formatDateTime(purchase.createdAt)}</td>
                    <td className="p-3">{productSummary(purchase.items)}</td>
                    <td className="p-3">{purchase.soldByName}</td>
                    <td className="p-3">{retailSaleStatusLabel(purchase.status)}</td>
                    <td className="p-3">{formatPLNFromGrosze(purchase.total)}</td>
                    <td className="p-3">
                      {purchase.paid ? formatPLNFromGrosze(purchase.paid) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
