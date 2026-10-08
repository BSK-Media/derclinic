import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseDateInput, warsawWallTimeToUtc } from "@/lib/warsaw-time";
import { busyRangesForWarsawDay, computeFreeSlots, slotToUtc } from "@/lib/public-booking";
import { maxRedeemablePoints, redeemLoyaltyPoints, discountForPoints } from "@/lib/loyalty";
import { resolvePaymentDue, type PaymentChoice } from "@/lib/booking-payment";
import { logAudit, formatWarsaw, type AuditActor } from "@/lib/audit";
import { heldRanges } from "@/lib/booking-hold-server";

// Rezerwacja online, krok po kroku:
//  1. klient wysyła formularz → sprawdzamy dane i termin, liczymy kwotę do
//     zapłaty i zatrzymujemy termin (BookingHold) — wizyty jeszcze NIE ma,
//  2. klient wybiera metodę płatności, płaci i klika „Dokonałem płatności" →
//     finalizeBooking tworzy wizytę (z kartą pacjenta/kontem) i zgłoszoną płatność.
// Usługi bez ceny nie wymagają płatności — wizyta powstaje od razu (krok 1).

export const RESERVATION_SERVICE_NAME = "__DERCLINIC_REZERWACJA_CZASU__";

/** Dane rezerwacji zapisane w zatrzymaniu terminu (hasło tylko jako hash). */
export type BookingPayload = {
  locationId: string;
  specialistId: string;
  serviceId: string;
  date: string;
  time: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  note: string | null;
  passwordHash: string | null;
  pointsToRedeem: number;
  paymentChoice: PaymentChoice;
  imageConsent: boolean;
  // Faktura na życzenie: dane nabywcy (null = klient nie chce faktury).
  invoice?: { nip: string; companyName: string; address: string | null } | null;
  // Zalogowany pacjent z chwili rezerwacji (wizyta trafia na jego konto).
  patientAuthId: string | null;
};

export function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

// Numer telefonu i e-mail są dopuszczone jako zduplikowane w różnych
// lokalizacjach (patrz komentarz w lib/patient-auth.ts), ale w obrębie jednej
// lokalizacji rezerwacja musi trafić na już istniejące konto zamiast tworzyć
// drugi, osierocony rekord Patient z tymi samymi danymi kontaktowymi.
// Najpierw szukamy po telefonie (silniejszy identyfikator — używany też do
// logowania), a dopiero gdy nic nie znajdziemy, po e-mailu.
async function findExistingPatient(
  tx: Prisma.TransactionClient,
  normalizedPhone: string,
  normalizedEmail: string | null,
  locationId: string,
) {
  const byPhone = await tx.patient.findFirst({
    where: { phone: normalizedPhone, locationId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, email: true, phone: true, passwordHash: true, googleSub: true, facebookId: true },
  });
  if (byPhone) return byPhone;

  if (!normalizedEmail) return null;
  return tx.patient.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" }, locationId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, email: true, phone: true, passwordHash: true, googleSub: true, facebookId: true },
  });
}

/** Sprawdza lokalizację, specjalistę, usługę i datę; zwraca encje albo komunikat błędu. */
export async function resolveBookingEntities(
  payload: Pick<BookingPayload, "locationId" | "specialistId" | "serviceId" | "date">,
) {
  const dateParam = parseDateInput(payload.date);
  if (!dateParam) return { error: "Nieprawidłowa data" as const };

  const [location, specialist, service] = await Promise.all([
    prisma.location.findFirst({ where: { id: payload.locationId, isActive: true }, select: { id: true } }),
    prisma.user.findFirst({
      where: { id: payload.specialistId, role: "SPECIALIST", isVisible: true, locationId: payload.locationId },
      select: {
        id: true,
        name: true,
        workDays: true,
        assignedServices: { select: { serviceId: true } },
      },
    }),
    prisma.service.findFirst({
      where: { id: payload.serviceId, name: { not: RESERVATION_SERVICE_NAME } },
      select: { id: true, name: true, price: true, durationMin: true },
    }),
  ]);

  if (!location) return { error: "Nie znaleziono wybranej lokalizacji" as const };
  if (!specialist) return { error: "Specjalista nie jest dostępny w wybranej lokalizacji" as const };
  if (!service) return { error: "Nie znaleziono wybranej usługi" as const };
  if (!specialist.assignedServices.some((a) => a.serviceId === payload.serviceId)) {
    return { error: "Ten specjalista nie wykonuje wybranej usługi" as const };
  }
  return { location, specialist, service, dateParam };
}

