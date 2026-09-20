import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit, resolveStaffNames } from "@/lib/audit";
import { auditActionLabel, auditActorLabel, auditEntityLabel } from "@/lib/audit-labels";
import { toCsv } from "@/lib/csv";
import { parseDateInput, warsawWallTimeToUtc } from "@/lib/warsaw-time";

// Dziennik zdarzeń — WYŁĄCZNIE do odczytu i wyłącznie dla administratora.
// Celowo nie ma tu POST/PATCH/DELETE: wpisy powstają tylko przez logAudit()
// w miejscach, gdzie coś się dzieje w aplikacji, i nikt (także admin) nie
// może ich edytować ani usuwać z poziomu aplikacji.

const PAGE_SIZES = [25, 50, 100] as const;
const CSV_MAX_ROWS = 10_000;

// Stare wpisy "NotificationRead" (znaczniki przeczytanych powiadomień sprzed
// przeniesienia ich do osobnej tabeli) to szum, nie zdarzenia — nie pokazujemy.
const HIDDEN_ENTITIES = ["NotificationRead"];

const ACTOR_TYPES = ["STAFF", "PATIENT", "GUEST", "SYSTEM"] as const;
const STAFF_ROLES = ["ADMIN", "RECEPTION", "SPECIALIST"] as const;

function warsawDayStart(value: string | null) {
  const parts = parseDateInput(value);
  return parts ? warsawWallTimeToUtc({ ...parts, hour: 0, minute: 0 }) : null;
}

function warsawNextDayStart(value: string | null) {
  const parts = parseDateInput(value);
  if (!parts) return null;
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return warsawWallTimeToUtc({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: 0,
    minute: 0,
  });
}

function buildWhere(params: URLSearchParams): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [{ entity: { notIn: HIDDEN_ENTITIES } }];

  const from = warsawDayStart(params.get("from"));
  const to = warsawNextDayStart(params.get("to"));
  if (from || to) {
    and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } });
  }

  const actorType = params.get("actorType");
  if (actorType && (ACTOR_TYPES as readonly string[]).includes(actorType)) {
    and.push({ actorType: actorType as (typeof ACTOR_TYPES)[number] });
  }
  const role = params.get("role");
  if (role && (STAFF_ROLES as readonly string[]).includes(role)) {
    and.push({ actorType: "STAFF", actorRole: role });
  }

  const action = params.get("action")?.trim();
  if (action) and.push({ action });
  const entity = params.get("entity")?.trim();
  if (entity) and.push({ entity });

  const actorId = params.get("actorId")?.trim();
  if (actorId) and.push({ actorId });
  const entityId = params.get("entityId")?.trim();
  if (entityId) and.push({ entityId });

  const q = params.get("q")?.trim();
  if (q) {
    const contains = { contains: q, mode: "insensitive" as const };
    and.push({
      OR: [
        { actorName: contains },
        { actorLogin: contains },
        { summary: contains },
        { action: contains },
        { entity: contains },
        { ipAddress: contains },
        { entityId: q },
        { actorId: q },
      ],
    });
  }

  return { AND: and };
}

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  // Strict — celowo bez wyjątku dla uprawnień z menu: tylko rola ADMIN.
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const params = new URL(req.url).searchParams;
  const where = buildWhere(params);

  if (params.get("format") === "csv") {
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: CSV_MAX_ROWS,
    });
    const staffNames = await resolveStaffNames(rows.filter((r) => !r.actorName).map((r) => r.actorId));

    // Sam eksport dziennika to zdarzenie warte zapisania (kto pobrał dane audytowe).
    await logAudit({
      actorId: user!.id,
      action: "EXPORT",
      entity: "AuditLog",
      summary: `Eksport dziennika zdarzeń do pliku CSV (${rows.length} wpisów)`,
      data: { rows: rows.length, filters: Object.fromEntries(params.entries()) },
    });

    const csv = toCsv(
      rows.map((r) => {
        const actorName = r.actorName ?? (r.actorId ? staffNames.get(r.actorId) : null) ?? null;
        return {
          "Data i godzina (Warszawa)": r.createdAt.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }),
          Kto: auditActorLabel({ actorType: r.actorType, actorName, actorRole: r.actorRole }),
          "Login / telefon": r.actorLogin ?? "",
          "ID aktora": r.actorId ?? "",
          Akcja: auditActionLabel(r.action),
          Obiekt: auditEntityLabel(r.entity),
          "ID obiektu": r.entityId ?? "",
          Opis: r.summary ?? "",
          IP: r.ipAddress ?? "",
          Przeglądarka: r.userAgent ?? "",
          Szczegóły: r.data ? JSON.stringify(r.data) : "",
        };
      }),
    );

    const stamp = new Date().toISOString().slice(0, 10);
    // BOM, żeby Excel poprawnie odczytał polskie znaki.
    return new NextResponse("﻿" + csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="logi-derclinic-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  const requestedSize = Number(params.get("pageSize"));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(requestedSize) ? requestedSize : 50;
  const requestedPage = Math.floor(Number(params.get("page")));
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const staffNames = await resolveStaffNames(rows.filter((r) => !r.actorName).map((r) => r.actorId));
  const logs = rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    actorType: r.actorType,
    actorId: r.actorId,
    // starsze wpisy nie mają migawki nazwy — dociągamy aktualną z konta
    actorName: r.actorName ?? (r.actorId ? (staffNames.get(r.actorId) ?? null) : null),
    actorLogin: r.actorLogin,
    actorRole: r.actorRole,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    summary: r.summary,
    data: r.data,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
  }));

  return NextResponse.json({
    ok: true,
    logs,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
}
