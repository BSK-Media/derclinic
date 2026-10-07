import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { holdIdFromToken } from "@/lib/booking-hold";
import { consentToken } from "@/lib/consent-link";
import { appBaseUrl, notifyAppointmentBooked } from "@/lib/email-notifications";
import { finalizeBooking, type BookingPayload } from "@/lib/online-booking";
import { notifyPaymentClaimedById } from "@/lib/payment-request-server";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

// „Dokonałem płatności”: dopiero teraz powstaje wizyta (rezerwacja) wraz ze
// zgłoszoną płatnością czekającą na potwierdzenie administratora. Wywołanie
// jest idempotentne — ponowne kliknięcie zwraca tę samą wizytę.
export async function POST(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const id = holdIdFromToken(decodeURIComponent(params.token));
  if (!id) return bad("Nieprawidłowy link", 404);

  const limit = await hitRateLimit(RATE_LIMITS.paymentActionIp, await clientIp());
  if (!limit.allowed) return tooManyRequests(limit);

  const hold = await prisma.bookingHold.findUnique({ where: { id } });
  if (!hold) return bad("Nie znaleziono rezerwacji", 404);
  const payload = hold.payload as unknown as BookingPayload;

  // Już zamieniona w wizytę (np. podwójne kliknięcie) — zwracamy tę samą.
  if (hold.appointmentId) {
    const existing = await prisma.appointment.findUnique({
      where: { id: hold.appointmentId },
      select: { id: true, startsAt: true, priceFinal: true, loyaltyPointsUsed: true, loyaltyDiscountAmount: true },
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        appointmentId: existing.id,
        consentToken: consentToken(existing.id),
        startsAt: existing.startsAt,
        bookedAsLoggedIn: Boolean(payload.patientAuthId),
        loyaltyPointsUsed: existing.loyaltyPointsUsed ?? 0,
        loyaltyDiscountAmount: existing.loyaltyDiscountAmount ?? 0,
        priceFinal: existing.priceFinal,
        paymentChoice: hold.choice,
        amountDue: hold.amount,
        amountRemaining: Math.max(0, (existing.priceFinal ?? 0) - hold.amount),
      });
    }
  }

  if (!hold.method) return bad("Najpierw wybierz metodę płatności.", 409);

  try {
    const appointment = await finalizeBooking(
      payload,
      { amount: hold.amount, choice: hold.choice, reference: hold.reference, method: hold.method },
      { holdId: hold.id },
    );

    // Potwierdzenie dla klienta i powiadomienia dla personelu — po wysłaniu odpowiedzi.
    const baseUrl = appBaseUrl(req);
    after(async () => {
      await notifyAppointmentBooked(appointment.id, { source: "online", baseUrl });
      if (appointment.paymentRequestId) await notifyPaymentClaimedById(appointment.paymentRequestId);
    });

    return NextResponse.json({
      ok: true,
      appointmentId: appointment.id,
      // Link do pobrania zgody i wgrania podpisanego pliku (działa także dla gościa bez konta).
      consentToken: consentToken(appointment.id),
      startsAt: appointment.startsAt,
      bookedAsLoggedIn: appointment.bookedAsLoggedIn,
      loyaltyPointsUsed: appointment.loyaltyPointsUsed,
      loyaltyDiscountAmount: appointment.loyaltyDiscountAmount,
      priceFinal: appointment.priceFinal,
      paymentChoice: appointment.paymentChoice,
      amountDue: appointment.amountDue,
      amountRemaining: appointment.amountRemaining,
    });
  } catch (e: any) {
    const message = typeof e?.message === "string" ? e.message : "Nie udało się zapisać rezerwacji";
    // Termin zajęty po wygaśnięciu zatrzymania — klient mógł już zapłacić, więc kierujemy do kliniki.
    return bad(
      message.includes("zajęty")
        ? "Ten termin został w międzyczasie zajęty. Jeśli już zapłacił(a)ś, skontaktuj się z kliniką — zwrócimy wpłatę albo ustalimy inny termin."
        : message,
      409,
    );
  }
}
