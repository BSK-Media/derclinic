import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { AudienceSchema, newsletterRecipientsWhere } from "@/lib/newsletter-recipients";

// Ilu klientów faktycznie dostanie wysyłkę dla wybranych odbiorców (po
// uwzględnieniu zgody marketingowej, adresu e-mail i lokalizacji).
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const parsed = AudienceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawny wybór odbiorców" }, { status: 400 });

  const audience = parsed.data;
  // Pusty wybór to zero odbiorców — nie "wszyscy".
  if ((audience.type === "LISTS" && audience.listIds.length === 0) || (audience.type === "PATIENTS" && audience.patientIds.length === 0)) {
    return NextResponse.json({ ok: true, count: 0 });
  }
  const count = await prisma.patient.count({ where: newsletterRecipientsWhere(user!.locationScopeId, audience) });
  return NextResponse.json({ ok: true, count });
}
