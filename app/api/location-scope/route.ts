import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const locations =
    user!.role === "ADMIN"
      ? await prisma.location.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [user!.assignedLocation];

  return NextResponse.json({
    ok: true,
    locations,
    selectedLocationId: user!.locationScopeId,
    canSelectAll: user!.role === "ADMIN",
  });
}

const ScopeSchema = z.object({ locationId: z.string().min(1).nullable() });

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const parsed = ScopeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Niepoprawna lokalizacja" }, { status: 400 });
  }

  let locationId = user!.locationId;
  if (user!.role === "ADMIN") {
    locationId = parsed.data.locationId ?? "all";
    if (locationId !== "all") {
      const exists = await prisma.location.findFirst({
        where: { id: locationId, isActive: true },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ ok: false, message: "Nie znaleziono lokalizacji" }, { status: 404 });
      }
    }
  }

  const response = NextResponse.json({
    ok: true,
    selectedLocationId: locationId === "all" ? null : locationId,
  });
  response.cookies.set("bsk_location_scope", locationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
