import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

// Wykrywanie i scalanie zdublowanych pacjentów (ten sam telefon lub e-mail w
// obrębie jednej lokalizacji). Duplikaty powstają, gdy ktoś zarejestrował się
// dwa razy z różnymi danymi kontaktowymi zanim wprowadziliśmy deduplikację
// przy rezerwacji online (patrz app/api/public/appointments/route.ts).

type PatientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  locationId: string;
  passwordHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { appointments: number; retailSales: number };
};

function normalizedKey(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

// Union-find po prostych indeksach — łączy pacjentów, którzy dzielą telefon
// LUB e-mail w tej samej lokalizacji, więc grupa może obejmować więcej niż
// dwa rekordy jeśli tworzą "łańcuch" duplikatów.
function buildDuplicateGroups(patients: PatientRow[]) {
  const parent = new Map<string, string>();
  function find(id: string): string {
    let root = id;
    while (parent.get(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const p of patients) parent.set(p.id, p.id);

  const byLocationPhone = new Map<string, string[]>();
  const byLocationEmail = new Map<string, string[]>();
  for (const p of patients) {
    const phoneKey = normalizedKey(p.phone);
    if (phoneKey) {
      const key = `${p.locationId}::${phoneKey}`;
      byLocationPhone.set(key, [...(byLocationPhone.get(key) ?? []), p.id]);
    }
    const emailKey = normalizedKey(p.email);
    if (emailKey) {
      const key = `${p.locationId}::${emailKey}`;
      byLocationEmail.set(key, [...(byLocationEmail.get(key) ?? []), p.id]);
    }
  }

  for (const ids of [...byLocationPhone.values(), ...byLocationEmail.values()]) {
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  }

  const groups = new Map<string, PatientRow[]>();
  for (const p of patients) {
    const root = find(p.id);
    groups.set(root, [...(groups.get(root) ?? []), p]);
  }

  return [...groups.values()].filter((g) => g.length > 1);
}

function suggestKeepId(group: PatientRow[]) {
  const withPassword = group.filter((p) => p.passwordHash);
  if (withPassword.length === 1) return withPassword[0].id;
  // Brak jednoznacznego konta z hasłem — wybierz tego z największą
  // aktywnością (wizyty + sprzedaż), a przy remisie najstarszy rekord.
  const sorted = [...group].sort((a, b) => {
    const activityA = a._count.appointments + a._count.retailSales;
    const activityB = b._count.appointments + b._count.retailSales;
    if (activityB !== activityA) return activityB - activityA;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return sorted[0].id;
}

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const patients = await prisma.patient.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      locationId: true,
      passwordHash: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { appointments: true, retailSales: true } },
    },
  });

  const groups = buildDuplicateGroups(patients as PatientRow[]);

  const report = groups.map((group) => {
    const suggestedKeepId = suggestKeepId(group);
    const distinctPasswordHolders = group.filter((p) => p.passwordHash).length;
    return {
      locationId: group[0].locationId,
      suggestedKeepId,
      passwordConflict: distinctPasswordHolders > 1,
      patients: group.map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        hasPassword: Boolean(p.passwordHash),
        appointments: p._count.appointments,
        retailSales: p._count.retailSales,
        createdAt: p.createdAt,
      })),
    };
  });

  return NextResponse.json({ ok: true, groups: report });
}

const MergeSchema = z.object({
  keepId: z.string().min(1),
  mergeIds: z.array(z.string().min(1)).min(1),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = MergeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Nieprawidłowe dane żądania" }, { status: 400 });
  }
  const { keepId, mergeIds } = parsed.data;
  const allIds = [keepId, ...mergeIds];
  if (new Set(allIds).size !== allIds.length) {
    return NextResponse.json({ ok: false, message: "Lista pacjentów zawiera duplikaty ID" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.patient.findMany({
        where: { id: { in: allIds } },
        select: { id: true, name: true, phone: true, email: true, note: true, locationId: true, passwordHash: true },
      });
      if (rows.length !== allIds.length) {
        throw new Error("Nie znaleziono wszystkich wskazanych pacjentów");
      }
      const keep = rows.find((r) => r.id === keepId);
      if (!keep) throw new Error("Nie znaleziono pacjenta docelowego");
      const merging = rows.filter((r) => r.id !== keepId);
      if (merging.some((r) => r.locationId !== keep.locationId)) {
        throw new Error("Pacjenci muszą należeć do tej samej lokalizacji");
      }

      const distinctPasswords = new Set(rows.filter((r) => r.passwordHash).map((r) => r.passwordHash));
      if (distinctPasswords.size > 1) {
        throw new Error(
          "Więcej niż jeden z tych pacjentów ma ustawione (różne) hasło do konta — scalenie wymaga ręcznej decyzji, które hasło zachować.",
        );
      }

      const patientUpdate: { email?: string; phone?: string; note?: string; passwordHash?: string } = {};
      if (!keep.email) {
        const email = merging.find((r) => r.email)?.email;
        if (email) patientUpdate.email = email;
      }
      if (!keep.phone) {
        const phone = merging.find((r) => r.phone)?.phone;
        if (phone) patientUpdate.phone = phone;
      }
      if (!keep.note) {
        const note = merging.find((r) => r.note)?.note;
        if (note) patientUpdate.note = note;
      }
      if (!keep.passwordHash) {
        const passwordHash = merging.find((r) => r.passwordHash)?.passwordHash;
        if (passwordHash) patientUpdate.passwordHash = passwordHash;
      }

      const mergeIdsList = merging.map((r) => r.id);
      const [movedAppointments, movedSales] = await Promise.all([
        tx.appointment.updateMany({ where: { patientId: { in: mergeIdsList } }, data: { patientId: keepId } }),
        tx.retailSale.updateMany({ where: { patientId: { in: mergeIdsList } }, data: { patientId: keepId } }),
      ]);

      if (Object.keys(patientUpdate).length > 0) {
        await tx.patient.update({ where: { id: keepId }, data: patientUpdate });
      }

      await tx.patient.deleteMany({ where: { id: { in: mergeIdsList } } });

      return {
        keptPatientId: keepId,
        removedPatientIds: mergeIdsList,
        movedAppointments: movedAppointments.count,
        movedRetailSales: movedSales.count,
      };
    });

    await logAudit({
      actorId: user!.id,
      action: "MERGE",
      entity: "Patient",
      entityId: result.keptPatientId,
      data: result,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: typeof e?.message === "string" ? e.message : "Nie udało się scalić pacjentów" },
      { status: 409 },
    );
  }
}
