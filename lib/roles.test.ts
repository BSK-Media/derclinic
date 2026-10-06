import { describe, expect, it } from "vitest";
import { canAccessSpecialistAppointment, canManageAccount, isAdminLike, manageableRoles } from "./roles";

describe("role", () => {
  it("manager zakłada tylko niższe role, admin każdą", () => {
    expect(manageableRoles("MANAGER")).toEqual(["RECEPTION", "SPECIALIST"]);
    expect(manageableRoles("ADMIN")).toContain("MANAGER");
    expect(manageableRoles("ADMIN")).toContain("ADMIN");
    expect(manageableRoles("RECEPTION")).toEqual([]);
    expect(manageableRoles("SPECIALIST")).toEqual([]);
  });

  it("isAdminLike obejmuje admina i managera", () => {
    expect(isAdminLike("ADMIN")).toBe(true);
    expect(isAdminLike("MANAGER")).toBe(true);
    expect(isAdminLike("RECEPTION")).toBe(false);
    expect(isAdminLike(undefined)).toBe(false);
  });

  it("manager zarządza kontami niższych ról tylko w swojej lokalizacji", () => {
    const manager = { role: "MANAGER", locationId: "a" };
    expect(canManageAccount(manager, { role: "RECEPTION", locationId: "a" })).toBe(true);
    expect(canManageAccount(manager, { role: "SPECIALIST", locationId: "a" })).toBe(true);
    expect(canManageAccount(manager, { role: "RECEPTION", locationId: "b" })).toBe(false);
    expect(canManageAccount(manager, { role: "MANAGER", locationId: "a" })).toBe(false);
    expect(canManageAccount(manager, { role: "ADMIN", locationId: "a" })).toBe(false);
    expect(canManageAccount({ role: "ADMIN", locationId: "a" }, { role: "MANAGER", locationId: "z" })).toBe(true);
    expect(canManageAccount({ role: "RECEPTION", locationId: "a" }, { role: "SPECIALIST", locationId: "a" })).toBe(false);
  });

  it("dostęp do wizyty specjalisty: admin każda, manager z lokalizacji, reszta własne", () => {
    const appt = { specialistId: "s1", locationId: "a" };
    expect(canAccessSpecialistAppointment({ id: "x", role: "ADMIN", locationId: "q" }, appt)).toBe(true);
    expect(canAccessSpecialistAppointment({ id: "x", role: "MANAGER", locationId: "a" }, appt)).toBe(true);
    expect(canAccessSpecialistAppointment({ id: "x", role: "MANAGER", locationId: "b" }, appt)).toBe(false);
    expect(canAccessSpecialistAppointment({ id: "s1", role: "SPECIALIST", locationId: "a" }, appt)).toBe(true);
    expect(canAccessSpecialistAppointment({ id: "s2", role: "SPECIALIST", locationId: "a" }, appt)).toBe(false);
  });
});