type Entities = Exclude<Awaited<ReturnType<typeof resolveBookingEntities>>, { error: string }>;

/**
 * Ponowna walidacja dostępności terminu — chroni przed dwiema równoczesnymi
 * rezerwacjami tego samego terminu. Zatrzymania terminów innych klientów
 * liczą się jako zajęte (pomijamy własne: exceptHoldId).
 */
export async function assertSlotFree(
  db: Prisma.TransactionClient | typeof prisma,
  entities: Entities,
  payload: Pick<BookingPayload, "specialistId" | "time">,
  options: { now?: Date; exceptHoldId?: string } = {},
) {
  const { dateParam, service, specialist } = entities;
  const now = options.now ?? new Date();
  const dayStart = warsawWallTimeToUtc({ ...dateParam, hour: 0, minute: 0 });
  const dayEnd = warsawWallTimeToUtc({ ...dateParam, hour: 23, minute: 59 });
  const dayStartCheck = new Date(dayStart.getTime() - 4 * 60 * 60 * 1000);
  const dayEndCheck = new Date(dayEnd.getTime() + 4 * 60 * 60 * 1000);

  const [customWorkDays, timeOffs, appointments, holds] = await Promise.all([
    db.specialistCustomWorkDay.findMany({
      where: { specialistId: payload.specialistId, date: { gte: dayStartCheck, lte: dayEndCheck } },
      select: { date: true, startTime: true, endTime: true },
    }),
    db.specialistTimeOff.findMany({
      where: { specialistId: payload.specialistId, date: { gte: dayStartCheck, lte: dayEndCheck } },
      select: { date: true, allDay: true, startTime: true, endTime: true },
    }),
    db.appointment.findMany({
      where: {
        specialistId: payload.specialistId,
        deletedAt: null,
        status: { notIn: ["CANCELED", "NO_SHOW"] },
        startsAt: { lte: dayEndCheck },
        endsAt: { gte: dayStartCheck },
      },
      select: { startsAt: true, endsAt: true },
    }),
    heldRanges([payload.specialistId], dayStartCheck, dayEndCheck, { exceptHoldId: options.exceptHoldId, now }),
  ]);

  const busyRanges = busyRangesForWarsawDay(
    [...appointments, ...holds],
    dateParam.year,
    dateParam.month,
    dateParam.day,
  );
  const freeSlots = computeFreeSlots({
    ...dateParam,
    durationMin: service.durationMin,
    workDays: specialist.workDays,
    customWorkDays,
    timeOffs,
    busyRanges,
    now,
  });

  if (!freeSlots.includes(payload.time)) {
    throw new Error("Ten termin został już zajęty. Wybierz inny.");
  }

  const startsAt = slotToUtc(dateParam.year, dateParam.month, dateParam.day, payload.time);
  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60 * 1000);
  return { startsAt, endsAt };
}

/**
 * Kwota do zapłaty teraz (zaliczka 10% albo pełna przedpłata) po ewentualnym
 * rabacie za punkty. Punkty liczą się tylko dla zalogowanego pacjenta.
 */
export async function computePricing(
  db: Prisma.TransactionClient | typeof prisma,
  payload: Pick<BookingPayload, "patientAuthId" | "pointsToRedeem" | "paymentChoice">,
  service: { price: number | null },
  patientIdForPoints: string | null,
) {
  let pointsApplied = 0;
  if (payload.patientAuthId && patientIdForPoints && payload.pointsToRedeem > 0) {
    const patient = await db.patient.findUnique({ where: { id: patientIdForPoints }, select: { loyaltyPoints: true } });
    pointsApplied = Math.min(payload.pointsToRedeem, maxRedeemablePoints(patient?.loyaltyPoints ?? 0, service.price));
  }
  const loyaltyDiscountAmount = discountForPoints(pointsApplied);
  const priceFinal = Math.max(0, (service.price ?? 0) - loyaltyDiscountAmount);
  const { effectiveChoice, amountDueGrosze } = resolvePaymentDue({
    servicePriceGrosze: service.price,
    amountOwedGrosze: priceFinal,
    choice: payload.paymentChoice,
  });
  return { pointsApplied, loyaltyDiscountAmount, priceFinal, effectiveChoice, amountDueGrosze };
}

