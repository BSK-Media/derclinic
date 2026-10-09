import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { comparePolish, patientIdsMatching } from "@/lib/patient-search";

const LIMIT = 200;

// Statystyki programu lojalnościowego: sumy dla wszystkich klientów oraz
// lista klientów z saldem, naliczonymi i wykorzystanymi punktami.
// Manager (albo admin z wybraną lokalizacją) widzi tylko klientów swojej lokalizacji.
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const onlyWithPoints = url.searchParams.get("onlyWithPoints") === "1";
  const scope = user!.locationScopeId ? { locationId: user!.locationScopeId } : {};

  const base = {
    ...scope,
    ...(onlyWithPoints ? { loyaltyPoints: { gt: 0 } } : {}),
  };
  // Imię, telefon i e-mail są zaszyfrowane — wyszukiwanie i sortowanie po nazwisku robimy w pamięci.
  const matchedIds = q ? await patientIdsMatching(q, base) : null;
  const where = matchedIds ? { ...base, id: { in: matchedIds } } : base;

  const [allMatching, balance, withPoints, byType] = await Promise.all([
    prisma.patient.findMany({
      where,
      select: { id: true, name: true, phone: true, email: true, loyaltyPoints: true },
    }),
    prisma.patient.aggregate({ where: scope, _sum: { loyaltyPoints: true } }),
    prisma.patient.count({ where: { ...scope, loyaltyPoints: { gt: 0 } } }),
    prisma.loyaltyPointsTransaction.groupBy({
      by: ["type"],
      where: { patient: scope },
      _sum: { points: true },
    }),
  ]);

  allMatching.sort((a, b) => b.loyaltyPoints - a.loyaltyPoints || comparePolish(a.name, b.name));
  const totalPatients = allMatching.length;
  const patients = allMatching.slice(0, LIMIT);

  const perPatient = patients.length
    ? await prisma.loyaltyPointsTransaction.groupBy({
        by: ["patientId", "type"],
        where: { patientId: { in: patients.map((p) => p.id) } },
        _sum: { points: true },
        _max: { createdAt: true },
      })
    : [];

  const stats = new Map<string, { earned: number; redeemed: number; lastAt: Date | null }>();
  for (const row of perPatient) {
    const entry = stats.get(row.patientId) ?? { earned: 0, redeemed: 0, lastAt: null };
    if (row.type === "EARNED") entry.earned = row._sum.points ?? 0;
    else entry.redeemed = row._sum.points ?? 0;
    const at = row._max.createdAt;
    if (at && (!entry.lastAt || at > entry.lastAt)) entry.lastAt = at;
    stats.set(row.patientId, entry);
  }

  const sumOf = (type: "EARNED" | "REDEEMED") => byType.find((row) => row.type === type)?._sum.points ?? 0;

  return NextResponse.json({
    ok: true,
    kpi: {
      pointsInCirculation: balance._sum.loyaltyPoints ?? 0,
      clientsWithPoints: withPoints,
      totalEarned: sumOf("EARNED"),
      totalRedeemed: sumOf("REDEEMED"),
    },
    total: totalPatients,
    limit: LIMIT,
    clients: patients.map((p) => {
      const entry = stats.get(p.id);
      return {
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        points: p.loyaltyPoints,
        earned: entry?.earned ?? 0,
        redeemed: entry?.redeemed ?? 0,
        lastAt: entry?.lastAt ?? null,
      };
    }),
  });
}
