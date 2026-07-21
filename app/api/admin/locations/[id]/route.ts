import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;
  if (user!.role !== "ADMIN" && params.id !== user!.locationId) {
    return NextResponse.json({ ok: false, message: "Brak dostępu do tej lokalizacji" }, { status: 403 });
  }

  const location = await prisma.location.findFirst({
    where: { id: params.id, isActive: true },
    include: { _count: { select: { appointments: true } } },
  });
  if (!location) {
    return NextResponse.json(
      { ok: false, message: "Nie znaleziono lokalizacji" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, location });
}
