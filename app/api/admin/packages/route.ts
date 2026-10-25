import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { formatPLNFromGrosze } from "@/lib/money";
import { benefitStatus, packageSessionsLeft, parseExpiryDate, type BenefitStatus } from "@/lib/vouchers";
import { generateCode } from "@/lib/voucher-code";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "MANAGER", "RECEPTION"];
const PAGE_SIZES = [25, 50, 100];

// Pakiety sprzedane pacjentom: wyszukiwanie, filtr statusu, paginacja; przy każdym liczba pozostałych zabiegów.
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

  const rows = await prisma.patientPackage.findMany({
    where: { patient: { ...scopedLocationWhere(user!) } },
    orderBy: { createdAt: "desc" },
    include: {
      patient: { select: { id: true, name: true, phone: true } },
      service: { select: { name: true } },
      payments: { select: { packageSessions: true } },
    },
    take: 20000,
  });

  const now = new Date();
  const shaped = rows.map((p) => {
    const left = packageSessionsLeft(p.sessionsTotal, p.payments);
    return {
      id: p.id,
      code: p.code,
      title: p.title,
      serviceName: p.service?.name ?? null,
      sessionsTotal: p.sessionsTotal,
      sessionsLeft: left,
      price: p.price,
      expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      saleMethod: p.saleMethod,
      status: benefitStatus({ canceledAt: p.canceledAt, expiresAt: p.expiresAt, remaining: left, now }),
      patient: p.patient,
    };
  });

  const filtered = shaped.filter((p) => {
    if (statusFilter && statusFilter !== "ALL" && p.status !== statusFilter) return false;
    if (!q) return true;
    return (
      p.code.toLocaleLowerCase("pl").includes(q) ||
      p.title.toLocaleLowerCase("pl").includes(q) ||
      p.patient.name.toLocaleLowerCase("pl").includes(q) ||
      (p.patient.phone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))
    );
  });

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(url.searchParams.get("page")) || 1), pageCount);
  const active = shaped.filter((p) => p.status === "ACTIVE");
  return NextResponse.json({
    ok: true,
    packages: filtered.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    pageCount,
    summary: {
      activeCount: active.length,
      sessionsLeft: active.reduce((sum, p) => sum + p.sessionsLeft, 0),
      soldTotal: shaped.filter((p) => p.status !== "CANCELED").reduce((sum, p) => sum + p.price, 0),
    },
  });
}

const SellSchema = z.object({
  patientId: z.string().min(1).max(100),
  // Z katalogu (wtedy pozostałe pola są domyślnie brane z szablonu) albo własny pakiet.
  templateId: z.string().min(1).max(100).optional().nullable(),
  title: z.string().trim().min(2).max(120).optional(),
  sessions: z.number().int().min(1).max(200).optional(),
  // Cena w groszach.
  price: z.number().int().min(0).max(100_000_00).optional(),
  serviceId: z.string().min(1).max(100).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  saleMethod: z.enum(["CASH", "CARD", "TRANSFER", "BLIK"]),
  note: z.string().trim().max(500).optional().nullable(),
});

// Sprzedaż pakietu pacjentowi.
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ROLES);
  if (deny) return deny;

  const parsed = SellSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }
  const input = parsed.data;

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, ...scopedLocationWhere(user!) },
    select: { id: true, name: true },
  });
  if (!patient) return NextResponse.json({ ok: false, message: "Nie znaleziono pacjenta" }, { status: 404 });

  const template = input.templateId ? await prisma.packageTemplate.findUnique({ where: { id: input.templateId } }) : null;
  if (input.templateId && !template) return NextResponse.json({ ok: false, message: "Nie znaleziono pakietu w katalogu" }, { status: 404 });

  const title = input.title ?? template?.name;
  const sessions = input.sessions ?? template?.sessions;
  const price = input.price ?? template?.price;
  if (!title || !sessions || price === undefined) {
    return NextResponse.json({ ok: false, message: "Podaj tytuł, liczbę zabiegów i cenę pakietu" }, { status: 400 });
  }
  const serviceId = input.serviceId === undefined ? (template?.serviceId ?? null) : input.serviceId;

  // Termin: wpisany ręcznie, a w jego braku ważność z katalogu liczona od dziś.
  let expiresAt: Date | null | undefined = parseExpiryDate(input.expiresAt ?? "");
  if (expiresAt === undefined) return NextResponse.json({ ok: false, message: "Niepoprawny termin ważności" }, { status: 400 });
  if (!expiresAt && !input.expiresAt && template?.validityDays) {
    expiresAt = new Date(Date.now() + template.validityDays * 24 * 3600 * 1000);
    expiresAt.setUTCHours(0, 0, 0, 0);
  }

  let pack = null;
  for (let attempt = 0; attempt < 5 && !pack; attempt++) {
    try {
      pack = await prisma.patientPackage.create({
        data: {
          code: generateCode("P"),
          patientId: patient.id,
          templateId: template?.id ?? null,
          title,
          serviceId,
          sessionsTotal: sessions,
          price,
          expiresAt,
          saleMethod: input.saleMethod,
          note: input.note || null,
          createdById: user!.id,
        },
        select: { id: true, code: true },
      });
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "PatientPackage",
    entityId: pack!.id,
    summary: `Sprzedaż pakietu ${pack!.code} „${title}” (${sessions} zabiegów, ${formatPLNFromGrosze(price)}) pacjentowi ${patient.name}`,
    data: { code: pack!.code, patientId: patient.id, sessions, price, serviceId, saleMethod: input.saleMethod, templateId: template?.id },
  });
  return NextResponse.json({ ok: true, package: pack });
}
