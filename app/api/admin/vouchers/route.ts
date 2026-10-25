import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { formatPLNFromGrosze } from "@/lib/money";
import { benefitStatus, parseExpiryDate, voucherRemaining, type BenefitStatus } from "@/lib/vouchers";
import { generateCode } from "@/lib/voucher-code";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "MANAGER", "RECEPTION"];
const PAGE_SIZES = [25, 50, 100];

// Lista voucherów (karty podarunkowe): wyszukiwanie po kupującym, obdarowanym, kodzie i tytule, filtr statusu, paginacja.
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ROLES);
  if (deny) return deny;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase("pl");
  const statusFilter = url.searchParams.get("status") as BenefitStatus | "ALL" | null;
  const requestedSize = Number(url.searchParams.get("pageSize"));
  const pageSize = PAGE_SIZES.includes(requestedSize) ? requestedSize : 25;

  const rows = await prisma.voucher.findMany({
    where: { patient: { ...scopedLocationWhere(user!) } },
    orderBy: { createdAt: "desc" },
    include: {
      patient: { select: { id: true, name: true, phone: true } },
      payments: { select: { amount: true } },
    },
    take: 20000,
  });

  const now = new Date();
  const shaped = rows.map((v) => {
    const remaining = voucherRemaining(v.amount, v.payments);
    return {
      id: v.id,
      code: v.code,
      title: v.title,
      recipientName: v.recipientName,
      amount: v.amount,
      remaining,
      used: v.amount - remaining,
      expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
      createdAt: v.createdAt.toISOString(),
      saleMethod: v.saleMethod,
      status: benefitStatus({ canceledAt: v.canceledAt, expiresAt: v.expiresAt, remaining, now }),
      patient: v.patient,
    };
  });

  const filtered = shaped.filter((v) => {
    if (statusFilter && statusFilter !== "ALL" && v.status !== statusFilter) return false;
    if (!q) return true;
    return (
      v.code.toLocaleLowerCase("pl").includes(q) ||
      v.title.toLocaleLowerCase("pl").includes(q) ||
      (v.recipientName ?? "").toLocaleLowerCase("pl").includes(q) ||
      v.patient.name.toLocaleLowerCase("pl").includes(q) ||
      (v.patient.phone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))
    );
  });

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(url.searchParams.get("page")) || 1), pageCount);

  // Podsumowanie całości (niezależnie od filtra): ile voucherów aktywnych i ile pieniędzy czeka na wykorzystanie.
  const active = shaped.filter((v) => v.status === "ACTIVE");
  return NextResponse.json({
    ok: true,
    vouchers: filtered.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    pageCount,
    summary: {
      activeCount: active.length,
      activeRemaining: active.reduce((sum, v) => sum + v.remaining, 0),
      soldTotal: shaped.filter((v) => v.status !== "CANCELED").reduce((sum, v) => sum + v.amount, 0),
    },
  });
}

const CreateSchema = z.object({
  // Kupujący (pacjent z bazy; nowego klienta formularz zakłada wcześniej przez /api/admin/patients/quick).
  buyerPatientId: z.string().min(1, "Wybierz kupującego").max(100),
  // Imię i nazwisko obdarowanego (voucher imienny); puste = voucher anonimowy.
  recipientName: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().min(2, "Podaj tytuł vouchera").max(120),
  // Kwota w groszach.
  amount: z.number().int().min(100, "Kwota vouchera musi wynosić co najmniej 1 zł").max(100_000_00),
  expiresAt: z.string().optional().nullable(),
  saleMethod: z.enum(["CASH", "CARD", "TRANSFER", "BLIK"]),
  note: z.string().trim().max(500).optional().nullable(),
});

// Sprzedaż vouchera: kupujący z bazy pacjentów, voucher anonimowy lub imienny (dowolne imię i nazwisko).
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ROLES);
  if (deny) return deny;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }
  const { buyerPatientId: patientId, title, amount, saleMethod, note } = parsed.data;
  const recipientName = parsed.data.recipientName?.trim() || null;
  const expiresAt = parseExpiryDate(parsed.data.expiresAt ?? "");
  if (expiresAt === undefined) return NextResponse.json({ ok: false, message: "Niepoprawny termin ważności" }, { status: 400 });
  if (expiresAt && expiresAt.getTime() < Date.now() - 24 * 3600 * 1000) {
    return NextResponse.json({ ok: false, message: "Termin ważności jest w przeszłości" }, { status: 400 });
  }

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, ...scopedLocationWhere(user!) },
    select: { id: true, name: true },
  });
  if (!patient) return NextResponse.json({ ok: false, message: "Nie znaleziono kupującego" }, { status: 404 });

  let voucher = null;
  for (let attempt = 0; attempt < 5 && !voucher; attempt++) {
    try {
      voucher = await prisma.voucher.create({
        data: { code: generateCode("V"), patientId, recipientName, title, amount, expiresAt, saleMethod, note: note || null, createdById: user!.id },
        select: { id: true, code: true },
      });
    } catch (e) {
      // Kolizja kodu — losujemy ponownie.
      if (attempt === 4) throw e;
    }
  }

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "Voucher",
    entityId: voucher!.id,
    summary: `Sprzedaż vouchera ${voucher!.code} „${title}” na ${formatPLNFromGrosze(amount)} — kupujący ${patient.name}, ${
      recipientName ? `imienny dla: ${recipientName}` : "voucher anonimowy"
    }`,
    data: { code: voucher!.code, buyerPatientId: patientId, named: Boolean(recipientName), amount, saleMethod, expiresAt: expiresAt ? expiresAt.toISOString() : null },
  });

  return NextResponse.json({ ok: true, voucher });
}
