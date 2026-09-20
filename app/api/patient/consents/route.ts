import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPatientAuth } from "@/lib/patient-auth";
import { logAudit } from "@/lib/audit";

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

const CONSENT_TYPES = ["RODO", "MARKETING"] as const;

const CONSENT_LABELS: Record<(typeof CONSENT_TYPES)[number], string> = {
  RODO: "RODO (przetwarzanie danych osobowych)",
  MARKETING: "marketingowa",
};

const BodySchema = z.object({
  type: z.enum(CONSENT_TYPES),
  granted: z.boolean(),
});

// Zgody "stałe" konta pacjenta (RODO, marketing) — patrz PatientConsent w
// schema.prisma. Zgoda na wizerunek jest osobna, wyrażana przy każdej
// rezerwacji (POST /api/public/appointments), nie tutaj.
export async function GET() {
  const auth = await getPatientAuth();
  if (!auth) return bad("Brak autoryzacji", 401);

  const rows = await prisma.patientConsent.findMany({ where: { patientId: auth.id } });
  const byType = new Map(rows.map((row) => [row.type, row]));

  const consents = CONSENT_TYPES.map((type) => {
    const row = byType.get(type);
    return {
      type,
      granted: row?.granted ?? false,
      grantedAt: row?.grantedAt ?? null,
      revokedAt: row?.revokedAt ?? null,
    };
  });

  return NextResponse.json({ ok: true, consents });
}

export async function POST(req: Request) {
  const auth = await getPatientAuth();
  if (!auth) return bad("Brak autoryzacji", 401);

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return bad("Niepoprawne dane");

  const existing = await prisma.patientConsent.findUnique({
    where: { patientId_type: { patientId: auth.id, type: parsed.data.type } },
    select: { granted: true },
  });
  // Bez zmiany stanu nic nie robimy — nie dokładamy pustego wpisu do
  // historii za kliknięcie, które i tak niczego nie zmieniło.
  if (existing?.granted === parsed.data.granted) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const now = new Date();
  const [consent] = await prisma.$transaction([
    prisma.patientConsent.upsert({
      where: { patientId_type: { patientId: auth.id, type: parsed.data.type } },
      create: {
        patientId: auth.id,
        type: parsed.data.type,
        granted: parsed.data.granted,
        grantedAt: parsed.data.granted ? now : null,
        revokedAt: parsed.data.granted ? null : now,
      },
      update: {
        granted: parsed.data.granted,
        ...(parsed.data.granted ? { grantedAt: now, revokedAt: null } : { revokedAt: now }),
      },
    }),
    prisma.patientConsentEvent.create({
      data: { patientId: auth.id, type: parsed.data.type, granted: parsed.data.granted },
    }),
  ]);

  await logAudit({
    actor: { type: "PATIENT", id: auth.id, name: auth.name, contact: auth.phone },
    action: "CONSENT",
    entity: "PatientConsent",
    entityId: auth.id,
    summary: `Zgoda ${CONSENT_LABELS[parsed.data.type]}: ${parsed.data.granted ? "wyrażona" : "wycofana"}`,
    data: {
      type: parsed.data.type,
      granted: parsed.data.granted,
      previouslyGranted: existing?.granted ?? null,
    },
  });

  return NextResponse.json({ ok: true, consent });
}
