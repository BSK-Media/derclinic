import { createHmac, timingSafeEqual } from "node:crypto";
import { getKey } from "@/lib/auth-keys";

// Podpis wpisu dziennika zdarzeń (audyt F-11). Klucz nie jest przechowywany
// w bazie, więc osoba z dostępem wyłącznie do bazy nie podrobi podpisu po
// zmianie treści wpisu. Weryfikacja: GET /api/admin/logs/integrity.

export type SignableAuditEntry = {
  id: string;
  createdAt: Date;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  actorLogin: string | null;
  actorRole: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string | null;
  data: unknown;
  ipAddress: string | null;
  userAgent: string | null;
};

// JSON z posortowanymi kluczami — PostgreSQL (jsonb) zmienia kolejność kluczy,
// więc bez tego podpis nie dałby się odtworzyć po odczycie.
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonical(entry: SignableAuditEntry) {
  return stableStringify([
    "v1",
    entry.id,
    entry.createdAt.toISOString(),
    entry.actorType,
    entry.actorId,
    entry.actorName,
    entry.actorLogin,
    entry.actorRole,
    entry.action,
    entry.entity,
    entry.entityId,
    entry.summary,
    entry.data ?? null,
    entry.ipAddress,
    entry.userAgent,
  ]);
}

export function signAuditEntry(entry: SignableAuditEntry) {
  return createHmac("sha256", getKey("audit")).update(canonical(entry)).digest("hex");
}

export function verifyAuditEntry(entry: SignableAuditEntry & { signature: string | null }) {
  if (!entry.signature) return "unsigned" as const;
  const expected = Buffer.from(signAuditEntry(entry), "hex");
  const actual = Buffer.from(entry.signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? ("valid" as const) : ("invalid" as const);
}
