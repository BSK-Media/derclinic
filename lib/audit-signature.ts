import { createHmac, timingSafeEqual } from "node:crypto";
import { getKey, getVerificationKeys } from "@/lib/auth-keys";

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

function signWith(key: Uint8Array, entry: SignableAuditEntry) {
  return createHmac("sha256", key).update(canonical(entry)).digest("hex");
}

export function signAuditEntry(entry: SignableAuditEntry) {
  return signWith(getKey("audit"), entry);
}

// Wpisy podpisane przed ustawieniem AUDIT_SIGNING_KEY (kluczem z AUTH_SECRET) też są ważne.
export function verifyAuditEntry(entry: SignableAuditEntry & { signature: string | null }) {
  if (!entry.signature) return "unsigned" as const;
  const actual = Buffer.from(entry.signature, "hex");
  for (const key of getVerificationKeys("audit")) {
    const expected = Buffer.from(signWith(key, entry), "hex");
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return "valid" as const;
  }
  return "invalid" as const;
}
