import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { packageProblem, visitBenefitByCode, voucherProblem } from "@/lib/visit-benefits";

export const dynamic = "force-dynamic";

// Odszukanie vouchera lub pakietu po kodzie przy rozliczaniu wizyty (np. voucher anonimowy albo pakiet anonimowy
// kupiony przez kogoś innego). Zwraca go w kształcie listy z karty wizyty albo powód, dla którego nie pasuje.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().slice(0, 40);
  if (!code) return NextResponse.json({ ok: false, message: "Wpisz kod" }, { status: 400 });

  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, deletedAt: null, ...scopedLocationWhere(user!) },
    select: { id: true, patientId: true, serviceId: true },
  });
  if (!appointment) return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });

  const found = await visitBenefitByCode(prisma, appointment, code, scopedLocationWhere(user!));
  if (found.voucher) {
    const problem = voucherProblem(found.voucher);
    if (problem) return NextResponse.json({ ok: false, message: problem }, { status: 400 });
    return NextResponse.json({ ok: true, kind: "VOUCHER", voucher: found.voucher });
  }
  if (found.package) {
    const problem = packageProblem(found.package);
    if (problem) return NextResponse.json({ ok: false, message: problem }, { status: 400 });
    return NextResponse.json({ ok: true, kind: "PACKAGE", package: found.package });
  }
  return NextResponse.json({ ok: false, message: "Nie znaleziono vouchera ani pakietu o tym kodzie" }, { status: 404 });
}
