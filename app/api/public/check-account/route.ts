import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Lekki endpoint używany przez formularz rezerwacji online do sprawdzenia "na
// żywo", czy podany numer telefonu lub e-mail ma już założone konto pacjenta
// (czyli ma ustawione hasło). Nie zwraca żadnych danych pacjenta — tylko flagi
// boolean — żeby nie ujawniać niczego poza samym faktem istnienia konta.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phoneDigits = (searchParams.get("phone") || "").replace(/\D/g, "");
  const emailRaw = (searchParams.get("email") || "").trim().toLowerCase();

  let phoneHasAccount = false;
  let emailHasAccount = false;

  if (phoneDigits.length === 9) {
    const phone = `+48${phoneDigits}`;
    const found = await prisma.patient.findFirst({
      where: { phone, passwordHash: { not: null } },
      select: { id: true },
    });
    phoneHasAccount = Boolean(found);
  }

  if (emailRaw && /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(emailRaw)) {
    const found = await prisma.patient.findFirst({
      where: { email: { equals: emailRaw, mode: "insensitive" }, passwordHash: { not: null } },
      select: { id: true },
    });
    emailHasAccount = Boolean(found);
  }

  return NextResponse.json({ ok: true, phoneHasAccount, emailHasAccount });
}
