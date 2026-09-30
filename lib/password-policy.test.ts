import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH, validatePassword } from "./password-policy";

describe("validatePassword", () => {
  it("akceptuje długie, nieoczywiste hasło", () => {
    expect(validatePassword("zielony-kubek-latarnia-7")).toBeNull();
    expect(validatePassword("Xk9#mQ2!vL7@pR4z")).toBeNull();
  });

  it(`odrzuca hasła krótsze niż ${PASSWORD_MIN_LENGTH} znaków`, () => {
    expect(validatePassword("admin")).toMatch(/co najmniej 12/);
    expect(validatePassword("Abc123!xyz")).toMatch(/co najmniej 12/);
    expect(validatePassword("")).toBe("Podaj hasło");
  });

  it("odrzuca dawne hasła domyślne i popularne hasła", () => {
    expect(validatePassword("DerClinic2026!")).not.toBeNull();
    expect(validatePassword("password1234")).not.toBeNull();
    expect(validatePassword("QWERTYUIOP123")).not.toBeNull();
  });

  it("odrzuca trywialne ciągi", () => {
    expect(validatePassword("aaaaaaaaaaaaaaa")).not.toBeNull();
    expect(validatePassword("123456789012345")).not.toBeNull();
    expect(validatePassword("abababababababab")).not.toBeNull();
  });

  it("odrzuca hasła oparte na loginie, imieniu, e-mailu lub telefonie", () => {
    expect(validatePassword("jkowalski2024!", { login: "jkowalski" })).not.toBeNull();
    expect(validatePassword("Kowalska1990!!", { name: "Anna Kowalska" })).not.toBeNull();
    expect(validatePassword("anna.nowak#2024", { email: "anna.nowak@example.com" })).not.toBeNull();
    expect(validatePassword("x600700800xyz", { phone: "+48600700800" })).not.toBeNull();
  });

  it("dopuszcza imię jako część dłuższego hasła", () => {
    expect(validatePassword("anna-lubi-zielone-jablka", { name: "Anna Kowalska" })).toBeNull();
  });

  it("odrzuca hasło dłuższe niż 72 bajty (limit bcrypt)", () => {
    expect(validatePassword("a1b2c3d4e5".repeat(8))).toMatch(/za długie/);
  });
});
