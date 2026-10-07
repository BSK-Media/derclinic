// Parsowanie kodów ze skanera: klasyczne EAN/UPC oraz GS1 (DataMatrix / GS1-128).
// Czytnik działa jak klawiatura — wpisuje znaki, zwykle kończąc Enterem. Separator
// pól zmiennej długości (FNC1) bywa wysyłany jako znak GS (0x1D) albo gubiony.

const GS = "\x1d";

type AiSpec = { length: number; variable?: boolean };

// Podzbiór identyfikatorów GS1 istotnych dla produktów leczniczych i kosmetycznych.
const AI_SPECS: Record<string, AiSpec> = {
  "00": { length: 18 },
  "01": { length: 14 },
  "02": { length: 14 },
  "10": { length: 20, variable: true },
  "11": { length: 6 },
  "13": { length: 6 },
  "15": { length: 6 },
  "17": { length: 6 },
  "21": { length: 20, variable: true },
  "30": { length: 8, variable: true },
  "240": { length: 30, variable: true },
  "241": { length: 30, variable: true },
};

const DATE_AIS = new Set(["11", "13", "15", "17"]);

export type Gs1Data = {
  gtin: string | null;
  batchNumber: string | null;
  serialNumber: string | null;
  expiryDate: string | null; // YYYY-MM-DD
};

export type ParsedScan =
  | { kind: "gs1"; code: string; data: Gs1Data; productCodes: string[] }
  | { kind: "plain"; code: string; productCodes: string[] };

/** GS1 YYMMDD → YYYY-MM-DD (dzień 00 oznacza ostatni dzień miesiąca). */
export function gs1DateToIso(value: string): string | null {
  if (!/^\d{6}$/.test(value)) return null;
  const year = 2000 + Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  let day = Number(value.slice(4, 6));
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day === 0) day = lastDay;
  if (day > lastDay) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function matchAi(input: string, pos: number): { ai: string; spec: AiSpec } | null {
  for (const len of [2, 3]) {
    const ai = input.slice(pos, pos + len);
    if (ai.length === len && AI_SPECS[ai]) return { ai, spec: AI_SPECS[ai] };
  }
  return null;
}

type Field = { ai: string; value: string };

// Rekurencyjne parsowanie z cofaniem: gdy separator FNC1 zginął, długość pola
// zmiennego odgadujemy tak, aby reszta kodu dała się w całości rozpoznać.
function parseFields(input: string, pos: number): Field[] | null {
  if (pos >= input.length) return [];
  if (input[pos] === GS) return parseFields(input, pos + 1);

  const match = matchAi(input, pos);
  if (!match) return null;
  const { ai, spec } = match;
  const start = pos + ai.length;

  if (!spec.variable) {
    const value = input.slice(start, start + spec.length);
    if (value.length !== spec.length || !/^\d+$/.test(value)) return null;
    if (DATE_AIS.has(ai) && !gs1DateToIso(value)) return null;
    const rest = parseFields(input, start + spec.length);
    return rest ? [{ ai, value }, ...rest] : null;
  }

  const gsIndex = input.indexOf(GS, start);
  const hardEnd = gsIndex === -1 ? input.length : gsIndex;
  const maxLen = Math.min(spec.length, hardEnd - start);
  // Separator jest: pole kończy się dokładnie na nim.
  if (gsIndex !== -1 && gsIndex - start <= spec.length) {
    const value = input.slice(start, gsIndex);
    if (!value) return null;
    const rest = parseFields(input, gsIndex + 1);
    return rest ? [{ ai, value }, ...rest] : null;
  }
  // Brak separatora: spośród poprawnych podziałów bierzemy ten z największą liczbą
  // rozpoznanych pól, a przy remisie — z dłuższą wartością pola.
  let best: Field[] | null = null;
  for (let len = maxLen; len >= 1; len--) {
    const value = input.slice(start, start + len);
    const rest = parseFields(input, start + len);
    if (rest && (!best || rest.length + 1 > best.length)) best = [{ ai, value }, ...rest];
  }
  return best;
}

