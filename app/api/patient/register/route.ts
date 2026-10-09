import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { validatePassword } from "@/lib/password-policy";
import { botGuardRejects, botRejectedResponse } from "@/lib/bot-guard";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

function bad(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

const GENERIC_MESSAGE =
  "Jeśli ten numer telefonu nie miał jeszcze konta, zostało założone. Zaloguj się numerem telefonu i hasłem.";

const BodySchema = z.object({
  firstName: z.string().trim().min(1, "Podaj imię").max(100),
  lastName: z.string().trim().min(1, "Podaj nazwisko").max(100),
  phone: z.string().trim().regex(/^\+48\d{9}$/, "Podaj prawidłowy 9-cyfrowy numer telefonu"),
  email: z.string().trim().min(1, "Podaj adres e-mail").email("Niepoprawny adres e-mail").max(200),
  password: z.string().min(1, "Podaj hasło").max(500),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  if (botGuardRejects(json)) return botRejectedResponse();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Uzupełnij poprawnie wszystkie pola");

  const ipLimit = await hitRateLimit(RATE_LIMITS.patientRegisterIp, await clientIp());
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);

  const { firstName, lastName, password } = parsed.data;
  // Już zwalidowane wyżej regexem do dokładnie "+48" + 9 cyfr — nie normalizujemy
  // ponownie, bo naiwne dodanie "+48" do wartości, która już je ma, dawało
  // podwójny prefiks (np. "+4848XXXXXXXXX") i uniemożliwiało późniejsze logowanie.
  const phone = parsed.data.phone;
  const email = parsed.data.email.trim();
  const name = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();

  const passwordIssue = validatePassword(password, { name, email, phone });
  if (passwordIssue) return bad(passwordIssue);

  // Hash liczymy zawsze, także gdy konto już istnieje — czas odpowiedzi nie
  // może zdradzać, czy dany numer jest pacjentem kliniki (audyt F-12).
  const passwordHash = await bcrypt.hash(password, 10);

  const existingAccount = await prisma.patient.findFirst({
    where: {
      // Konto = karta z hasłem albo z logowaniem przez Google lub Facebooka.
      AND: [
        { OR: [{ passwordHash: { not: null } }, { googleSub: { not: null } }, { facebookId: { not: null } }] },
        { OR: [{ phone }, { email: { equals: email, mode: "insensitive" } }] },
      ],
    },
    select: { id: true },
  });

  if (existingAccount) {
    // Nie zakładamy drugiego konta i NIE mówimy o tym w odpowiedzi — przeglądarka
    // próbuje się potem zalogować; jeśli to właściciel konta, zna swoje hasło.
    await logAudit({
      actor: { type: "GUEST", name, contact: phone },
      action: "REGISTER",
      entity: "PatientAccount",
      entityId: existingAccount.id,
      summary: "Próba rejestracji na telefon lub e-mail, które mają już konto — pominięta",
      data: { skipped: true, reason: "account_exists" },
    });
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  }

  // Konto zawsze powstaje na NOWEJ karcie pacjenta. Dopisanie hasła do
  // istniejącej karty gościa (znalezionej po samym numerze telefonu) pozwalało
  // każdemu, kto zna czyjś numer, przejąć historię wizyt tej osoby. Wcześniejszą
  // kartę recepcja łączy z kontem po weryfikacji (Pacjenci → Duplikaty).
  const existingGuest = await prisma.patient.findFirst({
    where: {
      passwordHash: null,
      googleSub: null,
      facebookId: null,
      OR: [{ phone }, { email: { equals: email, mode: "insensitive" } }],
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  const defaultLocation = await prisma.location.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!defaultLocation) return bad("Brak aktywnej lokalizacji w systemie. Skontaktuj się z kliniką.", 500);

  const patient = await prisma.patient.create({
    data: { name, phone, email, passwordHash, locationId: defaultLocation.id },
    select: { id: true, name: true, phone: true, email: true },
  });

  await logAudit({
    actor: { type: "PATIENT", id: patient.id, name: patient.name, contact: patient.phone },
    action: "REGISTER",
    entity: "PatientAccount",
    entityId: patient.id,
    summary: existingGuest
      ? `Rejestracja konta w panelu klienta (nowa karta ${patient.name}; istnieje wcześniejsza karta gościa do połączenia w Pacjenci → Duplikaty)`
      : `Rejestracja konta w panelu klienta (nowa karta pacjenta ${patient.name})`,
    data: { previousGuestPatientId: existingGuest?.id ?? undefined, phone: patient.phone, email: patient.email },
  });

  // Sesji nie tworzymy tutaj — odpowiedź musi być identyczna jak dla
  // istniejącego konta. Przeglądarka loguje się zaraz potem podanym hasłem.
  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
