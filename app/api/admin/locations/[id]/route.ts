import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;
  if (user!.role !== "ADMIN" && params.id !== user!.locationId) {
    return NextResponse.json(
      { ok: false, message: "Brak dostępu do tej lokalizacji" },
      { status: 403 },
    );
  }

  const location = await prisma.location.findFirst({
    where: { id: params.id, isActive: true },
    include: { _count: { select: { appointments: true } } },
  });
  if (!location) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono lokalizacji" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, location });
}

const DeleteSchema = z.object({
  password: z.string().min(1, "Wpisz hasło administratora"),
});

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const parsed = DeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Wpisz hasło administratora" },
      { status: 400 },
    );
  }

  const admin = await prisma.user.findUnique({
    where: { id: user!.id },
    select: { passwordHash: true },
  });
  if (!admin?.passwordHash || !(await bcrypt.compare(parsed.data.password, admin.passwordHash))) {
    return NextResponse.json(
      { ok: false, message: "Nieprawidłowe hasło administratora" },
      { status: 401 },
    );
  }

  const location = await prisma.location.findUnique({
    where: { id: params.id },
    include: {
      _count: {
        select: {
          users: true,
          appointments: true,
          patients: true,
          warehouses: true,
          retailSales: true,
        },
      },
    },
  });
  if (!location) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono lokalizacji" }, { status: 404 });
  }

  const assignedRecords =
    location._count.users +
    location._count.appointments +
    location._count.patients +
    location._count.warehouses +
    location._count.retailSales;

  if (assignedRecords > 0) {
    const blockers = [
      location._count.users > 0 ? `pracownicy: ${location._count.users}` : null,
      location._count.appointments > 0 ? `wizyty: ${location._count.appointments}` : null,
      location._count.patients > 0 ? `pacjenci: ${location._count.patients}` : null,
      location._count.warehouses > 0 ? `magazyny: ${location._count.warehouses}` : null,
      location._count.retailSales > 0 ? `sprzedaże: ${location._count.retailSales}` : null,
    ].filter(Boolean);

    return NextResponse.json(
      {
        ok: false,
        message: `Nie można usunąć lokalizacji z przypisanymi danymi (${blockers.join(", ")}). Najpierw przenieś je do innej lokalizacji.`,
      },
      { status: 409 },
    );
  }

  try {
    await prisma.location.delete({ where: { id: location.id } });
  } catch (deleteError) {
    const code = (deleteError as { code?: string })?.code;
    if (code === "P2003") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Nie można usunąć lokalizacji, ponieważ ma przypisane dane. Najpierw przenieś je do innej lokalizacji.",
        },
        { status: 409 },
      );
    }
    throw deleteError;
  }

  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "Location",
    entityId: location.id,
    data: { name: location.name },
  });

  const response = NextResponse.json({ ok: true });
  if (cookies().get("bsk_location_scope")?.value === location.id) {
    response.cookies.set("bsk_location_scope", "all", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}
