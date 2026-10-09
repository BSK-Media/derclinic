import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { purgeExpiredHolds } from "@/lib/booking-hold-server";
import { purgeExpiredSessions } from "@/lib/session-core";
import { EMAIL_LOG_RETENTION_DAYS, NOTIFICATION_READ_RETENTION_DAYS } from "@/lib/retention";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const DAY = 24 * 60 * 60 * 1000;

// Codzienne sprzątanie danych technicznych zgodnie z polityką przechowywania (lib/retention.ts):
// stary dziennik wysyłki wiadomości, przeczytane powiadomienia, wygasłe sesje, liczniki limitów
// i niewykorzystane zatrzymania terminów. NIE dotyka dokumentacji medycznej ani dziennika zdarzeń.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Brak zmiennej CRON_SECRET" }, { status: 503 });
  }
  if (!authorized(req)) return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });

  const now = Date.now();
  const [emailLogs, notificationReads, rateBuckets] = await Promise.all([
    prisma.emailLog.deleteMany({ where: { createdAt: { lt: new Date(now - EMAIL_LOG_RETENTION_DAYS * DAY) } } }),
    prisma.notificationRead.deleteMany({ where: { createdAt: { lt: new Date(now - NOTIFICATION_READ_RETENTION_DAYS * DAY) } } }),
    prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(now - 2 * DAY) } } }),
  ]);
  await purgeExpiredSessions();
  await purgeExpiredHolds();

  const summary = { emailLogs: emailLogs.count, notificationReads: notificationReads.count, rateBuckets: rateBuckets.count };
  if (summary.emailLogs + summary.notificationReads + summary.rateBuckets > 0) {
    await logAudit({
      actor: { type: "SYSTEM", name: "Sprzątanie danych" },
      action: "DELETE",
      entity: "Maintenance",
      summary: `Sprzątanie danych technicznych: wiadomości ${summary.emailLogs}, powiadomienia ${summary.notificationReads}, liczniki limitów ${summary.rateBuckets}`,
      data: summary,
    });
  }
  return NextResponse.json({ ok: true, ...summary });
}
