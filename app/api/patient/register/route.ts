import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setPatientAuthCookie, signPatientToken } from "@/lib/patient-auth";

function bad(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return `+48${digits}`;
}

const BodySchema = z.object({
  firstName: z.string().trim().min(1, "Podaj imię").max(100),
  lastName: z.string().trim().min(1, "Podaj nazwisko").max(100),
  phone: z.string().trim().regex(/^\+48\d{9}$/, "Podaj prawidłowy 9-cyfrowy numer telefonu"),
  email: z.string().trim().min(1, "Podaj adres e-mail").email("Niepoprawny adres e-mail").max(200),
  password: z.string().min(6, "Hasło musi mieć co najmniej 6 znaków").max(100),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Uzupełnij poprawnie wszystkie pola");

  const { firstName, lastName, password } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);
  const email = parsed.data.email.trim();
  const name = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();

  // Krok 1 — czy ten telefon albo e-mail ma już aktywne konto (ustawione
  // hasło)? Jeśli tak, nie zakładamy drugiego konta — tak jak w typowych
  // serwisach, odsyłamy do logowania zamiast zwracać mylący błąd.
  const existingAccount = await prisma.patient.findFirst({
    where: {
      passwordHash: { not: null },
      OR: [{ phone }, { email: { equals: email, mode: "insensitive" } }],
    },
    select: { id: true },
  });
  if (existingAccount) {
    return bad("To konto już istnieje. Zaloguj się zamiast rejestrować się ponownie.", 409, {
      code: "ACCOUNT_EXISTS",
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Krok 2 — czy ten telefon albo e-mail pojawia się już w systemie jako
  // pacjent bez hasła (np. wcześniejsza rezerwacja jako gość albo rekord
  // dodany ręcznie w recepcji)? Jeśli tak, dopisujemy hasło do TEGO rekordu
  // zamiast tworzyć nowy — dzięki temu historia wizyt automatycznie znajdzie
  // się na koncie. Telefon ma pierwszeństwo (silniejszy identyfikator, tak
  // samo jak przy rezerwacji online i logowaniu).
  const existingGuest = await prisma.patient.findFirst({
    where: {
      passwordHash: null,
      OR: [{ phone }, { email: { equals: email, mode: "insensitive" } }],
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, phone: true, email: true },
  });

  let patient: { id: string; name: string; phone: string | null; email: string | null };

  if (existingGuest) {
    const update: { name?: string; phone?: string; email?: string; passwordHash: string } = { passwordHash };
    // Uzupełniamy tylko brakujące dane — nie nadpisujemy istniejącego imienia,
    // telefonu czy e-maila czymś, co mogło zostać wpisane inaczej.
    if (!existingGuest.name || existingGuest.name.trim().length === 0) update.name = name;
    if (!existingGuest.phone) update.phone = phone;
    if (!existingGuest.email) update.email = email;
    const updated = await prisma.patient.update({
      where: { id: existingGuest.id },
      data: update,
      select: { id: true, name: true, phone: true, email: true },
    });
    patient = updated;
  } else {
    // Zupełnie nowy pacjent — rejestracja "z zera", bez wcześniejszej wizyty.
    // Konto zakładane tym formularzem nie jest przypisane do konkretnej
    // lokalizacji wybranej w kroku rezerwacji, więc używamy głównej/aktywnej
    // lokalizacji jako wartości domyślnej (pole jest wymagane w bazie).
    const defaultLocation = await prisma.location.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!defaultLocation) return bad("Brak aktywnej lokalizacji w systemie. Skontaktuj się z kliniką.", 500);

    const created = await prisma.patient.create({
      data: { name, phone, email, passwordHash, locationId: defaultLocation.id },
      select: { id: true, name: true, phone: true, email: true },
    });
    patient = created;
  }

  const token = await signPatientToken({
    id: patient.id,
    name: patient.name,
    phone: patient.phone,
    email: patient.email,
  });
  setPatientAuthCookie(token);

  return NextResponse.json({ ok: true });
}
