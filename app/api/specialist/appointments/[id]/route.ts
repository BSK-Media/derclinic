import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["SPECIALIST", "ADMIN"]);
  if (deny) return deny;

  const appt = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: {
      patient: true,
      service: { include: { suggestedProducts: { include: { product: true } } } },
      consumptions: { include: { product: true, warehouse: true } },
      payments: true,
    },
  });
  if (!appt) return NextResponse.json({ ok: false, message: "Nie znaleziono" }, { status: 404 });

  if (user!.role === "SPECIALIST" && appt.specialistId !== user!.id) {
    return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
  }

  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({ ok: true, appointment: appt, products, warehouses });
}
