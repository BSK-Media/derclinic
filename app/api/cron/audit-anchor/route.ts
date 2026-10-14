import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { verifyAuditEntry } from "@/lib/audit-signature";
import { sendEmail } from "@/lib/mailer";
import {
  buildMonthlyDigest,
  detectAnomalies,
  monthRange,
  previousMonth,
  type DailyAnchor,
} from "@/lib/audit-anchor";

// Kotwica dziennika zdarzeń poza bazą (rejestr luk L-07). Tabela dziennika jest chroniona
// wyzwalaczem (brak UPDATE/DELETE), a wpisy mają podpis HMAC. Kotwica pozwala wykryć przywrócenie
// starszej wersji bazy lub zbiorcze usunięcie wpisów.
//
// Kontrola jest wykonywana CODZIENNIE: skrót SHA-256 z identyfikatorów i podpisów wszystkich wpisów,
// skrót wpisów z ostatniej doby oraz weryfikacja podpisów wpisów z ostatniej doby. Wynik trafia do
// dziennika zdarzeń (AUDIT_ANCHOR), a nocna kopia zapasowa zapisuje kotwicę także w magazynie WORM.
// E-mail do administratorów wychodzi RAZ W MIESIĄCU (1. dnia) jako zestawienie wszystkich dni poprzedniego
// miesiąca; natychmiastowy e-mail ostrzegawczy wysyłamy tylko przy anomalii (spadek liczby wpisów albo
// niepoprawny podpis). Parametr ?month=RRRR-MM wymusza zestawienie za wskazany miesiąc.

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const DAY = 24 * 60 * 60 * 1000;
const PAGE = 5000;

async function adminRecipients() {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", disabledAt: null, email: { not: null } },
    select: { email: true },
  });
  return admins.map((admin) => admin.email!).filter(Boolean);
}

