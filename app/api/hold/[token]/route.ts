import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { holdIdFromToken } from "@/lib/booking-hold";
import { availableMethods, getPaymentSettings } from "@/lib/payment-request-server";
import { PAYMENT_METHOD_LABELS, formatAccount, formatPhone } from "@/lib/payment-request";
import type { BookingPayload } from "@/lib/online-booking";

// Ekran płatności przy rezerwacji online: wizyty jeszcze nie ma — jest tylko
// zatrzymanie terminu (BookingHold). Odpowiedź ma ten sam kształt co
// /api/pay/[token], żeby korzystał z niej ten sam panel płatności.
export async function GET(_req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const id = holdIdFromToken(decodeURIComponent(params.token));
  if (!id) return NextResponse.json({ ok: false, message: "Nieprawidłowy link" }, { status: 404 });
  const hold = await prisma.bookingHold.findUnique({ where: { id } });
  if (!hold) return NextResponse.json({ ok: false, message: "Nie znaleziono rezerwacji" }, { status: 404 });

  const payload = hold.payload as unknown as BookingPayload;
  const [service, specialist, settings] = await Promise.all([
    prisma.service.findUnique({ where: { id: payload.serviceId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: payload.specialistId }, select: { name: true } }),
    getPaymentSettings(),
  ]);
  const methods = availableMethods(settings);
  const converted = Boolean(hold.appointmentId);

  return NextResponse.json({
    ok: true,
    hold: { expiresAt: hold.expiresAt, expired: !converted && hold.expiresAt.getTime() < Date.now(), converted },
    appointment: {
      serviceName: service?.name ?? "Zabieg",
      specialistName: specialist?.name ?? "",
      startsAt: hold.startsAt,
      canceled: false,
    },
    request: {
      status: converted ? "CLAIMED" : "AWAITING",
      amount: hold.amount,
      choice: hold.choice,
      method: hold.method,
      reference: hold.reference,
      rejectionReason: null,
    },
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