function stripSymbologyPrefix(raw: string) {
  return raw.replace(/^\][A-Za-z]\d/, "");
}

function fromParenthesized(raw: string): Field[] | null {
  if (!/^\(\d{2,4}\)/.test(raw)) return null;
  const fields: Field[] = [];
  const re = /\((\d{2,4})\)([^(]+)/g;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(raw))) {
    fields.push({ ai: m[1], value: m[2] });
    consumed += m[0].length;
  }
  return consumed === raw.length && fields.length ? fields : null;
}

/** Warianty zapisu GTIN, pod którymi produkt może być zapisany jako EAN. */
export function productCodeVariants(code: string): string[] {
  const digits = code.replace(/\D/g, "");
  if (!digits) return [code];
  const stripped = digits.replace(/^0+/, "") || "0";
  const variants = new Set<string>([digits, stripped]);
  for (const size of [8, 12, 13, 14]) {
    if (stripped.length <= size) variants.add(stripped.padStart(size, "0"));
  }
  return [...variants];
}

/** Rozpoznaje zeskanowany tekst: GS1 (partia, ważność, seria) albo zwykły kod kreskowy. */
export function parseScan(input: string): ParsedScan | null {
  const raw = stripSymbologyPrefix(input.replace(/[\r\n\t]/g, "")).trim();
  if (!raw) return null;

  const isPlainNumeric = /^\d{8,14}$/.test(raw);
  if (!isPlainNumeric) {
    const fields = fromParenthesized(raw) ?? (raw.length > 8 ? parseFields(raw, 0) : null);
    const gtinField = fields?.find((f) => f.ai === "01");
    if (fields && gtinField) {
      const get = (ai: string) => fields.find((f) => f.ai === ai)?.value ?? null;
      const expiryRaw = get("17");
      return {
        kind: "gs1",
        code: raw,
        data: {
          gtin: gtinField.value,
          batchNumber: get("10"),
          serialNumber: get("21"),
          expiryDate: expiryRaw ? gs1DateToIso(expiryRaw) : null,
        },
        productCodes: productCodeVariants(gtinField.value),
      };
    }
  }

  return { kind: "plain", code: raw, productCodes: productCodeVariants(raw) };
}

/** EAN-13 zapisywany przy nowym produkcie: GTIN-14 z zerem wiodącym → 13 cyfr. */
export function gtinToEan(gtin: string): string {
  return gtin.length === 14 && gtin.startsWith("0") ? gtin.slice(1) : gtin;
}

/** Cyfry kodu bez zer wiodących — pozwala porównać EAN-13 z GTIN-14 tego samego produktu. */
function normalizedDigits(code: string) {
  return code.replace(/\D/g, "").replace(/^0+/, "");
}

/**
 * Wyszukiwanie produktów po zeskanowanym GS1. Zwraca znormalizowany GTIN
 * (do porównania z EAN produktu) albo null, gdy tekst nie jest kodem GS1.
 */
export function gs1SearchGtin(query: string): string | null {
  const scan = parseScan(query);
  if (scan?.kind !== "gs1" || !scan.data.gtin) return null;
  return normalizedDigits(scan.data.gtin) || null;
}

export function eanMatchesGtin(ean: string | null | undefined, gtin: string | null) {
  if (!ean || !gtin) return false;
  return normalizedDigits(ean) === gtin;
}

/**
 * Kod produktu z zeskanowanego tekstu (EAN/UPC albo GTIN z GS1), znormalizowany
 * do porównania z EAN produktu. Null, gdy tekst nie wygląda na kod kreskowy.
 */
export function scannedProductCode(query: string): string | null {
  const gtin = gs1SearchGtin(query);
  if (gtin) return gtin;
  const raw = stripSymbologyPrefix(query.replace(/[\r\n\t]/g, "")).trim();
  if (!/^\d{8,14}$/.test(raw)) return null;
  return normalizedDigits(raw) || null;
}
