import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import * as pkijs from "pkijs";
import {
  appointmentIdFromConsentToken,
  buildConsentPdf,
  consentToken,
  verifySignedConsent,
} from "./procedure-consent";

const fonts = {
  regular: new Uint8Array(readFileSync("public/fonts/DejaVuSans.ttf")),
  bold: new Uint8Array(readFileSync("public/fonts/DejaVuSans-Bold.ttf")),
};

const data = {
  appointmentId: "appt123",
  patientName: "Zażółć Gęślą",
  serviceName: "Peeling kwasowy",
  specialistName: "Joanna Sankowska",
  locationName: "Grodzisk Mazowiecki",
  startsAt: new Date("2026-10-12T06:15:00.000Z"),
};

const PLACEHOLDER = "0000000000";

/** Składa "podpisany" PDF: oryginał + słownik podpisu z ByteRange i podpisem CMS (jak PAdES). */
async function signLikePades(original: Uint8Array) {
  const subtle = webcrypto.subtle as unknown as SubtleCrypto;
  pkijs.setEngine("test", new pkijs.CryptoEngine({ name: "test", crypto: webcrypto as unknown as Crypto, subtle }));

  const keys = (await subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048 },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;

  const cert = new pkijs.Certificate();
  cert.version = 2;
  cert.serialNumber = new (await import("asn1js")).Integer({ value: 1 });
  const cn = (value: string) =>
    new pkijs.AttributeTypeAndValue({ type: "2.5.4.3", value: new (await_asn1().Utf8String)({ value }) });
  cert.subject.typesAndValues.push(cn("Jan Testowy"));
  cert.issuer.typesAndValues.push(cn("Testowy Wystawca"));
  cert.notBefore.value = new Date(Date.now() - 3600_000);
  cert.notAfter.value = new Date(Date.now() + 3600_000);
  await cert.subjectPublicKeyInfo.importKey(keys.publicKey);
  await cert.sign(keys.privateKey, "SHA-256");

  const part1Head = Buffer.concat([
    Buffer.from(original),
    Buffer.from(
      `\n9 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached /ByteRange [0 ${PLACEHOLDER} ${PLACEHOLDER} ${PLACEHOLDER}] /Contents `,
      "latin1",
    ),
  ]);
  const reserve = 8192; // bajtów DER; w pliku zapisane szesnastkowo
  const hexPart = Buffer.from(`<${"0".repeat(reserve * 2)}>`, "latin1");
  const tail = Buffer.from("\n>>\nendobj\n%%EOF\n", "latin1");

  const b = part1Head.length;
  const c = b + hexPart.length;
  const d = tail.length;
  const ranges = `[0 ${String(b).padStart(10, "0")} ${String(c).padStart(10, "0")} ${String(d).padStart(10, "0")}]`;
  const patchedHead = Buffer.from(
    part1Head.toString("latin1").replace(`[0 ${PLACEHOLDER} ${PLACEHOLDER} ${PLACEHOLDER}]`, ranges),
    "latin1",
  );

  const signedBytes = Buffer.concat([patchedHead, tail]);
  const signedData = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: "1.2.840.113549.1.7.1" }),
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }),
      }),
    ],
    certificates: [cert],
  });
  await signedData.sign(
    keys.privateKey,
    0,
    "SHA-256",
    signedBytes.buffer.slice(signedBytes.byteOffset, signedBytes.byteOffset + signedBytes.byteLength) as ArrayBuffer,
  );
  const contentInfo = new pkijs.ContentInfo({ contentType: "1.2.840.113549.1.7.2", content: signedData.toSchema(true) });
  const der = Buffer.from(contentInfo.toSchema().toBER(false));
  const hex = der.toString("hex").padEnd(reserve * 2, "0");

  return Buffer.concat([patchedHead, Buffer.from(`<${hex}>`, "latin1"), tail]);
}

// asn1js ładowane synchronicznie dla pomocnika powyżej
// eslint-disable-next-line @typescript-eslint/no-require-imports
function await_asn1() {
  return require("asn1js") as typeof import("asn1js");
}

describe("zgoda na zabieg", () => {
  let original: Uint8Array;
  beforeAll(async () => {
    original = await buildConsentPdf(data, fonts);
  });

  it("generuje PDF ze znacznikiem wizyty w metadanych", () => {
    const text = Buffer.from(original).toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("DERCLINIC-CONSENT:appt123");
    expect(original.length).toBeGreaterThan(5_000);
  });

  it("link do zgody działa tylko z poprawnym podpisem", () => {
    const token = consentToken("appt123");
    expect(appointmentIdFromConsentToken(token)).toBe("appt123");
    expect(appointmentIdFromConsentToken(token.replace("appt123", "appt999"))).toBeNull();
    expect(appointmentIdFromConsentToken("appt123.zly")).toBeNull();
  });

  it("odrzuca niepodpisany plik, nie-PDF i plik bez podpisu", async () => {
    expect((await verifySignedConsent(original, "appt123")).outcome).toBe("REJECTED");
    expect((await verifySignedConsent(new TextEncoder().encode("to nie jest pdf"), "appt123")).outcome).toBe("REJECTED");
  });

  it("XML (XAdES) kieruje do weryfikacji ręcznej", async () => {
    const xml = new TextEncoder().encode('<?xml version="1.0"?><root><ds:Signature/></root>');
    expect((await verifySignedConsent(xml, "appt123")).outcome).toBe("PENDING_REVIEW");
  });

  it("przyjmuje poprawnie podpisany dokument tej wizyty", async () => {
    const signed = await signLikePades(original);
    const result = await verifySignedConsent(new Uint8Array(signed), "appt123");
    expect(result.reason).toBeNull();
    expect(result.outcome).toBe("ACCEPTED");
    expect(result.details.signer).toBe("Jan Testowy");
  });

  it("odrzuca dokument zmieniony po podpisaniu", async () => {
    const signed = Buffer.from(await signLikePades(original));
    signed[200] = signed[200] ^ 0xff; // zmiana bajtu w podpisanym zakresie
    const result = await verifySignedConsent(new Uint8Array(signed), "appt123");
    expect(result.outcome).toBe("REJECTED");
  });

  it("odrzuca dopisane dane po podpisie", async () => {
    const signed = Buffer.concat([await signLikePades(original), Buffer.from("\nDOPISEK")]);
    const result = await verifySignedConsent(new Uint8Array(signed), "appt123");
    expect(result.outcome).toBe("REJECTED");
  });

  it("odrzuca zgodę do innej wizyty", async () => {
    const signed = await signLikePades(original);
    const result = await verifySignedConsent(new Uint8Array(signed), "appt-INNA");
    expect(result.outcome).toBe("REJECTED");
    expect(result.reason).toContain("innej wizyty");
  });
});
