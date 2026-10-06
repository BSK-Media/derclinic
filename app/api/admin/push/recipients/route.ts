import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";

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
  const patients = await prisma.patient.findMany({
    where: {
      // Bez technicznej "karty" blokady terminu w kalendarzu.
      name: { not: "__DERCLINIC_REZERWACJA_CZASU__" },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ],
    },
    orderBy: { name: "asc" },
    take: 15,
    select: { id: true, name: true, phone: true, _count: { select: { pushSubscriptions: true } } },
  });

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
