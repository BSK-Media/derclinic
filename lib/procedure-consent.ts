import { constants, createHash, publicDecrypt, timingSafeEqual, webcrypto, X509Certificate } from "node:crypto";
import { PDFDict, PDFDocument, PDFName, PDFString, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as pkijs from "pkijs";
import * as asn1js from "asn1js";

// Zgoda pacjenta na zabieg: dokument PDF generowany dla wizyty, podpisywany
// przez pacjenta elektronicznie (np. podpisem zaufanym — usługa gov.pl) i
// wgrywany z powrotem. Ten moduł: link do zgody (token), generowanie PDF i
// automatyczna weryfikacja podpisu.

export const GOV_SIGN_URL = "https://www.gov.pl/web/gov/podpisz-dokument-elektronicznie-wykorzystaj-podpis-zaufany";

// Znacznik zapisywany w metadanych PDF — po podpisaniu (PAdES dopisuje podpis
// na końcu pliku) pozwala sprawdzić, że podpisano zgodę do TEJ wizyty.
export const CONSENT_MARKER_PREFIX = "DERCLINIC-CONSENT:";

export type ConsentStatus = "NOT_REQUIRED" | "NOT_SIGNED" | "PENDING_REVIEW" | "SIGNED";

export const CONSENT_STATUS_LABELS: Record<string, string> = {
  NOT_REQUIRED: "Zgoda niewymagana",
  NOT_SIGNED: "Zgoda niepodpisana",
  PENDING_REVIEW: "Zgoda czeka na weryfikację",
  SIGNED: "Zgoda podpisana",
};

export const CONSENT_FORFEIT_WARNING =
  "Niepodpisanie zgody do chwili zabiegu skutkuje anulowaniem rezerwacji i utratą zaliczki.";

/** Czy zgoda nadal wymaga działania pacjenta (nie została przyjęta ani złożona). */
export function consentIsOutstanding(status: string | null | undefined) {
  return status === "NOT_SIGNED";
}

// Link do zgody (token, adres strony) — lib/consent-link.ts.
export { appointmentIdFromConsentToken, consentPageUrl, consentToken } from "@/lib/consent-link";

// --- Generowanie PDF -------------------------------------------------------------

export type ConsentDocumentData = {
  appointmentId: string;
  patientName: string;
  serviceName: string;
  specialistName: string;
  locationName: string | null;
  startsAt: Date;
};

// UWAGA: poniższa treść to ROBOCZY wzór. Przed użyciem produkcyjnym musi ją
// zatwierdzić osoba odpowiedzialna za dokumentację medyczną i zgodność prawną
// (zakres informacji o zabiegu, ryzyku i przeciwwskazaniach).
export const CONSENT_PARAGRAPHS: { heading: string; text: string }[] = [
  {
    heading: "1. Informacja o zabiegu",
    text: "Oświadczam, że lekarz / specjalista udzielił mi w zrozumiały sposób informacji o rodzaju zabiegu, jego celu, przebiegu, spodziewanych efektach, możliwych działaniach niepożądanych i powikłaniach oraz o dostępnych alternatywach. Miałam/em możliwość zadawania pytań i otrzymałam/em na nie odpowiedzi.",
  },
  {
    heading: "2. Stan zdrowia",
    text: "Oświadczam, że podałam/em prawdziwe informacje o moim stanie zdrowia, przyjmowanych lekach, uczuleniach, chorobach przewlekłych oraz ewentualnej ciąży lub karmieniu piersią i zobowiązuję się niezwłocznie zgłosić specjaliście wszelkie zmiany w tym zakresie.",
  },
  {
    heading: "3. Zgoda na wykonanie zabiegu",
    text: "Świadomie i dobrowolnie wyrażam zgodę na wykonanie opisanego powyżej zabiegu. Wiem, że w każdej chwili mogę wycofać zgodę przed rozpoczęciem zabiegu.",
  },
  {
    heading: "4. Zalecenia po zabiegu",
    text: "Zobowiązuję się do stosowania zaleceń po zabiegu przekazanych przez specjalistę oraz do zgłoszenia się na kontrolę w razie niepokojących objawów.",
  },
  {
    heading: "5. Skutki niepodpisania zgody",
    text: "Przyjmuję do wiadomości, że niepodpisanie niniejszej zgody do chwili rozpoczęcia zabiegu skutkuje anulowaniem rezerwacji i utratą wpłaconej zaliczki.",
  },
];

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function buildConsentPdf(
  data: ConsentDocumentData,
  fonts: { regular: Uint8Array; bold: Uint8Array },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });

  pdf.setTitle("Zgoda pacjenta na zabieg — DerClinic");
  pdf.setAuthor("DerClinic");
  pdf.setSubject("Zgoda pacjenta na zabieg");
  // Znacznik wizyty w osobnym polu słownika Info, jako zwykły (nieszyfrowany) tekst —
  // setKeywords/setSubject zapisują tekst szesnastkowo i nie dałoby się go odszukać w pliku.
  const infoRef = pdf.context.trailerInfo.Info;
  const info = infoRef ? pdf.context.lookup(infoRef, PDFDict) : undefined;
  info?.set(PDFName.of("DerClinicConsent"), PDFString.of(`${CONSENT_MARKER_PREFIX}${data.appointmentId}`));
  pdf.setCreator("DerClinic");

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 56;
  const textWidth = pageWidth - margin * 2;
  const ink = rgb(0.13, 0.13, 0.16);
  const accent = rgb(0.486, 0.227, 0.929);

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };
  const draw = (text: string, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10.5;
    for (const line of wrap(text, font, size, textWidth)) {
      ensureSpace(size + 4);
      page.drawText(line, { x: margin, y: y - size, size, font, color: opts.color ?? ink });
      y -= size + 4;
    }
    y -= opts.gap ?? 0;
  };

  draw("DerClinic", { font: bold, size: 12, color: accent, gap: 4 });
  draw("ZGODA PACJENTA NA ZABIEG", { font: bold, size: 18, gap: 14 });

  const when = data.startsAt.toLocaleString("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const rows: [string, string][] = [
    ["Pacjent", data.patientName],
    ["Zabieg", data.serviceName],
    ["Termin", when],
    ["Specjalista", data.specialistName],
    ["Miejsce", data.locationName ? `DerClinic, ${data.locationName}` : "DerClinic"],
  ];
  for (const [label, value] of rows) {
    ensureSpace(18);
    page.drawText(`${label}:`, { x: margin, y: y - 10.5, size: 10.5, font: bold, color: ink });
    const lines = wrap(value, regular, 10.5, textWidth - 90);
    lines.forEach((line, index) => {
      page.drawText(line, { x: margin + 90, y: y - 10.5 - index * 14.5, size: 10.5, font: regular, color: ink });
    });
    y -= Math.max(1, lines.length) * 14.5 + 2;
  }
  y -= 10;

  for (const paragraph of CONSENT_PARAGRAPHS) {
    ensureSpace(60);
    draw(paragraph.heading, { font: bold, size: 11, gap: 1 });
    draw(paragraph.text, { gap: 9 });
  }

  ensureSpace(90);
  y -= 8;
  draw("Podpis pacjenta (podpis elektroniczny, np. podpis zaufany):", { font: bold, gap: 40 });
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 260, y }, thickness: 0.7, color: ink });
  y -= 14;
  draw(`Dokument nr ${data.appointmentId}`, { size: 8, color: rgb(0.45, 0.45, 0.5) });

  // Bez strumieni obiektów: metadane zostają w czytelnej postaci, a podpis
  // dopisany na końcu pliku (PAdES) nie przesłania znacznika zgody.
  return await pdf.save({ useObjectStreams: false });
}

