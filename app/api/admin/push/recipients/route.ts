import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { comparePolish, patientIdsMatching } from "@/lib/patient-search";

// Wyszukiwarka klientów do ręcznej wysyłki powiadomienia. Zwraca też
// informację, czy klient ma włączone powiadomienia na jakimkolwiek urządzeniu.
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ ok: true, patients: [] });

  const digits = q.replace(/\D/g, "");
  // Imię i telefon są zaszyfrowane — szukamy w pamięci. Bez technicznej "karty" blokady terminu w kalendarzu.
  const ids = await patientIdsMatching(
    q,
    { name: { not: "__DERCLINIC_REZERWACJA_CZASU__" } },
    digits.length >= 3 ? ["name", "phone"] : ["name"],
  );
  const found = await prisma.patient.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, phone: true, _count: { select: { pushSubscriptions: true } } },
  });
  const patients = found.sort((a, b) => comparePolish(a.name, b.name)).slice(0, 15);

  return NextResponse.json({
    ok: true,
    patients: patients.map((patient) => ({
      id: patient.id,
      name: patient.name,
      phone: patient.phone,
      devices: patient._count.pushSubscriptions,
    })),
  });
}
