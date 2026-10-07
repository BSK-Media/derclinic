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

  const select = { id: true, name: true, email: true, phone: true } as const;
  const subscribedWhere = subscribedPatientWhere(null);

  // Kolejność: najpierw klienci ze zgodą marketingową (alfabetycznie), potem
  // bez zgody (też alfabetycznie). Dwa zapytania, żeby limit wyników nie
  // wycinał klientów ze zgodą na rzecz tych bez zgody.
  const limit = ids.length ? 500 : 30;
  const withConsent = await prisma.patient.findMany({
    where: { AND: [where, subscribedWhere] },
    orderBy: { name: "asc" },
    take: limit,
    select,
  });
  const withoutConsent =
    withConsent.length >= limit
      ? []
      : await prisma.patient.findMany({
          where: { AND: [where, { NOT: subscribedWhere }] },
          orderBy: { name: "asc" },
          take: limit - withConsent.length,
          select,
        });

  return NextResponse.json({
    ok: true,
    clients: [
      ...withConsent.map((p) => ({ ...p, subscribed: true })),
      ...withoutConsent.map((p) => ({ ...p, subscribed: false })),
    ],
  });
}
