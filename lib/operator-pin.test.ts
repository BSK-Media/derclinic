import { describe, expect, it } from "vitest";
import { validateOperatorPin } from "./operator-pin";

describe("PIN operatora", () => {
  it("przyjmuje 6 cyfr", () => {
    expect(validateOperatorPin("493021")).toBeNull();
    expect(validateOperatorPin("000012")).toBeNull();
  });
  it("odrzuca zły format", () => {
    expect(validateOperatorPin("12345")).not.toBeNull();
    expect(validateOperatorPin("1234567")).not.toBeNull();
    expect(validateOperatorPin("12a456")).not.toBeNull();
    expect(validateOperatorPin("")).not.toBeNull();
  });
  it("odrzuca PIN-y oczywiste", () => {
    for (const pin of ["000000", "111111", "123456", "654321", "234567"]) {
      expect(validateOperatorPin(pin)).not.toBeNull();
    }
  });
});
