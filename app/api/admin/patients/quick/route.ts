import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { findOrCreatePatientByPhone } from "@/lib/quick-patient";

const BodySchema = z.object({
  firstName: z.string().trim().min(1, "Podaj imię").max(80),
  lastName: z.string().trim().min(1, "Podaj nazwisko").max(80),
  phone: z.string().trim().min(6, "Podaj numer telefonu").max(30),
  email: z.string().trim().email("Niepoprawny adres e-mail").max(200).optional().or(z.literal("")),
});

// Szybkie dodanie klienta w formularzu (np. sprzedaż pakietu lub vouchera nowej osobie). Gdy klient z tym numerem
// telefonu już istnieje w lokalizacji, zwracamy jego kartotekę zamiast tworzyć duplikat.
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }

  // Konto bez przypisanej lokalizacji: jeśli klinika ma jedną aktywną lokalizację, używamy jej.
  let locationId = user!.locationScopeId;
  if (!locationId) {
    const locations = await prisma.location.findMany({ where: { isActive: true }, select: { id: true }, take: 2 });
    if (locations.length === 1) locationId = locations[0].id;
  }
  if (!locationId) {
    return NextResponse.json({ ok: false, message: "Przed dodaniem klienta wybierz konkretną lokalizację" }, { status: 400 });
  }

  const { patient, created } = await findOrCreatePatientByPhone(prisma, {
    name: `${parsed.data.firstName} ${parsed.data.lastName}`,
    phone: parsed.data.phone,
    email: parsed.data.email || null,
    locationId,
    actorId: user!.id,
    context: "przy sprzedaży pakietu lub vouchera",
  });
  return NextResponse.json({ ok: true, patient, created });
}
