import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { formatPLNFromGrosze } from "@/lib/money";
import { packageStandardValue, parseExpiryDate, type BenefitStatus } from "@/lib/vouchers";
import { PACKAGE_INCLUDE, summarizePackage } from "@/lib/package-summary";
import { generateCode } from "@/lib/voucher-code";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "MANAGER", "RECEPTION"];
const PAGE_SIZES = [25, 50, 100];

// Sprzedane pakiety: wyszukiwanie (kupujący, posiadacz, kod, tytuł, usługi), filtr statusu, paginacja; przy każdym
// pozostałe zabiegi w rozbiciu na usługi.
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
    include: PACKAGE_INCLUDE,
    take: 20000,
  });

  const now = new Date();
  const shaped = rows.map((p) => {
    const summary = summarizePackage(p, { now });
    return {
      id: p.id,
      code: p.code,
      title: p.title,
      servicesLabel: summary.servicesLabel,
      items: summary.items,
      sessionsTotal: p.sessionsTotal,
      sessionsLeft: summary.sessionsLeft,
      price: p.price,
      standardValue: p.standardValue,
      expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      saleMethod: p.saleMethod,
      status: summary.status,
      patient: p.patient,
      holder: p.holder,
    };
  });

  const filtered = shaped.filter((p) => {
    if (statusFilter && statusFilter !== "ALL" && p.status !== statusFilter) return false;
    if (!q) return true;
    const phoneQ = q.replace(/\s/g, "");
    return (
      p.code.toLocaleLowerCase("pl").includes(q) ||
      p.title.toLocaleLowerCase("pl").includes(q) ||
      p.servicesLabel.toLocaleLowerCase("pl").includes(q) ||
      [p.patient, p.holder].some(
        (person) =>
          person &&
          (person.name.toLocaleLowerCase("pl").includes(q) || (phoneQ && (person.phone ?? "").replace(/\s/g, "").includes(phoneQ))),
      )
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

const ItemSchema = z.object({
  serviceId: z.string().min(1).max(100),
  sessions: z.number().int().min(1, "Liczba zabiegów musi wynosić co najmniej 1").max(200),
});

const SellSchema = z
  .object({
    // Kupujący (pacjent z bazy; nowego klienta formularz zakłada wcześniej przez /api/admin/patients/quick).
    buyerPatientId: z.string().min(1, "Wybierz kupującego").max(100),
    // Pakiet anonimowy (na okaziciela) albo imienny — dla wskazanego pacjenta.
    holderType: z.enum(["ANONYMOUS", "PATIENT"]),
    holderPatientId: z.string().min(1).max(100).optional().nullable(),
    templateId: z.string().min(1).max(100).optional().nullable(),
    title: z.string().trim().max(120).optional().nullable(),
    items: z.array(ItemSchema).min(1, "Dodaj co najmniej jedną usługę").max(30),
    // Cena całego pakietu w groszach.
    price: z.number().int().min(0).max(100_000_00),
    expiresAt: z.string().optional().nullable(),
    saleMethod: z.enum(["CASH", "CARD", "TRANSFER", "BLIK"]),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((value) => value.holderType === "ANONYMOUS" || Boolean(value.holderPatientId), {
    message: "Wybierz pacjenta, dla którego jest pakiet",
  });

// Sprzedaż pakietu: kupujący, posiadacz (lub pakiet anonimowy), usługi z liczbą zabiegów i cena za całość.
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
  const holderPatientId = input.holderType === "PATIENT" ? input.holderPatientId! : null;

  const people = await prisma.patient.findMany({
    where: { id: { in: [input.buyerPatientId, ...(holderPatientId ? [holderPatientId] : [])] }, ...scopedLocationWhere(user!) },
    select: { id: true, name: true },
  });
  const buyer = people.find((p) => p.id === input.buyerPatientId);
  const holder = holderPatientId ? people.find((p) => p.id === holderPatientId) : null;
  if (!buyer) return NextResponse.json({ ok: false, message: "Nie znaleziono kupującego" }, { status: 404 });
  if (holderPatientId && !holder) return NextResponse.json({ ok: false, message: "Nie znaleziono pacjenta, dla którego jest pakiet" }, { status: 404 });

  const template = input.templateId ? await prisma.packageTemplate.findUnique({ where: { id: input.templateId } }) : null;
  if (input.templateId && !template) return NextResponse.json({ ok: false, message: "Nie znaleziono pakietu w katalogu" }, { status: 404 });

  // Ta sama usługa wpisana dwa razy — sumujemy zabiegi.
  const merged = [
    ...input.items
      .reduce((map, item) => map.set(item.serviceId, (map.get(item.serviceId) ?? 0) + item.sessions), new Map<string, number>())
      .entries(),
  ].map(([serviceId, sessions]) => ({ serviceId, sessions }));
  const services = await prisma.service.findMany({
    where: { id: { in: merged.map((item) => item.serviceId) } },
    select: { id: true, name: true, price: true },
  });
  const serviceMap = new Map(services.map((service) => [service.id, service] as const));
  if (services.length !== merged.length) return NextResponse.json({ ok: false, message: "Nie znaleziono jednej z usług" }, { status: 404 });

  const sessionsTotal = merged.reduce((sum, item) => sum + item.sessions, 0);
  const standardValue = packageStandardValue(merged.map((item) => ({ sessions: item.sessions, unitPrice: serviceMap.get(item.serviceId)!.price })));
  const title =
    input.title?.trim() ||
    template?.name ||
    merged.map((item) => `${serviceMap.get(item.serviceId)!.name} ×${item.sessions}`).join(" + ").slice(0, 120);

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
          patientId: buyer.id,
          holderPatientId: holder?.id ?? null,
          templateId: template?.id ?? null,
          title,
          sessionsTotal,
          price: input.price,
          standardValue,
          expiresAt,
          saleMethod: input.saleMethod,
          note: input.note || null,
          createdById: user!.id,
          items: { create: merged.map((item, position) => ({ serviceId: item.serviceId, sessions: item.sessions, position })) },
        },
        select: { id: true, code: true },
      });
    } catch (e) {
      // Kolizja kodu — losujemy ponownie.
      if (attempt === 4) throw e;
    }
  }

  const servicesLabel = merged.map((item) => `${serviceMap.get(item.serviceId)!.name} ×${item.sessions}`).join(", ");
  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "PatientPackage",
    entityId: pack!.id,
    summary: `Sprzedaż pakietu ${pack!.code} „${title}” (${servicesLabel}; ${formatPLNFromGrosze(input.price)}${
      standardValue !== null ? `, w cenach standardowych ${formatPLNFromGrosze(standardValue)}` : ""
    }) — kupujący ${buyer.name}, ${holder ? `dla: ${holder.name}` : "pakiet anonimowy"}`,
    data: {
      code: pack!.code,
      buyerPatientId: buyer.id,
      holderPatientId: holder?.id ?? null,
      items: merged,
      price: input.price,
      standardValue,
      saleMethod: input.saleMethod,
      templateId: template?.id,
    },
  });
  return NextResponse.json({ ok: true, package: pack });
}
