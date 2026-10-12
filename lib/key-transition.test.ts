import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyAuditEntry, signAuditEntry } from "./audit-signature";
import { blindIndex, blindIndexCandidates, rewritePatientWhere } from "./blind-index";
import { decryptField, encryptField } from "./data-encryption";
import { isSealedWithCurrentKey, keyedHash, keyedHashCandidates, openSecret, sealSecret } from "./secret-box";

// Przejście z kluczy wyprowadzanych z AUTH_SECRET na osobne MFA_/DATA_/AUDIT_ klucze:
// wszystko zapisane starym kluczem musi dalej działać po ustawieniu nowych zmiennych.

const KEYS = ["MFA_ENCRYPTION_KEY", "DATA_ENCRYPTION_KEY", "AUDIT_SIGNING_KEY", "BLIND_INDEX_KEY"];
let saved: Record<string, string | undefined> = {};

// Wartości testowe budowane w locie (min. 32 znaki), żeby nie przypominały prawdziwych sekretów.
const testKey = (label: string) => `${label}:`.padEnd(40, label[0]);

function setNewKeys() {
  process.env.MFA_ENCRYPTION_KEY = testKey("mfa");
  process.env.DATA_ENCRYPTION_KEY = testKey("data");
  process.env.AUDIT_SIGNING_KEY = testKey("audit");
}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const entry = {
  id: "e1",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  actorType: "STAFF",
  actorId: "u1",
  actorName: "Admin",
  actorLogin: "admin",
  actorRole: "ADMIN",
  action: "UPDATE",
  entity: "Product",
  entityId: "p1",
  summary: "Zmiana",
  data: { a: 1 },
  ipAddress: null,
  userAgent: null,
};

describe("przejście na osobne klucze", () => {
  it("sekret 2FA zaszyfrowany kluczem z AUTH_SECRET odczytuje się po ustawieniu MFA_ENCRYPTION_KEY", () => {
    const old = sealSecret("JBSWY3DPEHPK3PXP");
    setNewKeys();
    expect(openSecret(old)).toBe("JBSWY3DPEHPK3PXP");
    expect(isSealedWithCurrentKey(old)).toBe(false);
    expect(isSealedWithCurrentKey(sealSecret("x"))).toBe(true);
  });

  it("stare kody odzyskiwania dalej pasują", () => {
    const oldHash = keyedHash("ABCD-EFGH");
    setNewKeys();
    expect(keyedHashCandidates("ABCD-EFGH")).toContain(oldHash);
    expect(keyedHash("ABCD-EFGH")).not.toBe(oldHash);
  });

  it("wpis dziennika podpisany starym kluczem jest ważny, zmieniony — nie", () => {
    const signature = signAuditEntry(entry);
    setNewKeys();
    expect(verifyAuditEntry({ ...entry, signature })).toBe("valid");
    expect(verifyAuditEntry({ ...entry, summary: "Inna", signature })).toBe("invalid");
    expect(verifyAuditEntry({ ...entry, signature: signAuditEntry(entry) })).toBe("valid");
  });

  it("dane pacjenta zaszyfrowane starym kluczem odszyfrowują się", () => {
    const old = encryptField("Jan Kowalski")!;
    setNewKeys();
    expect(decryptField(old)).toBe("Jan Kowalski");
  });

  it("pacjent z skrótem policzonym starym kluczem dalej się wyszukuje", () => {
    const oldHash = blindIndex("email", "Jan@Example.com")!;
    setNewKeys();
    const newHash = blindIndex("email", "jan@example.com")!;
    expect(newHash).not.toBe(oldHash);
    expect(blindIndexCandidates("email", "jan@example.com")).toEqual([newHash, oldHash]);
    expect(rewritePatientWhere({ email: "jan@example.com" }, true)).toEqual({
      AND: [{ emailHash: { in: [newHash, oldHash] } }],
    });
  });

  it("pusta wartość w wyszukiwaniu oznacza brak skrótu", () => {
    setNewKeys();
    expect(rewritePatientWhere({ phone: "  " }, true)).toEqual({ AND: [{ phoneHash: null }] });
  });

  it("bez nowych kluczy nie ma dodatkowego klucza", () => {
    expect(blindIndexCandidates("phone", "+48 600 100 200")).toHaveLength(1);
  });
});