// --- Weryfikacja podpisanego pliku ------------------------------------------------

export type ConsentVerification = {
  outcome: "ACCEPTED" | "REJECTED" | "PENDING_REVIEW";
  reason: string | null;
  details: Record<string, unknown>;
};

let engineReady = false;
function ensureCryptoEngine() {
  if (engineReady) return;
  pkijs.setEngine(
    "node",
    new pkijs.CryptoEngine({
      name: "node",
      crypto: webcrypto as unknown as Crypto,
      subtle: webcrypto.subtle as unknown as SubtleCrypto,
    }),
  );
  engineReady = true;
}

function latin1(bytes: Uint8Array) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");
}

/** Ucina zera, którymi PDF dopełnia rezerwę na podpis, według długości z nagłówka DER. */
function trimDer(der: Uint8Array): Uint8Array {
  if (der.length < 2 || der[0] !== 0x30) return der;
  const first = der[1];
  if (first < 0x80) return der.subarray(0, 2 + first);
  const lengthBytes = first & 0x7f;
  if (lengthBytes === 0 || lengthBytes > 4 || der.length < 2 + lengthBytes) return der;
  let length = 0;
  for (let i = 0; i < lengthBytes; i++) length = length * 256 + der[2 + i];
  return der.subarray(0, 2 + lengthBytes + length);
}

