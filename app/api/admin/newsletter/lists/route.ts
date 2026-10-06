import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { subscribedPatientWhere } from "@/lib/newsletter-recipients";

const CreateSchema = z.object({ name: z.string().trim().min(2, "Podaj nazwę listy (min. 2 znaki)").max(80) });

// Własne listy odbiorców newslettera. Liczby: wszyscy członkowie oraz ci, którzy
// faktycznie dostaną wiadomość (mają zgodę marketingową i adres e-mail).
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const lists = await prisma.newsletterList.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, createdAt: true, _count: { select: { members: true } } },
  });
  const subscribedCounts = await Promise.all(
    lists.map((list) =>
      prisma.patient.count({
        where: { ...subscribedPatientWhere(user!.locationScopeId), newsletterListMemberships: { some: { listId: list.id } } },
      }),
    ),
  );

  return NextResponse.json({
    ok: true,
    lists: lists.map((list, index) => ({
      id: list.id,
      name: list.name,
      createdAt: list.createdAt,
      members: list._count.members,
      subscribed: subscribedCounts[index],
    })),
  });
}

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }

  const list = await prisma.newsletterList.create({
    data: { name: parsed.data.name, createdById: user!.id },
    select: { id: true, name: true },
  });
  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "NewsletterList",
    entityId: list.id,
    summary: `Utworzono listę newslettera „${list.name}"`,
  });
  return NextResponse.json({ ok: true, list });
}
