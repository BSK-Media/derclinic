import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/mailer";

// Kotwica dziennika zdarzeń poza bazą (rejestr luk L-07). Tabela dziennika jest chroniona
// wyzwalaczem (brak UPDATE/DELETE), a wpisy mają podpis HMAC. Brakuje kopii POZA bazą, która
// pozwoliłaby wykryć przywrócenie starszej wersji bazy lub zbiorcze usunięcie wpisów.
// Raz na dobę wysyłamy administratorom e-mailem: liczbę wpisów, skrót z podpisów wpisów z ostatniej
// doby i skrót z całego dziennika. Skrót z całości można później przeliczyć i porównać z e-mailem.

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const DAY = 24 * 60 * 60 * 1000;
const PAGE = 5000;

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Brak zmiennej CRON_SECRET" }, { status: 503 });
  }
  if (!authorized(req)) return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });

  const since = new Date(Date.now() - DAY);
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

  const anchor = {
    at: new Date().toISOString(),
    totalCount,
    totalHash: total.digest("hex"),
    last24hCount: recentCount,
    last24hHash: recent.digest("hex"),
  };

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", disabledAt: null, email: { not: null } },
    select: { email: true },
  });
  let sent = 0;
  for (const admin of admins) {
    const result = await sendEmail({
      to: admin.email!,
      subject: `DerClinic OS — kotwica dziennika zdarzeń ${anchor.at.slice(0, 10)}`,
      text:
        `Kotwica dziennika zdarzeń (kopia poza bazą danych).\n\n` +
        `Czas: ${anchor.at}\n` +
        `Wpisów łącznie: ${anchor.totalCount}\nSkrót całości: ${anchor.totalHash}\n` +
        `Wpisów z ostatniej doby: ${anchor.last24hCount}\nSkrót ostatniej doby: ${anchor.last24hHash}\n\n` +
        `Zachowaj tę wiadomość. Zmniejszenie liczby wpisów lub niezgodny skrót w późniejszej kotwicy ` +
        `oznacza ingerencję w dziennik.`,
      html:
        `<p><strong>Kotwica dziennika zdarzeń</strong> (kopia poza bazą danych)</p>` +
        `<p>Czas: ${anchor.at}<br>Wpisów łącznie: ${anchor.totalCount}<br>Skrót całości: <code>${anchor.totalHash}</code><br>` +
        `Wpisów z ostatniej doby: ${anchor.last24hCount}<br>Skrót ostatniej doby: <code>${anchor.last24hHash}</code></p>` +
        `<p>Zachowaj tę wiadomość. Zmniejszenie liczby wpisów lub niezgodny skrót w późniejszej kotwicy oznacza ingerencję w dziennik.</p>`,
    });
    if (result.ok) sent++;
  }

  await logAudit({
    actor: { type: "SYSTEM", name: "Kotwica dziennika" },
    action: "AUDIT_ANCHOR",
    entity: "AuditLog",
    summary: `Kotwica dziennika zdarzeń: ${totalCount} wpisów, wysłano do ${sent} z ${admins.length} administratorów`,
    data: anchor,
  });

  return NextResponse.json({ ok: true, ...anchor, recipients: admins.length, sent });
}