function rdnValue(name: pkijs.RelativeDistinguishedNames, oid: string) {
  const entry = name.typesAndValues.find((item) => item.type === oid);
  return entry ? String((entry.value as { valueBlock?: { value?: string } }).valueBlock?.value ?? "") : null;
}

const DIGEST_OIDS: Record<string, string> = {
  "2.16.840.1.101.3.4.2.1": "sha256",
  "2.16.840.1.101.3.4.2.2": "sha384",
  "2.16.840.1.101.3.4.2.3": "sha512",
};

/**
 * Tolerancyjna weryfikacja podpisu RSA (PKCS#1 v1.5) w CMS z atrybutami podpisanymi.
 * Podpis zaufany z gov.pl zapisuje skrót w strukturze DigestInfo bez pustego
 * parametru NULL w AlgorithmIdentifier — jest to dopuszczalne (RFC 8017), ale
 * OpenSSL/WebCrypto odrzucają taki podpis. Sprawdzamy więc to samo, co standardowy
 * weryfikator (skrót atrybutów, wypełnienie, OID i skrót w DigestInfo), z tą
 * jedną różnicą: parametry algorytmu mogą być nieobecne albo NULL.
 */
function verifyRsaLenient(signedData: pkijs.SignedData, signedBytes: Buffer): boolean {
  try {
    const signerInfo = signedData.signerInfos[0];
    const hashName = DIGEST_OIDS[signerInfo?.digestAlgorithm.algorithmId ?? ""];
    const attrs = signerInfo?.signedAttrs;
    const certificate = signedData.certificates?.find((item): item is pkijs.Certificate => item instanceof pkijs.Certificate);
    if (!hashName || !attrs || !certificate) return false;

    // Skrót dokumentu musi zgadzać się z atrybutem messageDigest.
    const messageDigest = attrs.attributes.find((attr) => attr.type === "1.2.840.113549.1.9.4");
    const expected = Buffer.from(
      (messageDigest?.values[0] as { valueBlock: { valueHexView: Uint8Array } } | undefined)?.valueBlock.valueHexView ?? [],
    );
    const actual = createHash(hashName).update(signedBytes).digest();
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;

    const key = new X509Certificate(Buffer.from(certificate.toSchema(true).toBER(false))).publicKey;
    if (key.asymmetricKeyType !== "rsa") return false;

    // Podpisywany jest SET atrybutów (znacznik 0x31 zamiast [0] 0xA0).
    const attrsDer = Buffer.from(attrs.encodedValue);
    attrsDer[0] = 0x31;
    const attrsHash = createHash(hashName).update(attrsDer).digest();

    const signature = Buffer.from(signerInfo.signature.valueBlock.valueHexView);
    const em = publicDecrypt({ key, padding: constants.RSA_NO_PADDING }, signature);
    // EM = 00 01 FF…FF 00 DigestInfo
    if (em[0] !== 0x00 || em[1] !== 0x01) return false;
    let i = 2;
    while (i < em.length && em[i] === 0xff) i++;
    if (i < 10 || em[i] !== 0x00) return false;
    const digestInfo = em.subarray(i + 1);

    const asn1 = asn1js.fromBER(digestInfo.buffer.slice(digestInfo.byteOffset, digestInfo.byteOffset + digestInfo.byteLength) as ArrayBuffer);
    if (asn1.offset !== digestInfo.length) return false; // nic poza DigestInfo
    const seq = asn1.result as asn1js.Sequence;
    const [algorithm, digest] = seq.valueBlock.value as [asn1js.Sequence, asn1js.OctetString];
    const oid = (algorithm.valueBlock.value[0] as asn1js.ObjectIdentifier).valueBlock.toString();
    const params = algorithm.valueBlock.value[1];
    if (algorithm.valueBlock.value.length > 2 || (params && !(params instanceof asn1js.Null))) return false;
    if (DIGEST_OIDS[oid] !== hashName) return false;
    const signedDigest = Buffer.from(digest.valueBlock.valueHexView);
    return signedDigest.length === attrsHash.length && timingSafeEqual(signedDigest, attrsHash);
  } catch {
    return false;
  }
}

