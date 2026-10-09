import { NextResponse, after } from "next/server";
import { normalizeNip } from "@/lib/vat";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { appBaseUrl, notifyAppointmentBooked } from "@/lib/email-notifications";
import { getPatientAuth } from "@/lib/patient-auth";
import { validatePassword } from "@/lib/password-policy";
import { consentToken } from "@/lib/consent-link";
import { generatePaymentReference } from "@/lib/payment-request";
import { BOOKING_HOLD_MINUTES, holdToken } from "@/lib/booking-hold";
import { purgeExpiredHolds } from "@/lib/booking-hold-server";
import {
  assertSlotFree,
  computePricing,
  finalizeBooking,
  normalizePhone,
  resolveBookingEntities,
  type BookingPayload,
} from "@/lib/online-booking";
import { botGuardRejects, botRejectedResponse } from "@/lib/bot-guard";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const BodySchema = z.object({
  locationId: z.string().min(1),
  specialistId: z.string().min(1),
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().regex(/^\+48\d{9}$/, "Podaj prawidłowy 9-cyfrowy numer telefonu"),
  email: z.string().trim().min(1, "E-mail jest wymagany").email().max(200),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  // Podane tylko, gdy klient wybrał "Zarejestruj się" zamiast kontynuacji jako gość.
  password: z.string().min(1).max(500).optional(),
  // Punkty lojalnościowe do wykorzystania jako rabat — tylko dla zalogowanych
  // pacjentów (patrz walidacja niżej). 1 pkt = 1 zł.
  pointsToRedeem: z.number().int().min(0).max(100000).optional(),
  // Zaliczka 10% albo pełna przedpłata — patrz lib/booking-payment.ts. Dla
  // usług powyżej progu pełnej przedpłaty wartość jest i tak wymuszana na
  // "FULL" po stronie serwera, niezależnie od tego, co przyśle klient.
  paymentChoice: z.enum(["DEPOSIT_10", "FULL"]),
  // Zgoda na wizerunek (zdjęcia przed/po) — opcjonalna, dotyczy tylko tej
  // jednej wizyty (patrz Appointment.imageConsent w schema.prisma).
  imageConsent: z.boolean().optional().default(false),
  // Faktura na życzenie: NIP (z cyfrą kontrolną) i nazwa firmy są wtedy obowiązkowe.
  invoiceRequested: z.boolean().optional().default(false),
  invoiceNip: z.string().trim().max(30).optional().or(z.literal("")),
  invoiceCompanyName: z.string().trim().max(200).optional().or(z.literal("")),
  invoiceAddress: z.string().trim().max(300).optional().or(z.literal("")),
  // Obowiązkowa akceptacja regulaminu — bez niej rezerwacja nie powstaje.
  termsAccepted: z.literal(true),
});

const FIELD_LABELS: Record<string, string> = {
  firstName: "Imię",
  lastName: "Nazwisko",
  phone: "Numer telefonu",
  email: "Adres e-mail",
  password: "Hasło",
  note: "Uwagi",
  date: "Data",
  time: "Godzina",
  locationId: "Lokalizacja",
  specialistId: "Specjalista",
  serviceId: "Zabieg",
  invoiceNip: "NIP",
  invoiceCompanyName: "Nazwa firmy",
  invoiceAddress: "Adres firmy",
};

function describeValidationError(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Uzupełnij poprawnie wszystkie wymagane pola";
  const field = String(issue.path[0] ?? "");
  if (field === "termsAccepted") return "Aby zarezerwować wizytę, zaakceptuj regulamin.";
  const label = FIELD_LABELS[field];
  return label ? `${label}: nieprawidłowa wartość` : "Uzupełnij poprawnie wszystkie wymagane pola";
}

