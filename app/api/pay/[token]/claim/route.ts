import { NextResponse } from "next/server";
import { appointmentForPaymentToken, claimPayment } from "@/lib/payment-request-server";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

// „Dokonałem płatności”: płatność przechodzi w stan „oczekuje na potwierdzenie”,
// a administrator dostaje powiadomienie. Nic nie jest uznawane za opłacone,
// dopóki administrator nie potwierdzi wpłaty.
export async function POST(_req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const appointment = await appointmentForPaymentToken(decodeURIComponent(params.token));
  if (!appointment) return NextResponse.json({ ok: false, message: "Nieprawidłowy link" }, { status: 404 });

  const limit = await hitRateLimit(RATE_LIMITS.paymentActionIp, await clientIp());
  if (!limit.allowed) return tooManyRequests(limit);

  if (appointment.status === "CANCELED") {
    return NextResponse.json({ ok: false, message: "Ta rezerwacja została anulowana." }, { status: 409 });
  }
  const result = await claimPayment(appointment);
  if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: 409 });
  return NextResponse.json({ ok: true });
}
