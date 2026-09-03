import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setPatientAuthCookie, signPatientToken } from "@/lib/patient-auth";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const BodySchema = z.object({
  phone: z.string().trim().regex(/^\+48\d{9}$/, "Podaj prawidłowy 9-cyfrowy numer telefonu"),
  email: z.string().trim().min(1).email().max(200),
  password: z.string().min(6, "Hasło musi mieć co najmniej 6 znaków").max(100),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Uzupełnij poprawnie wszystkie pola");

  const { phone, email, password } = parsed.data;

  // Konto zakładane przy rezerwacji jako "gość" nie ma jeszcze hasła —
  // ten endpoint pozwala je dopisać do istniejącego rekordu pacjenta.
  // Ponieważ w systemie nie ma (na razie) weryfikacji SMS/e-mail, jako
  // zabezpieczenie wymagamy zgodności numeru telefonu ORAZ adresu e-mail
  // podanych przy rezerwacji — nie da się aktywować konta znając tylko sam
  // numer telefonu. Rekordy z już ustawionym hasłem są pomijane, żeby nie
  // dało się w ten sposób przejąć/nadpisać cudzego hasła.
  const patient = await prisma.patient.findFirst({
    where: {
      phone,
      email: { equals: email, mode: "insensitive" },
      passwordHash: null,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, phone: true, email: true },
  });

  if (!patient) {
    return bad(
      "Nie znaleźliśmy rezerwacji z tym numerem telefonu i adresem e-mail, albo konto zostało już założone. Sprawdź dane lub zaloguj się.",
      404,
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.patient.update({ where: { id: patient.id }, data: { passwordHash } });

  const token = await signPatientToken({
    id: patient.id,
    name: patient.name,
    phone: patient.phone,
    email: patient.email,
  });
  setPatientAuthCookie(token);

  return NextResponse.json({ ok: true });
}
