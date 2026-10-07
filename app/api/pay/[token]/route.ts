import { NextResponse } from "next/server";
import { appointmentForPaymentToken, availableMethods, getPaymentSettings } from "@/lib/payment-request-server";
import { PAYMENT_METHOD_LABELS, formatAccount, formatPhone } from "@/lib/payment-request";

// Stan płatności za wizytę dla linku z tokenem (strona /platnosc/<token>):
// kwota, tytuł płatności, wybrana metoda oraz dane do przelewu / BLIK-a.
export async function GET(_req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const appointment = await appointmentForPaymentToken(decodeURIComponent(params.token));
  if (!appointment) return NextResponse.json({ ok: false, message: "Nieprawidłowy link" }, { status: 404 });

  const settings = await getPaymentSettings();
  const methods = availableMethods(settings);
  const request = appointment.request;

  return NextResponse.json({
    ok: true,
    appointment: {
      serviceName: appointment.customServiceName || appointment.service.name,
      specialistName: appointment.specialist.name,
      startsAt: appointment.startsAt,
      canceled: appointment.status === "CANCELED",
    },
    request: request
      ? {
          status: request.status,
          amount: request.amount,
          choice: request.choice,
          method: request.method,
          reference: request.reference,
          rejectionReason: request.rejectionReason,
        }
      : null,
    methods: (["P24", "BLIK", "TRANSFER"] as const).map((key) => ({
      key,
      label: PAYMENT_METHOD_LABELS[key],
      available: methods[key],
      comingSoon: key === "P24",
    })),
    details: {
      transfer: methods.TRANSFER
        ? {
            recipientName: settings.recipientName,
            bankName: settings.bankName,
            account: formatAccount(settings.bankAccount ?? ""),
            accountRaw: settings.bankAccount,
          }
        : null,
      blik: methods.BLIK ? { phone: formatPhone(settings.blikPhone ?? ""), phoneRaw: settings.blikPhone } : null,
      note: settings.note,
    },
  });
}
