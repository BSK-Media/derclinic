import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { subscribedPatientWhere } from "@/lib/newsletter-recipients";

// Wyszukiwarka klientów do wyboru odbiorców i do list newslettera. Każdy wynik
// ma flagę `subscribed`: czy klient w ogóle może dostać newsletter (zgoda
// marketingowa + adres e-mail + aktywne konto). Pozostałych też pokazujemy,
// żeby było widać, dlaczego nie można ich wybrać.
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 500);
  const scope = user!.locationScopeId ? { locationId: user!.locationScopeId } : {};

  const where = ids.length
    ? { id: { in: ids }, ...scope }
    : {
        ...scope,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      };

  const patients = await prisma.patient.findMany({
    where,
    orderBy: { name: "asc" },
    take: ids.length ? 500 : 30,
    select: { id: true, name: true, email: true, phone: true },
  });

  const subscribedIds = new Set(
    (
      await prisma.patient.findMany({
        where: { id: { in: patients.map((p) => p.id) }, ...subscribedPatientWhere(null) },
        select: { id: true },
      })
    ).map((p) => p.id),
  );

  return NextResponse.json({
    ok: true,
    clients: patients.map((p) => ({ ...p, subscribed: subscribedIds.has(p.id) })),
  });
}
