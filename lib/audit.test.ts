import { beforeEach, describe, expect, it, vi } from "vitest";

const auditCreate = vi.fn();
const userFindUnique = vi.fn();
const headerStore = new Map<string, string>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { create: (...args: unknown[]) => auditCreate(...args) },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args), findMany: vi.fn() },
  },
}));
vi.mock("next/headers", () => ({
  headers: () => ({ get: (name: string) => headerStore.get(name.toLowerCase()) ?? null }),
}));

import { logAudit } from "./audit";

beforeEach(() => {
  auditCreate.mockReset();
  userFindUnique.mockReset();
  headerStore.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("logAudit", () => {
  it("zapisuje migawkę pracownika (imię, login, rola) oraz IP i przeglądarkę", async () => {
    userFindUnique.mockResolvedValue({ name: "Anna Nowak", login: "anowak", role: "RECEPTION" });
    headerStore.set("x-forwarded-for", "203.0.113.7, 10.0.0.1");
    headerStore.set("user-agent", "Mozilla/5.0 (iPhone)");

    await logAudit({
      actorId: "u1",
      action: "UPDATE",
      entity: "Appointment",
      entityId: "a1",
      summary: "Zmiana statusu wizyty",
      data: { changes: { status: { from: "SCHEDULED", to: "COMPLETED" } } },
    });

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const { data } = auditCreate.mock.calls[0][0];
    expect(data).toMatchObject({
      actorType: "STAFF",
      actorId: "u1",
      actorName: "Anna Nowak",
      actorLogin: "anowak",
      actorRole: "RECEPTION",
      action: "UPDATE",
      entity: "Appointment",
      entityId: "a1",
      summary: "Zmiana statusu wizyty",
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0 (iPhone)",
    });
    expect(data.data.changes.status).toEqual({ from: "SCHEDULED", to: "COMPLETED" });
  });

  it("gość i pacjent nie mają konta pracownika — nie odpytujemy User", async () => {
    await logAudit({
      actor: { type: "GUEST", name: "Jan Kowalski", contact: "+48123456789" },
      action: "CREATE",
      entity: "Appointment",
    });
    await logAudit({
      actor: { type: "PATIENT", id: "p1", name: "Ewa Test", contact: "+48111222333" },
      action: "LOGIN",
      entity: "PatientAccount",
    });

    expect(userFindUnique).not.toHaveBeenCalled();
    const guest = auditCreate.mock.calls[0][0].data;
    const patient = auditCreate.mock.calls[1][0].data;
    expect(guest).toMatchObject({ actorType: "GUEST", actorId: null, actorName: "Jan Kowalski", actorLogin: "+48123456789" });
    expect(patient).toMatchObject({ actorType: "PATIENT", actorId: "p1", actorName: "Ewa Test", actorRole: null });
  });

  it("nigdy nie zapisuje haseł, tokenów ani zdjęć", async () => {
    userFindUnique.mockResolvedValue({ name: "Admin", login: "admin", role: "ADMIN" });
    await logAudit({
      actorId: "u1",
      action: "UPDATE",
      entity: "User",
      data: {
        password: "tajne123",
        passwordHash: "$2a$10$xyz",
        passwordResetTokenHash: "abc",
        avatarUrl: "data:image/png;base64,AAAA",
        name: "Zwykłe pole",
      },
    });
    const saved = auditCreate.mock.calls[0][0].data.data;
    expect(saved.password).toBe("[ukryte]");
    expect(saved.passwordHash).toBe("[ukryte]");
    expect(saved.passwordResetTokenHash).toBe("[ukryte]");
    expect(saved.avatarUrl).toBe("[dane binarne]");
    expect(saved.name).toBe("Zwykłe pole");
    expect(JSON.stringify(saved)).not.toContain("tajne123");
  });

  it("bez transakcji błąd zapisu nie przerywa żądania, ale trafia do logu serwera", async () => {
    userFindUnique.mockResolvedValue({ name: "A", login: "a", role: "ADMIN" });
    auditCreate.mockRejectedValue(new Error("db down"));

    await expect(logAudit({ actorId: "u1", action: "CREATE", entity: "Patient" })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("z transakcją błąd zapisu jest rzucany dalej (zmiana i log wycofują się razem)", async () => {
    const txAuditCreate = vi.fn().mockRejectedValue(new Error("db down"));
    const tx: any = {
      auditLog: { create: txAuditCreate },
      user: { findUnique: vi.fn().mockResolvedValue({ name: "A", login: "a", role: "ADMIN" }) },
    };

    await expect(logAudit({ tx, actorId: "u1", action: "CREATE", entity: "Patient" })).rejects.toThrow("db down");
    // użyto klienta transakcji, nie globalnego
    expect(txAuditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("działa poza kontekstem żądania (brak nagłówków) — zapisuje bez IP", async () => {
    userFindUnique.mockResolvedValue({ name: "A", login: "a", role: "ADMIN" });
    await logAudit({ actorId: "u1", action: "LOGIN", entity: "User" });
    const { data } = auditCreate.mock.calls[0][0];
    expect(data.ipAddress).toBeNull();
    expect(data.userAgent).toBeNull();
  });
});
