import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { parseDateInput, warsawWallTimeToUtc } from "@/lib/warsaw-time";
import { busyRangesForWarsawDay, computeFreeSlots, slotToUtc } from "@/lib/public-booking";
import { getPatientAuth } from "@/lib/patient-auth";
import { maxRedeemablePoints, redeemLoyaltyPoints, discountForPoints } from "@/lib/loyalty";
import { resolvePaymentDue, type PaymentChoice } from "@/lib/booking-payment";
import { logAudit, formatWarsaw, type AuditActor } from "@/lib/audit";
import { validatePassword } from "@/lib/password-policy";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

const RESERVATION_SERVICE_NAME = "__DERCLINIC_REZERWACJA_CZASU__";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function normalizePhone(value: string) {
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
  tx: any,
  normalizedPhone: string,
  normalizedEmail: string | null,
  locationId: string,
) {
  const byPhone = await tx.patient.findFirst({
    where: { phone: normalizedPhone, locationId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, email: true, phone: true, passwordHash: true },
  });
  if (byPhone) return byPhone;

  if (!normalizedEmail) return null;
  return tx.patient.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" }, locationId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, email: true, phone: true, passwordHash: true },
  });
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
};

function describeValidationError(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Uzupełnij poprawnie wszystkie wymagane pola";
  const field = String(issue.path[0] ?? "");
  const label = FIELD_LABELS[field];
  return label ? `${label}: nieprawidłowa wartość` : "Uzupełnij poprawnie wszystkie wymagane pola";
}

