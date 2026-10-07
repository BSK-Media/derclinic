import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { holdIdFromToken } from "@/lib/booking-hold";
import { availableMethods, getPaymentSettings } from "@/lib/payment-request-server";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

const BodySchema = z.object({ method: z.enum(["BLIK", "TRANSFER", "P24"]) });

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

// Wybór metody płatności przy rezerwacji (przed kliknięciem „Dokonałem płatności”).
export async function POST(req: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const id = holdIdFromToken(decodeURIComponent(params.token));
  if (!id) return bad("Nieprawidłowy link", 404);

  const limit = await hitRateLimit(RATE_LIMITS.paymentActionIp, await clientIp());
  if (!limit.allowed) return tooManyRequests(limit);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Niepoprawna metoda płatności");

  const hold = await prisma.bookingHold.findUnique({ where: { id }, select: { appointmentId: true } });
  if (!hold) return bad("Nie znaleziono rezerwacji", 404);
  if (hold.appointmentId) return bad("Ta płatność została już zgłoszona.", 409);

  if (!availableMethods(await getPaymentSettings())[parsed.data.method]) {
    return bad(parsed.data.method === "P24" ? "Przelewy24 będą dostępne wkrótce." : "Ta metoda płatności jest niedostępna.", 409);
  }

  await prisma.bookingHold.update({ where: { id }, data: { method: parsed.data.method } });
  return NextResponse.json({ ok: true });
}