function trustedIssuers() {
  return (process.env.CONSENT_TRUSTED_ISSUERS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Automatyczna weryfikacja podpisanego PDF-a (podpis PAdES, np. z usługi
 * "Podpisz dokument elektronicznie" na gov.pl):
 *  * plik musi zawierać podpis, a podpis obejmować cały plik (nic nie dopisano po podpisaniu),
 *  * podpis kryptograficzny musi być poprawny (integralność i klucz z certyfikatu),
 *  * podpisany dokument musi być zgodą do TEJ wizyty (znacznik w metadanych).
 * Łańcucha zaufania certyfikatu do listy dostawców kwalifikowanych nie
 * sprawdzamy — wystawcę zapisujemy w szczegółach dla personelu; można go
 * zawęzić zmienną CONSENT_TRUSTED_ISSUERS (fragmenty nazwy wystawcy).
 * Wszystko, czego nie da się rozstrzygnąć automatycznie, trafia do ręcznej
 * weryfikacji (PENDING_REVIEW), a nie do odrzucenia.
 */
export async function verifySignedConsent(bytes: Uint8Array, appointmentId: string): Promise<ConsentVerification> {
  const reject = (reason: string, details: Record<string, unknown> = {}): ConsentVerification => ({
    outcome: "REJECTED",
    reason,
    details,
  });

  const head = latin1(bytes.subarray(0, 1024));
  if (!head.includes("%PDF-")) {
    if (/^\s*(<\?xml|<)/.test(head)) {
      return {
        outcome: "PENDING_REVIEW",
        reason: "Przesłano podpis w formacie XML (XAdES) — wymaga weryfikacji przez recepcję. Zalecamy podpisanie pliku PDF.",
        details: { format: "XML" },
      };
    }
    return reject("Nieobsługiwany format pliku — wgraj podpisany dokument PDF.");
  }

  const text = latin1(bytes);
  const ranges = [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
  if (ranges.length === 0) return reject("Plik nie zawiera podpisu elektronicznego.");

  const match = ranges[ranges.length - 1];
  const [a, b, c, d] = [match[1], match[2], match[3], match[4]].map(Number);
  const details: Record<string, unknown> = { format: "PAdES", signatures: ranges.length };

  if (a !== 0 || b <= 0 || c <= a + b || c + d > bytes.length) {
    return reject("Podpis w pliku jest uszkodzony.", details);
  }
  // Nic nie może być dopisane po podpisanym fragmencie (poza końcowymi białymi znakami).
  if (text.slice(c + d).trim().length > 0) {
    return reject("Dokument został zmieniony po podpisaniu.", details);
  }

  // Zawartość podpisu: <hex> między końcem pierwszego a początkiem drugiego zakresu.
  const between = text.slice(a + b, c).trim();
  const hexMatch = /^<([0-9a-fA-F\s]+)>$/.exec(between);
  if (!hexMatch) return reject("Nie udało się odczytać podpisu z pliku.", details);

  let der: Uint8Array;
  try {
    der = trimDer(Uint8Array.from(Buffer.from(hexMatch[1].replace(/\s+/g, ""), "hex")));
  } catch {
    return reject("Nie udało się odczytać podpisu z pliku.", details);
  }

  const signedBytes = Buffer.concat([Buffer.from(bytes.subarray(a, a + b)), Buffer.from(bytes.subarray(c, c + d))]);

  let signedData: pkijs.SignedData;
  try {
    ensureCryptoEngine();
    const asn1 = asn1js.fromBER(der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer);
    if (asn1.offset === -1) throw new Error("ber");
    const contentInfo = new pkijs.ContentInfo({ schema: asn1.result });
    signedData = new pkijs.SignedData({ schema: contentInfo.content });
  } catch {
    return reject("Podpis w pliku ma nieprawidłowy format.", details);
  }

  let signatureOk = false;
  try {
    const result = await signedData.verify({
      signer: 0,
      data: signedBytes.buffer.slice(signedBytes.byteOffset, signedBytes.byteOffset + signedBytes.byteLength) as ArrayBuffer,
      checkChain: false,
      extendedMode: true,
    });
    signatureOk = typeof result === "boolean" ? result : Boolean((result as { signatureVerified?: boolean }).signatureVerified);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) signatureOk = verifyRsaLenient(signedData, signedBytes);
  if (!signatureOk) return reject("Podpis jest nieprawidłowy — dokument mógł zostać zmieniony po podpisaniu.", details);

  // Dane podpisującego (do wglądu personelu).
  try {
    const certificate = signedData.certificates?.find((item): item is pkijs.Certificate => item instanceof pkijs.Certificate);
    if (certificate) {
      details.signer = rdnValue(certificate.subject, "2.5.4.3") ?? null; // CN
      details.signerSerial = rdnValue(certificate.subject, "2.5.4.5") ?? null; // np. PNOPL-…
      details.issuer = rdnValue(certificate.issuer, "2.5.4.3") ?? rdnValue(certificate.issuer, "2.5.4.10") ?? null;
      details.certValidFrom = certificate.notBefore.value.toISOString();
      details.certValidTo = certificate.notAfter.value.toISOString();
    }
  } catch {
    /* szczegóły certyfikatu są dodatkiem — brak ich nie zmienia wyniku */
  }

  // Znacznik wizyty.
  const markers = [...text.matchAll(new RegExp(`${CONSENT_MARKER_PREFIX}([A-Za-z0-9_-]+)`, "g"))].map((m) => m[1]);
  if (markers.some((id) => id !== appointmentId) && !markers.includes(appointmentId)) {
    return reject("To jest zgoda do innej wizyty.", details);
  }

  const allowed = trustedIssuers();
  if (allowed.length > 0) {
    const issuer = String(details.issuer ?? "").toLowerCase();
    if (!allowed.some((item) => issuer.includes(item))) {
      return {
        outcome: "PENDING_REVIEW",
        reason: "Wystawca certyfikatu nie znajduje się na liście zaufanych — wymaga weryfikacji przez recepcję.",
        details,
      };
    }
  }

  if (!markers.includes(appointmentId)) {
    return {
      outcome: "PENDING_REVIEW",
      reason: "Podpis jest poprawny, ale nie rozpoznano dokumentu jako zgody do tej wizyty — wymaga weryfikacji przez recepcję.",
      details,
    };
  }

  return { outcome: "ACCEPTED", reason: null, details };
}
