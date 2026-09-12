import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { parseDateInput, warsawWallTimeToUtc } from "@/lib/warsaw-time";
import { busyRangesForWarsawDay, computeFreeSlots, slotToUtc } from "@/lib/public-booking";
import { getPatientAuth } from "@/lib/patient-auth";
import { maxRedeemablePoints, redeemLoyaltyPoints } from "@/lib/loyalty";

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
  password: z.string().min(6).max(100).optional(),
  // Punkty lojalnościowe do wykorzystania jako rabat — tylko dla zalogowanych
  // pacjentów (patrz walidacja niżej). 1 pkt = 1 zł.
  pointsToRedeem: z.number().int().min(0).max(100000).optional(),
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
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad(describeValidationError(parsed.error));

  const { locationId, specialistId, serviceId, date, time, firstName, lastName, phone, email, note, password, pointsToRedeem } =
    parsed.data;

  // Jeśli klient jest zalogowany do panelu pacjenta (ciasteczko sesji), wizytę
  // od razu przypisujemy do jego istniejącego konta — pomijamy wyszukiwanie
  // po telefonie/lokalizacji oraz zakładanie/aktualizowanie hasła.
  const patientAuth = await getPatientAuth();

  const dateParam = parseDateInput(date);
  if (!dateParam) return bad("Nieprawidłowa data");

  const [location, specialist, service] = await Promise.all([
    prisma.location.findFirst({ where: { id: locationId, isActive: true }, select: { id: true } }),
    prisma.user.findFirst({
      where: { id: specialistId, role: "SPECIALIST", isVisible: true, locationId },
      select: {
        id: true,
        workDays: true,
        assignedServices: { select: { serviceId: true } },
      },
    }),
    prisma.service.findFirst({
      where: { id: serviceId, name: { not: RESERVATION_SERVICE_NAME } },
      select: { id: true, price: true, durationMin: true },
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

      let accountCreated = false;
      let alreadyHasAccount = false;
      let bookedAsLoggedIn = false;
      let patientId: string;

      if (patientAuth) {
        // Rezerwacja wykonana przez zalogowanego pacjenta — wizyta trafia
        // wprost na jego konto, bez tworzenia nowego rekordu Patient.
        patientId = patientAuth.id;
        alreadyHasAccount = true;
        bookedAsLoggedIn = true;
        if (normalizedEmail) {
          await tx.patient.updateMany({
            where: { id: patientAuth.id, email: null },
            data: { email: normalizedEmail },
          });
        }
      } else {
        const existingPatient = await findExistingPatient(tx, normalizedPhone, normalizedEmail, locationId);

        // Telefon albo e-mail ma już przypisane konto z hasłem — rezerwacja
        // nie może przejść ani jako gość, ani jako rejestracja na te same
        // dane; osoba musi się zalogować, żeby dokończyć rezerwację na
        // właściwym koncie. Sprawdzane też tutaj (nie tylko na froncie), bo
        // to jest ostateczne, autorytatywne miejsce walidacji.
        if (existingPatient?.passwordHash) {
          throw new Error(
            "Ten numer telefonu lub adres e-mail ma już założone konto. Zaloguj się, aby dokończyć rezerwację.",
          );
        }

        if (existingPatient) {
          patientId = existingPatient.id;
          const patientUpdate: { email?: string; phone?: string; passwordHash?: string } = {};
          if (normalizedEmail && !existingPatient.email) patientUpdate.email = normalizedEmail;
          // Uzupełniamy telefon tylko, gdy pacjent trafiony po e-mailu nie miał
          // go jeszcze zapisanego — nie nadpisujemy istniejącego numeru innym.
          if (normalizedPhone && !existingPatient.phone) patientUpdate.phone = normalizedPhone;
          if (passwordHash) {
            patientUpdate.passwordHash = passwordHash;
            accountCreated = true;
          }
          if (Object.keys(patientUpdate).length > 0) {
            await tx.patient.update({ where: { id: existingPatient.id }, data: patientUpdate });
          }
        } else {
          const createdPatient = await tx.patient.create({
            data: {
              name: patientName,
              phone: normalizedPhone,
              email: normalizedEmail,
              locationId,
              passwordHash,
            },
            select: { id: true },
          });
          patientId = createdPatient.id;
          accountCreated = Boolean(passwordHash);
        }
      }

      const created = await tx.appointment.create({
        data: {
          patientId,
          specialistId,
          locationId,
          serviceId,
          startsAt,
          endsAt,
          priceEstimate: service.price,
          priceFinal: service.price,
          note: ["Rezerwacja online (strona WWW)", note?.trim()].filter(Boolean).join(" — "),
        },
      });

      // Rabat za punkty lojalnościowe — tylko dla zalogowanego pacjenta
      // (gość nie ma trwałego salda). Walidujemy saldo TU, wewnątrz
      // transakcji, jako ostateczne, autorytatywne źródło prawdy — nie
      // ufamy samej wartości przysłanej z frontendu poza sprawdzeniem, że
      // mieści się w limicie (saldo pacjenta i cena usługi).
      let loyaltyPointsUsed = 0;
      let loyaltyDiscountAmount = 0;
      if (patientAuth && pointsToRedeem && pointsToRedeem > 0) {
        const patientForBalance = await tx.patient.findUnique({
          where: { id: patientId },
          select: { loyaltyPoints: true },
        });
        const allowedPoints = maxRedeemablePoints(patientForBalance?.loyaltyPoints ?? 0, service.price);
        const pointsApplied = Math.min(pointsToRedeem, allowedPoints);
        if (pointsApplied > 0) {
          const { discountAmount } = await redeemLoyaltyPoints(tx, {
            patientId,
            points: pointsApplied,
            appointmentId: created.id,
          });
          loyaltyPointsUsed = pointsApplied;
          loyaltyDiscountAmount = discountAmount;
          await tx.appointment.update({
            where: { id: created.id },
            data: {
              loyaltyPointsUsed,
              loyaltyDiscountAmount,
              priceFinal: Math.max(0, (service.price ?? 0) - discountAmount),
            },
          });
        }
      }

      return {
        ...created,
        loyaltyPointsUsed,
        loyaltyDiscountAmount,
        priceFinal: loyaltyDiscountAmount > 0 ? Math.max(0, (service.price ?? 0) - loyaltyDiscountAmount) : created.priceFinal,
        accountCreated,
        alreadyHasAccount,
        bookedAsLoggedIn,
      };
    });

    return NextResponse.json({
      ok: true,
      appointmentId: appointment.id,
      startsAt: appointment.startsAt,
      accountCreated: appointment.accountCreated,
      alreadyHasAccount: appointment.alreadyHasAccount,
      bookedAsLoggedIn: appointment.bookedAsLoggedIn,
      loyaltyPointsUsed: appointment.loyaltyPointsUsed,
      loyaltyDiscountAmount: appointment.loyaltyDiscountAmount,
      priceFinal: appointment.priceFinal,
    });
  } catch (e: any) {
    return bad(typeof e?.message === "string" ? e.message : "Nie udało się zapisać wizyty", 409);
  }
}