// Rezerwacja online. Wizyta NIE powstaje od razu: po sprawdzeniu danych i
// terminu zatrzymujemy termin na czas płatności (BookingHold) i zwracamy token
// do ekranu płatności. Wizytę tworzy dopiero /api/hold/[token]/claim, gdy
// klient kliknie "Dokonałem płatności". Usługa bez ceny nie wymaga płatności —
// wizyta powstaje od razu.
export async function POST(req: Request) {
  const ipLimit = await hitRateLimit(RATE_LIMITS.publicBookingIp, await clientIp());
  if (!ipLimit.allowed) {
    return tooManyRequests(ipLimit, "Zbyt wiele rezerwacji z tego urządzenia. Spróbuj później albo zadzwoń do kliniki.");
  }

  const json = await req.json().catch(() => null);
  if (botGuardRejects(json)) return botRejectedResponse();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad(describeValidationError(parsed.error));
  const body = parsed.data;

  // Jeśli klient jest zalogowany do panelu pacjenta (ciasteczko sesji), wizytę
  // przypisujemy do jego istniejącego konta — bez zakładania hasła.
  const patientAuth = await getPatientAuth();

  if (body.password && !patientAuth) {
    const passwordIssue = validatePassword(body.password, {
      name: `${body.firstName} ${body.lastName}`,
      email: body.email,
      phone: body.phone,
    });
    if (passwordIssue) return bad(`Hasło: ${passwordIssue}`);
  }

  // Faktura na życzenie: walidacja NIP i nazwy firmy.
  let invoiceData: BookingPayload["invoice"] = null;
  if (body.invoiceRequested) {
    const nip = normalizeNip(body.invoiceNip ?? "");
    if (!nip) return bad("NIP: nieprawidłowy numer (10 cyfr z poprawną cyfrą kontrolną).");
    if ((body.invoiceCompanyName ?? "").length < 2) return bad("Nazwa firmy: podaj nazwę do faktury.");
    invoiceData = { nip, companyName: body.invoiceCompanyName!, address: body.invoiceAddress || null };
  }

  const payload: BookingPayload = {
    locationId: body.locationId,
    specialistId: body.specialistId,
    serviceId: body.serviceId,
    date: body.date,
    time: body.time,
    firstName: body.firstName,
    lastName: body.lastName,
    phone: normalizePhone(body.phone),
    email: body.email,
    note: body.note?.trim() || null,
    passwordHash: body.password && !patientAuth ? await bcrypt.hash(body.password, 10) : null,
    pointsToRedeem: body.pointsToRedeem ?? 0,
    paymentChoice: body.paymentChoice,
    imageConsent: body.imageConsent,
    invoice: invoiceData,
    patientAuthId: patientAuth?.id ?? null,
  };

  const entities = await resolveBookingEntities(payload);
  if ("error" in entities) return bad(String(entities.error));

  try {
    const now = new Date();
    const { startsAt, endsAt } = await assertSlotFree(prisma, entities, payload, { now });
    const pricing = await computePricing(prisma, payload, entities.service, patientAuth?.id ?? null);

    const baseUrl = appBaseUrl(req);

    // Bez opłaty (usługa bez ceny): wizyta od razu, jak dotąd.
    if (pricing.amountDueGrosze <= 0) {
      const appointment = await finalizeBooking(payload, null, { now });
      after(() => notifyAppointmentBooked(appointment.id, { source: "online", baseUrl }));
      return NextResponse.json({
        ok: true,
        hold: false,
        appointmentId: appointment.id,
        consentToken: consentToken(appointment.id),
        startsAt: appointment.startsAt,
        bookedAsLoggedIn: appointment.bookedAsLoggedIn,
        loyaltyPointsUsed: appointment.loyaltyPointsUsed,
        loyaltyDiscountAmount: appointment.loyaltyDiscountAmount,
        priceFinal: appointment.priceFinal,
        paymentChoice: appointment.paymentChoice,
        amountDue: 0,
        amountRemaining: appointment.amountRemaining,
      });
    }

    // Tytuł płatności (ten sam kod klient wpisze w przelewie, a administrator zobaczy w panelu).
    let reference = generatePaymentReference();
    for (
      let i = 0;
      i < 5 &&
      ((await prisma.paymentRequest.findUnique({ where: { reference }, select: { id: true } })) ||
        (await prisma.bookingHold.findUnique({ where: { reference }, select: { id: true } })));
      i++
    ) {
      reference = generatePaymentReference();
    }

    const hold = await prisma.bookingHold.create({
      data: {
        expiresAt: new Date(now.getTime() + BOOKING_HOLD_MINUTES * 60 * 1000),
        specialistId: payload.specialistId,
        startsAt,
        endsAt,
        payload: payload as unknown as object,
        amount: pricing.amountDueGrosze,
        choice: pricing.effectiveChoice,
        reference,
      },
      select: { id: true, expiresAt: true },
    });
    void purgeExpiredHolds();

    return NextResponse.json({
      ok: true,
      hold: true,
      holdToken: holdToken(hold.id),
      holdExpiresAt: hold.expiresAt,
      holdMinutes: BOOKING_HOLD_MINUTES,
      startsAt,
      amountDue: pricing.amountDueGrosze,
      paymentChoice: pricing.effectiveChoice,
      amountRemaining: Math.max(0, pricing.priceFinal - pricing.amountDueGrosze),
      loyaltyPointsUsed: pricing.pointsApplied,
      loyaltyDiscountAmount: pricing.loyaltyDiscountAmount,
    });
  } catch (e: any) {
    return bad(typeof e?.message === "string" ? e.message : "Nie udało się zapisać wizyty", 409);
  }
}