export async function POST(req: Request) {
  const ipLimit = await hitRateLimit(RATE_LIMITS.publicBookingIp, await clientIp());
  if (!ipLimit.allowed) {
    return tooManyRequests(ipLimit, "Zbyt wiele rezerwacji z tego urządzenia. Spróbuj później albo zadzwoń do kliniki.");
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad(describeValidationError(parsed.error));

  const {
    locationId,
    specialistId,
    serviceId,
    date,
    time,
    firstName,
    lastName,
    phone,
    email,
    note,
    password,
    pointsToRedeem,
    paymentChoice,
    imageConsent,
  } = parsed.data;

  // Jeśli klient jest zalogowany do panelu pacjenta (ciasteczko sesji), wizytę
  // od razu przypisujemy do jego istniejącego konta — pomijamy wyszukiwanie
  // po telefonie/lokalizacji oraz zakładanie/aktualizowanie hasła.
  const patientAuth = await getPatientAuth();

  if (password && !patientAuth) {
    const passwordIssue = validatePassword(password, {
      name: `${firstName} ${lastName}`,
      email,
      phone,
    });
    if (passwordIssue) return bad(`Hasło: ${passwordIssue}`);
  }

  const dateParam = parseDateInput(date);
  if (!dateParam) return bad("Nieprawidłowa data");

  const [location, specialist, service] = await Promise.all([
    prisma.location.findFirst({ where: { id: locationId, isActive: true }, select: { id: true } }),
    prisma.user.findFirst({
      where: { id: specialistId, role: "SPECIALIST", isVisible: true, locationId },
      select: {
        id: true,
        name: true,
        workDays: true,
        assignedServices: { select: { serviceId: true } },
      },
    }),
    prisma.service.findFirst({
      where: { id: serviceId, name: { not: RESERVATION_SERVICE_NAME } },
      select: { id: true, name: true, price: true, durationMin: true },
    }),
  ]);

  if (!location) return bad("Nie znaleziono wybranej lokalizacji");
  if (!specialist) return bad("Specjalista nie jest dostępny w wybranej lokalizacji");
  if (!service) return bad("Nie znaleziono wybranej usługi");
  if (!specialist.assignedServices.some((a) => a.serviceId === serviceId)) {
    return bad("Ten specjalista nie wykonuje wybranej usługi");
  }

  const now = new Date();

  try {
    const appointment = await prisma.$transaction(async (tx) => {
      // Ponowna walidacja dostępności tuż przed zapisem — chroni przed dwoma
      // równoczesnymi rezerwacjami tego samego terminu.
      const dayStart = warsawWallTimeToUtc({ ...dateParam, hour: 0, minute: 0 });
      const dayEnd = warsawWallTimeToUtc({ ...dateParam, hour: 23, minute: 59 });
      const dayStartCheck = new Date(dayStart.getTime() - 4 * 60 * 60 * 1000);
      const dayEndCheck = new Date(dayEnd.getTime() + 4 * 60 * 60 * 1000);

      const [customWorkDays, timeOffs, appointments] = await Promise.all([
        tx.specialistCustomWorkDay.findMany({
          where: { specialistId, date: { gte: dayStartCheck, lte: dayEndCheck } },
          select: { date: true, startTime: true, endTime: true },
        }),
        tx.specialistTimeOff.findMany({
          where: { specialistId, date: { gte: dayStartCheck, lte: dayEndCheck } },
          select: { date: true, allDay: true, startTime: true, endTime: true },
        }),
        tx.appointment.findMany({
          where: {
            specialistId,
            deletedAt: null,
            status: { notIn: ["CANCELED", "NO_SHOW"] },
            startsAt: { lte: dayEndCheck },
            endsAt: { gte: dayStartCheck },
          },
          select: { startsAt: true, endsAt: true },
        }),
      ]);

      const busyRanges = busyRangesForWarsawDay(appointments, dateParam.year, dateParam.month, dateParam.day);
      const freeSlots = computeFreeSlots({
        ...dateParam,
        durationMin: service.durationMin,
        workDays: specialist.workDays,
        customWorkDays,
        timeOffs,
        busyRanges,
        now,
      });

      if (!freeSlots.includes(time)) {
        throw new Error("Ten termin został już zajęty. Wybierz inny.");
      }

      const startsAt = slotToUtc(dateParam.year, dateParam.month, dateParam.day, time);
      const endsAt = new Date(startsAt.getTime() + service.durationMin * 60 * 1000);

      const normalizedPhone = normalizePhone(phone);
      const patientName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
      const normalizedEmail = email?.trim() || null;
      const passwordHash = password ? await bcrypt.hash(password, 10) : null;

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
                passwordHash: { not: null },
                OR: [
                  { phone: normalizedPhone },
                  ...(normalizedEmail ? [{ email: { equals: normalizedEmail, mode: "insensitive" as const } }] : []),
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
          if (!existingPatient.passwordHash) {
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

      // Rabat za punkty lojalnościowe — tylko dla zalogowanego pacjenta
      // (gość nie ma trwałego salda). Walidujemy saldo TU, wewnątrz
      // transakcji, jako ostateczne, autorytatywne źródło prawdy — nie
      // ufamy samej wartości przysłanej z frontendu poza sprawdzeniem, że
      // mieści się w limicie (saldo pacjenta i cena usługi). Liczymy PRZED
      // utworzeniem wizyty, żeby zapisać od razu poprawną cenę końcową i
      // móc od niej policzyć wymaganą wpłatę.
      let pointsApplied = 0;
      if (patientAuth && pointsToRedeem && pointsToRedeem > 0) {
        const patientForBalance = await tx.patient.findUnique({
          where: { id: patientId },
          select: { loyaltyPoints: true },
        });
        const allowedPoints = maxRedeemablePoints(patientForBalance?.loyaltyPoints ?? 0, service.price);
        pointsApplied = Math.min(pointsToRedeem, allowedPoints);
      }
      const loyaltyDiscountAmount = discountForPoints(pointsApplied);
      const priceFinal = Math.max(0, (service.price ?? 0) - loyaltyDiscountAmount);

      // Płatność przy rezerwacji (zaliczka 10% albo pełna przedpłata) — patrz
      // lib/booking-payment.ts. Serwer jest ostatecznym źródłem prawdy: dla
      // usług powyżej progu wybór klienta jest wymuszany na pełną kwotę.
      const { effectiveChoice, amountDueGrosze } = resolvePaymentDue({
        servicePriceGrosze: service.price,
        amountOwedGrosze: priceFinal,
        choice: paymentChoice as PaymentChoice,
      });

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
          note: ["Rezerwacja online (strona WWW)", note?.trim()].filter(Boolean).join(" — "),
          imageConsent,
        },
      });

      let loyaltyPointsUsed = 0;
      if (pointsApplied > 0) {
        await redeemLoyaltyPoints(tx, { patientId, points: pointsApplied, appointmentId: created.id });
        loyaltyPointsUsed = pointsApplied;
      }

      // DEMO: brak prawdziwej bramki płatności — kliknięcie "Zapłać" na
      // froncie od razu tworzy opłaconą płatność. Docelowo w tym miejscu
      // wizyta trafi w stan oczekiwania na płatność, a Payment powstanie
      // dopiero po potwierdzeniu z bramki (np. webhookiem).
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
          imageConsent,
          accountCreated,
          bookedAsLoggedIn,
          hasNote: Boolean(note?.trim()),
        },
      });

      if (amountDueGrosze > 0) {
        const payment = await tx.payment.create({
          data: { method: "ONLINE", amount: amountDueGrosze, appointmentId: created.id },
        });
        await logAudit({
          tx,
          actor: bookingActor,
          action: "CREATE",
          entity: "Payment",
          entityId: payment.id,
          summary: `Płatność online przy rezerwacji (${effectiveChoice === "FULL" ? "pełna przedpłata" : "zaliczka"}): ${(amountDueGrosze / 100).toFixed(2).replace(".", ",")} zł`,
          data: { appointmentId: created.id, method: "ONLINE", amount: amountDueGrosze, choice: effectiveChoice },
        });
      }

      return {
        ...created,
        loyaltyPointsUsed,
        loyaltyDiscountAmount,
        bookedAsLoggedIn,
        paymentChoice: effectiveChoice,
        amountPaid: amountDueGrosze,
        amountRemaining: Math.max(0, priceFinal - amountDueGrosze),
      };
    });

    return NextResponse.json({
      ok: true,
      appointmentId: appointment.id,
      startsAt: appointment.startsAt,
      bookedAsLoggedIn: appointment.bookedAsLoggedIn,
      loyaltyPointsUsed: appointment.loyaltyPointsUsed,
      loyaltyDiscountAmount: appointment.loyaltyDiscountAmount,
      priceFinal: appointment.priceFinal,
      paymentChoice: appointment.paymentChoice,
      amountPaid: appointment.amountPaid,
      amountRemaining: appointment.amountRemaining,
    });
  } catch (e: any) {
    return bad(typeof e?.message === "string" ? e.message : "Nie udało się zapisać wizyty", 409);
  }
}
