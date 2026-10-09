import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { subscribedPatientWhere } from "@/lib/newsletter-recipients";
import { comparePolish, patientIdsMatching } from "@/lib/patient-search";

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

  // Imię, telefon i e-mail są zaszyfrowane — wyszukiwanie i sortowanie po nazwisku robimy w pamięci.
  const matchedIds = !ids.length && q ? await patientIdsMatching(q, scope) : null;
  const where = ids.length
    ? { id: { in: ids }, ...scope }
    : matchedIds
      ? { ...scope, id: { in: matchedIds } }
      : scope;

  const select = { id: true, name: true, email: true, phone: true } as const;
  const subscribedWhere = subscribedPatientWhere(null);

  // Kolejność: najpierw klienci ze zgodą marketingową (alfabetycznie), potem
  // bez zgody (też alfabetycznie). Dwa zapytania, żeby limit wyników nie
  // wycinał klientów ze zgodą na rzecz tych bez zgody.
  const limit = ids.length ? 500 : 30;
  const byName = <T extends { name: string }>(rows: T[]) => rows.sort((a, b) => comparePolish(a.name, b.name));
  const withConsent = byName(await prisma.patient.findMany({ where: { AND: [where, subscribedWhere] }, select })).slice(0, limit);
  const withoutConsent =
    withConsent.length >= limit
      ? []
      : byName(await prisma.patient.findMany({ where: { AND: [where, { NOT: subscribedWhere }] }, select })).slice(
          0,
          limit - withConsent.length,
        );

  return NextResponse.json({
    ok: true,
    clients: [
      ...withConsent.map((p) => ({ ...p, subscribed: true })),
      ...withoutConsent.map((p) => ({ ...p, subscribed: false })),
    ],
  });
}