async function sendToAdmins(input: { subject: string; text: string; html: string }) {
  const recipients = await adminRecipients();
  let sent = 0;
  for (const to of recipients) {
    const result = await sendEmail({ to, ...input });
    if (result.ok) sent++;
  }
  return { recipients: recipients.length, sent };
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Brak zmiennej CRON_SECRET" }, { status: 503 });
  }
  if (!authorized(req)) return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });

  const now = new Date();
  const since = new Date(now.getTime() - DAY);

  // --- Codzienna kontrola ------------------------------------------------------------------
  const total = createHash("sha256");
  const recent = createHash("sha256");
  let totalCount = 0;
  let recentCount = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.auditLog.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, createdAt: true, signature: true },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const piece = `${row.id}:${row.signature ?? ""}\n`;
      total.update(piece);
      totalCount++;
      if (row.createdAt >= since) {
        recent.update(piece);
        recentCount++;
      }
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < PAGE) break;
  }

  // Podpisy wpisów z ostatniej doby.
  let valid = 0;
  let invalid = 0;
  let unsigned = 0;
  const lastDay = await prisma.auditLog.findMany({ where: { createdAt: { gte: since } } });
  for (const entry of lastDay) {
    const result = verifyAuditEntry(entry);
    if (result === "valid") valid++;
    else if (result === "invalid") invalid++;
    else unsigned++;
  }

  const anchor: DailyAnchor = {
    at: now.toISOString(),
    totalCount,
    totalHash: total.digest("hex"),
    last24hCount: recentCount,
    last24hHash: recent.digest("hex"),
    checked: lastDay.length,
    valid,
    invalid,
    unsigned,
  };

  const previousRow = await prisma.auditLog.findFirst({
    where: { action: "AUDIT_ANCHOR" },
    orderBy: { createdAt: "desc" },
    select: { data: true },
  });
  const previous = (previousRow?.data as Partial<DailyAnchor> | null) ?? null;
  const anomalies = detectAnomalies(anchor, typeof previous?.totalCount === "number" ? { totalCount: previous.totalCount } : null);

  // --- Natychmiastowe ostrzeżenie tylko przy anomalii ---------------------------------------
  let alert: { recipients: number; sent: number } | null = null;
  if (anomalies.length > 0) {
    alert = await sendToAdmins({
      subject: `DerClinic CRM — OSTRZEŻENIE: nieprawidłowość w dzienniku zdarzeń ${anchor.at.slice(0, 10)}`,
      text:
        `Codzienna kontrola dziennika zdarzeń wykryła nieprawidłowość:\n\n${anomalies.map((a) => `- ${a}`).join("\n")}\n\n` +
        `Czas: ${anchor.at}\nWpisów łącznie: ${anchor.totalCount}\nSkrót całości: ${anchor.totalHash}\n\n` +
        `Sprawdź integralność dziennika w panelu (Logi → sprawdzenie integralności) i porównaj z kotwicą z magazynu kopii zapasowych.`,
      html:
        `<p><strong>Codzienna kontrola dziennika zdarzeń wykryła nieprawidłowość:</strong></p>` +
        `<ul>${anomalies.map((a) => `<li>${a}</li>`).join("")}</ul>` +
        `<p>Czas: ${anchor.at}<br>Wpisów łącznie: ${anchor.totalCount}<br>Skrót całości: <code>${anchor.totalHash}</code></p>` +
        `<p>Sprawdź integralność dziennika w panelu (Logi → sprawdzenie integralności) i porównaj z kotwicą z magazynu kopii zapasowych.</p>`,
    });
  }

  await logAudit({
    actor: { type: "SYSTEM", name: "Kotwica dziennika" },
    action: "AUDIT_ANCHOR",
    entity: "AuditLog",
    summary:
      `Kotwica dziennika zdarzeń: ${totalCount} wpisów; podpisy z doby: ${valid} poprawnych, ${invalid} zmienionych, ${unsigned} bez podpisu` +
      (anomalies.length ? `; ANOMALIE: ${anomalies.length}` : ""),
    data: { ...anchor, anomalies },
  });

  // --- Zestawienie miesięczne (1. dnia miesiąca albo na żądanie ?month=RRRR-MM) -------------
  const forced = new URL(req.url).searchParams.get("month");
  const range = forced && /^\d{4}-(0[1-9]|1[0-2])$/.test(forced) ? monthRange(forced) : now.getUTCDate() === 1 ? previousMonth(now) : null;
  let digest: { month: string; days: number; missingDays: string[]; anomalies: number; recipients: number; sent: number } | { skipped: string } | null = null;
  if (range) {
    const already = await prisma.auditLog.findFirst({
      where: { action: "AUDIT_ANCHOR_DIGEST", entityId: range.key },
      select: { id: true },
    });
    if (already && !forced) {
      digest = { skipped: `zestawienie za ${range.key} zostało już wysłane` };
    } else {
      const anchorRows = await prisma.auditLog.findMany({
        where: { action: "AUDIT_ANCHOR", createdAt: { gte: range.start, lt: range.end } },
        orderBy: { createdAt: "asc" },
        select: { data: true },
      });
      const anchors = anchorRows.map((row) => row.data as unknown as DailyAnchor).filter((value) => value && typeof value.at === "string");
      const built = buildMonthlyDigest(range.key, anchors);
      const delivery = await sendToAdmins({ subject: built.subject, text: built.text, html: built.html });
      await logAudit({
        actor: { type: "SYSTEM", name: "Kotwica dziennika" },
        action: "AUDIT_ANCHOR_DIGEST",
        entity: "AuditLog",
        entityId: range.key,
        summary: `Zestawienie miesięczne kotwic dziennika wysłane do ${delivery.sent} z ${delivery.recipients} administratorów — ${built.summary}`,
        data: { month: range.key, days: built.days, missingDays: built.missingDays, anomalies: built.anomalies },
      });
      digest = { month: range.key, days: built.days, missingDays: built.missingDays, anomalies: built.anomalies, ...delivery };
    }
  }

  return NextResponse.json({ ok: true, ...anchor, anomalies, alert, digest });
}
