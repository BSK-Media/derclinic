import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { verifyAuditEntry } from "@/lib/audit-signature";

const MAX_ENTRIES = 5000;

// Sprawdzenie integralności dziennika zdarzeń (audyt F-11): czy podpisy HMAC
// ostatnich wpisów zgadzają się z ich treścią. Wpis zmieniony bezpośrednio
// w bazie (z pominięciem aplikacji) będzie oznaczony jako "invalid".
// Wpisy sprzed wprowadzenia podpisów są "unsigned".
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: MAX_ENTRIES });
  let valid = 0;
  let unsigned = 0;
  const invalid: { id: string; createdAt: Date; summary: string | null }[] = [];
  for (const entry of entries) {
    const result = verifyAuditEntry(entry);
    if (result === "valid") valid++;
    else if (result === "unsigned") unsigned++;
    else invalid.push({ id: entry.id, createdAt: entry.createdAt, summary: entry.summary });
  }

  await logAudit({
    actorId: user!.id,
    action: "AUDIT_VERIFY",
    entity: "AuditLog",
    summary: `Sprawdzenie integralności dziennika: ${valid} poprawnych, ${invalid.length} zmienionych, ${unsigned} bez podpisu (sprzed wdrożenia)`,
    data: { checked: entries.length, valid, invalid: invalid.length, unsigned },
  });

  return NextResponse.json({
    ok: true,
    checked: entries.length,
    valid,
    unsigned,
    invalidCount: invalid.length,
    invalid: invalid.slice(0, 20),
  });
}
