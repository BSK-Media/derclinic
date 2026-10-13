import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { CLINIC_PROFILE_ID, EMPTY_CLINIC_PROFILE, getClinicProfile } from "@/lib/clinic-profile";

// Dane podmiotu (kliniki): odczyt dla administratora i managera, zapis tylko dla administratora.

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;
  return NextResponse.json({ ok: true, profile: (await getClinicProfile()) ?? EMPTY_CLINIC_PROFILE });
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

const BodySchema = z.object({
  name: optional(200),
  legalForm: optional(100),
  address: optional(300),
  nip: optional(20),
  regon: optional(20),
  krs: optional(20),
  rpwdl: optional(40),
});

export async function PUT(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }
  const value = parsed.data;
  const before = await getClinicProfile();

  await prisma.clinicProfile.upsert({
    where: { id: CLINIC_PROFILE_ID },
    create: { id: CLINIC_PROFILE_ID, ...value },
    update: value,
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "ClinicProfile",
    entityId: CLINIC_PROFILE_ID,
    summary: "Zmiana danych kliniki (Ustawienia → Dane kliniki)",
    data: { before, after: value },
  });

  return NextResponse.json({ ok: true, profile: value });
}
