import { patientIdsMatching } from "@/lib/patient-search";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";
import { PATIENT_PUBLIC_SELECT } from "@/lib/patient-select";
import { parseDateInput, warsawWallTimeToUtc } from "@/lib/warsaw-time";

const PAGE_SIZE = 50;

// Historia sprzedaży POS z filtrami: zakres dat (czas warszawski), dokument, status i wyszukiwanie.
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const from = parseDateInput(url.searchParams.get("from"));
  const to = parseDateInput(url.searchParams.get("to"));
  const document = url.searchParams.get("document");
  const status = url.searchParams.get("status");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));

  const createdAt: Prisma.DateTimeFilter = {};
  if (from) createdAt.gte = warsawWallTimeToUtc({ ...from, hour: 0, minute: 0 });
  if (to) {
    const next = new Date(Date.UTC(to.year, to.month - 1, to.day + 1));
    createdAt.lt = warsawWallTimeToUtc({
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: 0,
      minute: 0,
    });
  }

  // Imię pacjenta jest zaszyfrowane — dopasowanie robimy w pamięci i łączymy po identyfikatorach.
  const patientIds = q ? await patientIdsMatching(q, scopedLocationWhere(user!), ["name"]) : [];
  // Dane nabywcy (nazwa, NIP) są zaszyfrowane — dopasowanie w pamięci.
  const buyerSaleIds = q
    ? await prisma.retailSale
        .findMany({
          where: { ...scopedLocationWhere(user!), OR: [{ buyerName: { not: null } }, { buyerNip: { not: null } }] },
          select: { id: true, buyerName: true, buyerNip: true },
        })
        .then((rows) => {
          const needle = q.toLocaleLowerCase("pl");
          const nip = q.replace(/[\s-]/g, "");
          return rows
            .filter((row) => (row.buyerName ?? "").toLocaleLowerCase("pl").includes(needle) || (nip && (row.buyerNip ?? "").includes(nip)))
            .map((row) => row.id);
        })
    : [];

  const where: Prisma.RetailSaleWhereInput = {
    ...scopedLocationWhere(user!),
    ...(from || to ? { createdAt } : {}),
    ...(document === "RECEIPT" || document === "INVOICE" ? { documentType: document } : {}),
    ...(status === "COMPLETED" || status === "CANCELED" ? { status } : {}),
    ...(q
      ? {
          OR: [
            { id: q },
            { note: { contains: q, mode: "insensitive" } },
            ...(buyerSaleIds.length ? [{ id: { in: buyerSaleIds } }] : []),
            ...(patientIds.length ? [{ patientId: { in: patientIds } }] : []),
            { items: { some: { product: { name: { contains: q, mode: "insensitive" } } } } },
            { items: { some: { product: { ean: q } } } },
          ],
        }
      : {}),
  };
  // Podsumowanie liczymy tylko ze sprzedaży zrealizowanych.
  const completedWhere: Prisma.RetailSaleWhereInput = {
    AND: [where, { status: "COMPLETED" }],
  };

  const [count, sales, totals, byDocument, vatByRate] = await Promise.all([
    prisma.retailSale.count({ where }),
    prisma.retailSale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        patient: { select: PATIENT_PUBLIC_SELECT },
        soldBy: { select: { id: true, name: true } },
        discountApprovedBy: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        items: {
          include: { product: { select: { id: true, name: true, sku: true, ean: true, unit: true } } },
        },
        payments: true,
      },
    }),
    prisma.retailSale.aggregate({
      where: completedWhere,
      _count: { _all: true },
      _sum: { total: true, vatAmount: true, discountAmount: true },
    }),
    prisma.retailSale.groupBy({
      by: ["documentType"],
      where: completedWhere,
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.retailSaleItem.groupBy({
      by: ["vatRate"],
      where: { sale: completedWhere },
      _sum: { vatAmount: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    page,
    pageSize: PAGE_SIZE,
    count,
    sales,
    summary: {
      count: totals._count._all,
      total: totals._sum.total ?? 0,
      vatAmount: totals._sum.vatAmount ?? 0,
      discountAmount: totals._sum.discountAmount ?? 0,
      byDocument: byDocument.map((row) => ({
        documentType: row.documentType,
        count: row._count._all,
        total: row._sum.total ?? 0,
      })),
      vatByRate: vatByRate.map((row) => ({ vatRate: row.vatRate, vatAmount: row._sum.vatAmount ?? 0 })),
    },
  });
}
