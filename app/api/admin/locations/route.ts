import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function slugifyLocationName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const locations = await prisma.location.findMany({
    where: { isActive: true, ...(user!.role === "ADMIN" ? {} : { id: user!.locationId }) },
    orderBy: { name: "asc" },
    include: { _count: { select: { appointments: true } } },
  });

  return NextResponse.json({ ok: true, locations });
}

const CreateSchema = z.object({
  name: z.string().trim().min(2, "Nazwa musi mieć co najmniej 2 znaki").max(100),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" },
      { status: 400 },
    );
  }

  const name = parsed.data.name.replace(/\s+/g, " ").trim();
  const duplicate = await prisma.location.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { ok: false, message: "Lokalizacja o tej nazwie już istnieje" },
      { status: 409 },
    );
  }

  const slug = slugifyLocationName(name) || "lokalizacja";
  let id = slug;
  let suffix = 2;
  while (await prisma.location.findUnique({ where: { id }, select: { id: true } })) {
    id = `${slug}-${suffix++}`;
  }

  const location = await prisma.location.create({ data: { id, name } });
  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "Location",
    entityId: location.id,
    data: { name: location.name },
  });

  return NextResponse.json({ ok: true, location }, { status: 201 });
}
