import { randomInt } from "node:crypto";

// Kody voucherów i pakietów (tylko serwer).
// Alfabet bez znaków łatwych do pomylenia (0/O, 1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCode(prefix: "V" | "P"): string {
  let body = "";
  for (let i = 0; i < 6; i++) body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${prefix}-${body}`;
}
