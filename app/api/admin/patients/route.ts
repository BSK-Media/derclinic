import { NextResponse } from "next/server";
import { PATIENT_PUBLIC_SELECT } from "@/lib/patient-select";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { isAdminLike } from "@/lib/roles";
import { patientMatches } from "@/lib/patient-search";
import { loadPatientStats } from "@/lib/patient-stats";
import { segmentByPatient } from "@/lib/rfm-audience";

const SORT_KEYS = ["name", "createdAt", "lastVisitAt", "totalSpent", "completedVisits", "rfmSegment"] as const;
type SortKey = (typeof SORT_KEYS)[number];
const SEGMENT_ORDER = ["VIP", "LOYAL", "NEW", "WIN_BACK", "AT_RISK", "DORMANT", "OTHER"];
const PAGE_SIZES = [10, 25, 50, 100];

// Lista pacjentów: WSZYSCY pacjenci z zakresu użytkownika, z filtrowaniem, sortowaniem i paginacją po stronie
// serwera. Statystyki (wizyty, wydane kwoty, ostatnia wizyta) liczone są z całej historii każdego pacjenta,
// więc sortowanie „najwięcej wizyt / najwięcej wydali” dotyczy całej bazy, a nie wycinka listy.
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const adminLike = isAdminLike(user!.role);
  const requestedSort = url.searchParams.get("sort") as SortKey | null;
  let sort: SortKey = requestedSort && SORT_KEYS.includes(requestedSort) ? requestedSort : "createdAt";
  if (!adminLike && (sort === "totalSpent" || sort === "rfmSegment")) sort = "createdAt";
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
  const requestedSize = Number(url.searchParams.get("pageSize"));
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 25;
  const emailFilter = url.searchParams.get("email");
  const onlyWithNote = url.searchParams.get("note") === "1";
  const segmentFilter = adminLike ? url.searchParams.get("segment") : null;

  const scope = scopedLocationWhere(user!);
  const [allPatients, stats, segments] = await Promise.all([
    prisma.patient.findMany({ where: scope, select: PATIENT_PUBLIC_SELECT }),
    loadPatientStats(scope, { withSpending: adminLike }),
    adminLike ? segmentByPatient(null) : Promise.resolve(null),
  ]);

  const rows = allPatients.map((patient) => {
    const s = stats.get(patient.id);
    return {
      ...patient,
      ...(adminLike ? { totalSpent: s?.totalSpent ?? 0 } : {}),
      ...(segments ? { rfmSegment: segments.get(patient.id) ?? null } : {}),
      completedVisits: s?.completedVisits ?? 0,
      lastVisitAt: s?.lastVisitAt ?? null,
    };
  });

  // Statystyki „najlepszych” — z całej listy, niezależnie od wyszukiwania i filtrów.
  let topVisits: (typeof rows)[number] | null = null;
  let topSpender: (typeof rows)[number] | null = null;
  for (const row of rows) {
    if (!topVisits || row.completedVisits > topVisits.completedVisits) topVisits = row;
    if (adminLike && (!topSpender || (row.totalSpent ?? 0) > (topSpender.totalSpent ?? 0))) topSpender = row;
  }

  const filtered = rows.filter((row) => {
    if (q && !patientMatches(row, q)) return false;
    if (emailFilter === "with" && !row.email) return false;
    if (emailFilter === "without" && row.email) return false;
    if (onlyWithNote && !row.note?.trim()) return false;
    if (segmentFilter && segmentFilter !== "all" && (row as { rfmSegment?: string | null }).rfmSegment !== segmentFilter) return false;
    return true;
  });

  const segmentRank = (value?: string | null) => {
    const index = value ? SEGMENT_ORDER.indexOf(value) : -1;
    return index === -1 ? SEGMENT_ORDER.length : index;
  };
  const sign = dir === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    let result: number;
    if (sort === "name") result = a.name.localeCompare(b.name, "pl", { sensitivity: "base" });
    else if (sort === "createdAt") result = a.createdAt.getTime() - b.createdAt.getTime();
    else if (sort === "lastVisitAt") result = (a.lastVisitAt?.getTime() ?? 0) - (b.lastVisitAt?.getTime() ?? 0);
    else if (sort === "totalSpent") result = (a.totalSpent ?? 0) - (b.totalSpent ?? 0);
    else if (sort === "completedVisits") result = a.completedVisits - b.completedVisits;
    else {
      result = segmentRank((a as { rfmSegment?: string | null }).rfmSegment) - segmentRank((b as { rfmSegment?: string | null }).rfmSegment);
      return result !== 0 ? result * sign : (b.totalSpent ?? 0) - (a.totalSpent ?? 0);
    }
    // Remis: nowsi pacjenci wyżej, a przy tym samym czasie po nazwie — kolejność jest stabilna między stronami.
    if (result === 0) result = b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id);
    else result *= sign;
    return result;
  });

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(url.searchParams.get("page")) || 1), pageCount);
  const pagePatients = filtered.slice((page - 1) * pageSize, page * pageSize);

  const slim = (row: (typeof rows)[number] | null) =>
    row ? { id: row.id, name: row.name, completedVisits: row.completedVisits, totalSpent: row.totalSpent } : null;

  return NextResponse.json({
    ok: true,
    viewerRole: user!.role,
    patients: pagePatients,
    total,
    totalAll: rows.length,
    page,
    pageSize,
    pageCount,
    top: { visits: slim(topVisits), spender: adminLike ? slim(topSpender) : null },
  });
}

const CreateSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  note: z.string().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  if (!user!.locationScopeId) {
    return NextResponse.json(
      { ok: false, message: "Przed dodaniem pacjenta wybierz konkretną lokalizację" },
      { status: 400 },
    );
  }
  const p = await prisma.patient.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone ? parsed.data.phone : null,
      email: parsed.data.email ? parsed.data.email : null,
      note: parsed.data.note ? parsed.data.note : null,
      locationId: user!.locationScopeId,
    },
    // Bez hasha hasła i tokenu resetu w odpowiedzi.
    select: { id: true, createdAt: true, updatedAt: true, name: true, phone: true, email: true, note: true, locationId: true },
  });

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "Patient",
    entityId: p.id,
    summary: `Nowa karta pacjenta: ${p.name}${p.phone ? ` (${p.phone})` : ""}`,
    data: { name: p.name, phone: p.phone, email: p.email, locationId: p.locationId, hasNote: p.note ? true : undefined },
  });

  return NextResponse.json({ ok: true, patient: p });
}
