import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { parseScan } from "@/lib/barcode";

// Identyfikacja produktu po zeskanowanym kodzie (EAN albo GS1).
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const code = new URL(req.url).searchParams.get("code") ?? "";
  const scan = parseScan(code);
  if (!scan) return NextResponse.json({ ok: false, message: "Pusty kod" }, { status: 400 });

  const product = await prisma.product.findFirst({
    where: { ean: { in: scan.productCodes } },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, sku: true, manufacturer: true, ean: true },
  });

  return NextResponse.json({ ok: true, scan, product });
}