export type FinalizePayment = {
  amount: number;
  choice: string;
  reference: string;
  method: string | null;
};

/**
 * Zapisuje wizytę (z kartą pacjenta lub kontem). Przy płatności tworzy od razu
 * ZGŁOSZONĄ płatność (CLAIMED) z tytułem zatrzymania — administrator ją potwierdzi.
 */
export async function finalizeBooking(
  payload: BookingPayload,
  payment: FinalizePayment | null,
  options: { holdId?: string; now?: Date } = {},
) {
  const entities = await resolveBookingEntities(payload);
  if ("error" in entities) throw new Error(entities.error);
  const { service, specialist } = entities;
  const now = options.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const { startsAt, endsAt } = await assertSlotFree(tx, entities, payload, { now, exceptHoldId: options.holdId });

    const normalizedPhone = normalizePhone(payload.phone);
    const patientName = `${payload.firstName} ${payload.lastName}`.replace(/\s+/g, " ").trim();
    const normalizedEmail = payload.email?.trim() || null;
    const passwordHash = payload.passwordHash;
    const { locationId, specialistId, serviceId } = payload;

    const patientAuth = payload.patientAuthId
      ? await tx.patient.findUnique({
          where: { id: payload.patientAuthId },
          select: { id: true, name: true, phone: true },
        })
      : null;

    // Kto rezerwuje: zalogowany pacjent albo gość — zapisujemy to, co sam podał.
    const bookingActor: AuditActor = patientAuth
      ? { type: "PATIENT", id: patientAuth.id, name: patientAuth.name, contact: patientAuth.phone }
      : { type: "GUEST", name: patientName, contact: normalizedPhone };

    let accountCreated = false;
    let bookedAsLoggedIn = false;
    let patientId: string;

    if (patientAuth) {
      // Rezerwacja wykonana przez zalogowanego pacjenta — wizyta trafia
      // wprost na jego konto, bez tworzenia nowego rekordu Patient.
      patientId = patientAuth.id;
      bookedAsLoggedIn = true;
      // Konto założone przez Google nie ma jeszcze telefonu — uzupełniamy go
      // numerem podanym przy rezerwacji.
      const phoneFilled = await tx.patient.updateMany({
        where: { id: patientAuth.id, phone: null },
        data: { phone: normalizedPhone },
      });
      if (phoneFilled.count > 0) {
        await logAudit({
          tx,
          actor: bookingActor,
          action: "UPDATE",
          entity: "Patient",
          entityId: patientAuth.id,
          summary: `Uzupełnienie numeru telefonu pacjenta przy rezerwacji online: ${normalizedPhone}`,
          data: { changes: { phone: { from: null, to: normalizedPhone } } },
        });
      }
      if (normalizedEmail) {
        const filled = await tx.patient.updateMany({
          where: { id: patientAuth.id, email: null },
          data: { email: normalizedEmail },
        });
        if (filled.count > 0) {
          await logAudit({
            tx,
            actor: bookingActor,
            action: "UPDATE",
            entity: "Patient",
            entityId: patientAuth.id,
            summary: `Uzupełnienie adresu e-mail pacjenta przy rezerwacji online: ${normalizedEmail}`,
            data: { changes: { email: { from: null, to: normalizedEmail } } },
          });
        }
      }
    } else {
      const existingPatient = await findExistingPatient(tx, normalizedPhone, normalizedEmail, locationId);

      // Odpowiedź NIE może zdradzać, czy dany telefon/e-mail ma konto
      // (audyt F-12), a osoba niezalogowana nie może ustawić hasła na
      // cudzej, istniejącej karcie pacjenta — inaczej ktoś znający tylko
      // numer telefonu przejąłby historię wizyt tej osoby.
      //  * rezerwacja jako gość trafia na istniejącą kartę (jak w recepcji),
      //    ale bez nadpisywania danych karty, która ma konto,
      //  * "załóż konto" tworzy ZAWSZE nową kartę z hasłem — o ile telefon
      //    ani e-mail nie mają jeszcze konta; wcześniejszą historię gościa
      //    recepcja łączy potem ręcznie (Pacjenci → Duplikaty),
      //  * gdy konto już istnieje, prośba o założenie konta jest po cichu
      //    pomijana, a wizyta zapisuje się normalnie.
      const accountHolder = passwordHash
        ? await tx.patient.findFirst({
            where: {
              // Konto = karta z hasłem albo z logowaniem przez Google lub Facebooka.
              AND: [
                { OR: [{ passwordHash: { not: null } }, { googleSub: { not: null } }, { facebookId: { not: null } }] },
                {
                  OR: [
                    { phone: normalizedPhone },
                    ...(normalizedEmail ? [{ email: { equals: normalizedEmail, mode: "insensitive" as const } }] : []),
                  ],
                },
              ],
            },
            select: { id: true },
          })
        : null;
      const createAccount = Boolean(passwordHash) && !accountHolder;

      if (existingPatient && !createAccount) {
        patientId = existingPatient.id;
        const patientUpdate: { email?: string; phone?: string } = {};
        // Uzupełniamy brakujące dane kontaktowe wyłącznie na karcie bez konta.
        if (!existingPatient.passwordHash && !existingPatient.googleSub && !existingPatient.facebookId) {
          if (normalizedEmail && !existingPatient.email) patientUpdate.email = normalizedEmail;
          if (normalizedPhone && !existingPatient.phone) patientUpdate.phone = normalizedPhone;
        }
        if (Object.keys(patientUpdate).length > 0) {
          await tx.patient.update({ where: { id: existingPatient.id }, data: patientUpdate });
          await logAudit({
            tx,
            actor: bookingActor,
            action: "UPDATE",
            entity: "Patient",
            entityId: existingPatient.id,
            summary: "Uzupełnienie danych kontaktowych istniejącej karty pacjenta przy rezerwacji online",
            data: {
              updatedFields: Object.keys(patientUpdate),
              email: patientUpdate.email ?? undefined,
              phone: patientUpdate.phone ?? undefined,
            },
          });
        }
        if (passwordHash && accountHolder) {
          await logAudit({
            tx,
            actor: bookingActor,
            action: "REGISTER",
            entity: "PatientAccount",
            entityId: accountHolder.id,
            summary: "Prośba o założenie konta przy rezerwacji online pominięta — telefon lub e-mail ma już konto",
            data: { skipped: true, reason: "account_exists" },
          });
        }
      } else {
        const createdPatient = await tx.patient.create({
          data: {
            name: patientName,
            phone: normalizedPhone,
            email: normalizedEmail,
            locationId,
            passwordHash: createAccount ? passwordHash : null,
          },
          select: { id: true },
        });
        patientId = createdPatient.id;
        accountCreated = createAccount;
        await logAudit({
          tx,
          actor: bookingActor,
          action: "CREATE",
          entity: "Patient",
          entityId: createdPatient.id,
          summary: `Nowa karta pacjenta z rezerwacji online: ${patientName} (${normalizedPhone})${
            accountCreated ? " — z założeniem konta" : ""
          }${existingPatient ? " — istnieje wcześniejsza karta gościa do połączenia (Pacjenci → Duplikaty)" : ""}`,
          data: {
            name: patientName,
            phone: normalizedPhone,
            email: normalizedEmail,
            locationId,
            accountCreated,
            previousGuestPatientId: existingPatient?.id ?? undefined,
          },
        });
      }
    }

    // Rabat za punkty lojalnościowe — tylko dla zalogowanego pacjenta (gość
    // nie ma trwałego salda). Saldo walidujemy TU, w transakcji, jako
    // ostateczne źródło prawdy; liczymy PRZED utworzeniem wizyty, żeby zapisać
    // od razu poprawną cenę końcową.
    const pricing = await computePricing(tx, payload, service, patientId);
    const { pointsApplied, loyaltyDiscountAmount, priceFinal } = pricing;
    // Kwota, którą klient faktycznie wpłacił, zostaje taka, jaką widział przy
    // płatności (nawet jeśli saldo punktów w międzyczasie się zmieniło).
    const amountDueGrosze = payment ? payment.amount : pricing.amountDueGrosze;
    const effectiveChoice = payment ? payment.choice : pricing.effectiveChoice;

    const created = await tx.appointment.create({
      data: {
        patientId,
        specialistId,
        locationId,
        serviceId,
        startsAt,
        endsAt,
        priceEstimate: service.price,
        priceFinal,
        note: ["Rezerwacja online (strona WWW)", payload.note?.trim()].filter(Boolean).join(" — "),
        imageConsent: payload.imageConsent,
        invoiceRequested: Boolean(payload.invoice),
        invoiceNip: payload.invoice?.nip ?? null,
        invoiceCompanyName: payload.invoice?.companyName ?? null,
        invoiceAddress: payload.invoice?.address ?? null,
        // Rezerwacja online wymaga podpisanej zgody na zabieg (patrz lib/procedure-consent.ts).
        consentStatus: "NOT_SIGNED",
      },
    });

    let loyaltyPointsUsed = 0;
    if (pointsApplied > 0) {
      await redeemLoyaltyPoints(tx, { patientId, points: pointsApplied, appointmentId: created.id });
      loyaltyPointsUsed = pointsApplied;
    }

    await logAudit({
      tx,
      actor: bookingActor,
      action: "CREATE",
      entity: "Appointment",
      entityId: created.id,
      summary: `Rezerwacja online: ${patientName} · ${service.name} · ${formatWarsaw(startsAt)} · specjalista ${specialist.name}`,
      data: {
        source: "online",
        patientId,
        specialistId,
        serviceId,
        locationId,
        startsAt,
        endsAt,
        priceEstimate: service.price,
        priceFinal,
        loyaltyPointsUsed,
        loyaltyDiscountAmount,
        imageConsent: payload.imageConsent,
        invoiceRequested: Boolean(payload.invoice),
        termsAccepted: true,
        accountCreated,
        bookedAsLoggedIn,
        hasNote: Boolean(payload.note?.trim()),
      },
    });

    // Płatność za wizytę (zaliczka albo pełna przedpłata) powstaje jako
    // ZGŁOSZONA, nie opłacona: klient kliknął „Dokonałem płatności", a
    // administrator ją potwierdza — dopiero wtedy powstaje Payment
    // (patrz lib/payment-request-server.ts).
    let paymentRequestId: string | null = null;
    let reference: string | null = null;
    if (payment && amountDueGrosze > 0) {
      const request = await tx.paymentRequest.create({
        data: {
          appointmentId: created.id,
          amount: amountDueGrosze,
          choice: effectiveChoice,
          reference: payment.reference,
          method: payment.method,
          status: "CLAIMED",
          claimedAt: now,
        },
        select: { id: true },
      });
      paymentRequestId = request.id;
      reference = payment.reference;
      await logAudit({
        tx,
        actor: bookingActor,
        action: "CREATE",
        entity: "PaymentRequest",
        entityId: request.id,
        summary: `Klient zgłosił płatność przy rezerwacji (${effectiveChoice === "FULL" ? "pełna przedpłata" : "zaliczka"}): ${(amountDueGrosze / 100).toFixed(2).replace(".", ",")} zł, tytuł ${payment.reference} — czeka na potwierdzenie`,
        data: { appointmentId: created.id, amount: amountDueGrosze, choice: effectiveChoice, method: payment.method, reference },
      });
    }

    if (options.holdId) {
      await tx.bookingHold.update({ where: { id: options.holdId }, data: { appointmentId: created.id } });
    }

    return {
      ...created,
      loyaltyPointsUsed,
      loyaltyDiscountAmount,
      bookedAsLoggedIn,
      accountCreated,
      paymentChoice: effectiveChoice,
      paymentRequestId,
      reference,
      amountDue: amountDueGrosze,
      amountRemaining: Math.max(0, priceFinal - amountDueGrosze),
    };
  });
}
