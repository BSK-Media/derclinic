// Import historii z Booksy (klienci i wizyty). Czysta logika bez dostępu do bazy — używa jej
// scripts/import-booksy.ts. Eksport z Booksy to pliki CSV: clients.csv i appointments.csv.

// --- CSV -----------------------------------------------------------------------------------

/** Parser CSV (RFC 4180): cudzysłowy, przecinki i znaki nowej linii wewnątrz pól. Zwraca obiekty wg nagłówka. */
export function parseCsv(text: string): Record<string, string>[] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift() ?? [];
  return rows.map((r) => Object.fromEntries(header.map((key, idx) => [key, r[idx] ?? ""])));
}

// --- Normalizacja pól ----------------------------------------------------------------------

const EMPTY_MARKERS = new Set(["", "none", "null", "undefined", "nan", "-", "."]);

/** Booksy wpisuje „None”, „null” itp. zamiast pustych pól. */
export function cleanText(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return EMPTY_MARKERS.has(text.toLowerCase()) ? null : text;
}

/** Numer w formacie aplikacji: „+48” i 9 cyfr bez spacji; numery zagraniczne zachowują swój prefiks. */
export function normalizePhone(raw: string | null | undefined): string | null {
  const text = cleanText(raw);
  if (!text) return null;
  const compact = text.replace(/[\s()-]/g, "");
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  if (/^00\d{9,15}$/.test(compact)) return `+${compact.slice(2)}`;
  if (/^\d{9}$/.test(compact)) return `+48${compact}`;
  if (/^48\d{9}$/.test(compact)) return `+${compact}`;
  return null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const text = cleanText(raw)?.toLowerCase() ?? null;
  return text && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : null;
}

/** Imię i nazwisko do porównań: bez wielkości liter, polskich znaków i interpunkcji. */
export function comparableName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Kwota z Booksy („500.0”, „169,92”) w groszach; brak lub „null” → null. */
export function toGrosze(raw: string | null | undefined): number | null {
  const text = cleanText(raw);
  if (!text) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

// --- Daty: czas lokalny Polski → UTC ---------------------------------------------------------

const WARSAW = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function warsawOffsetMs(at: Date): number {
  const parts = Object.fromEntries(WARSAW.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - at.getTime();
}

/** „2025-10-21 17:45:00” (czas warszawski, jak w panelu Booksy) → właściwy moment w UTC. */
export function warsawLocalToDate(raw: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec((raw ?? "").trim());
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  // Dwa przybliżenia wystarczają, także na granicy zmiany czasu.
  let guess = naive - warsawOffsetMs(new Date(naive));
  guess = naive - warsawOffsetMs(new Date(guess));
  return new Date(guess);
}

// --- Statusy -----------------------------------------------------------------------------

export type MappedStatus = { status: "SCHEDULED" | "COMPLETED" | "CANCELED" | "NO_SHOW"; approved: boolean };

export function mapStatus(booksyStatus: string, startsAt: Date, now: Date = new Date()): MappedStatus {
  switch (booksyStatus.trim().toLowerCase()) {
    case "finished":
      return { status: "COMPLETED", approved: true };
    case "no-show":
      return { status: "NO_SHOW", approved: false };
    case "cancelled":
    case "canceled":
    case "declined":
      return { status: "CANCELED", approved: false };
    default:
      // Confirmed / Proposed: przyszła wizyta zostaje zaplanowana, a zaległa (bez zamknięcia) jest nieznanego wyniku.
      return startsAt.getTime() >= now.getTime()
        ? { status: "SCHEDULED", approved: false }
        : { status: "CANCELED", approved: false };
  }
}

// --- Dopasowanie usług ---------------------------------------------------------------------

const STOP_WORDS = new Set([
  "dr", "marty", "autorska", "autorski", "autorskie", "autorska", "technika", "technike", "technika", "u", "z", "i", "w", "na", "oraz",
  "nowosc", "do", "dla", "po", "przed", "lub", "ze", "the", "pakiet",
]);

const TOKEN_ALIASES: Record<string, string> = {
  botoks: "botox",
  botoksu: "botox",
  toksyna: "botox",
  toksynaa: "botox",
  botulinowa: "botox",
  kobido: "kobido",
  icoone: "icoone",
  hydrafacial: "hydrafacial",
  kwas: "kwas",
  hialuronowy: "hialuronowy",
};

/** Pierwszy człon nazwy bez cyfr (np. „4 okolice” → liczba 4 jest osobno). */
function stem(token: string): string {
  if (/^\d+$/.test(token)) return token;
  return token.length > 5 ? token.slice(0, 5) : token;
}

export function serviceTokens(name: string): string[] {
  const clean = comparableName(name.replace(/[®™*]/g, ""));
  const out: string[] = [];
  for (const raw of clean.split(" ")) {
    if (!raw || STOP_WORDS.has(raw)) continue;
    const aliased = TOKEN_ALIASES[raw] ?? raw;
    const token = stem(aliased);
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

export type ServiceCandidate = { id: string; name: string };
export type ServiceMatch = {
  serviceId: string;
  serviceName: string;
  score: number;
  kind: "exact" | "similar" | "fallback";
};

function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  const common = a.filter((t) => sb.has(t));
  if (!common.length) return 0;
  const union = new Set([...a, ...b]).size;
  let score = common.length / union;
  // Liczby (np. liczba okolic lub obszarów) muszą się zgadzać — inaczej to inna usługa.
  const nums = (arr: string[]) => arr.filter((t) => /^\d+$/.test(t)).sort().join(",");
  if (nums(a) !== nums(b) && (nums(a) || nums(b))) score *= 0.6;
  return score;
}

export const SIMILAR_THRESHOLD = 0.6;

/**
 * Reguły dla nazw z Booksy, które nie mają odpowiednika 1:1 w usługach aplikacji (Booksy używał krótszych nazw
 * i innych wariantów). Pierwsza pasująca reguła wygrywa; wynik to NAZWA istniejącej usługi aplikacji.
 * Reguły nie tworzą usług — jeśli docelowej nazwy nie ma w bazie, reguła jest pomijana.
 */
export const SERVICE_RULES: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [/^botoks (\d) okolic/i, (m) => (m[1] === "5" ? "Toksyna botulinowa BOTOX - FULL FACE" : `Toksyna botulinowa BOTOX - ${m[1]} ${m[1] === "1" ? "okolica" : "okolice"}`)],
  [/^(toksyna botulinowa|botoks)/i, () => "Toksyna botulinowa BOTOX - 3 okolice"],
  [/^icoone (\d)/i, (m) => (+m[1] <= 3 ? `Icoone drenaż limfatyczny - ${m[1]} ${m[1] === "1" ? "obszar" : "obszary"}` : "Icoone drenaż limfatyczny - 3 obszary")],
  [/^icoone/i, () => "Icoone drenaż limfatyczny - 2 obszary"],
  [/kobido/i, () => "Masaż kobido - niechirurgiczny masaż liftingujący"],
  [/^kwas polimlekowy lanluma/i, () => "Kwas polimlekowy lanluma - Twarz"],
  [/^wypelnianie zmarszczek/i, () => "Wypełnianie zmarszczek- autorska technika Dr Marty"],
  [/^kwas hialuronowy.*(marty)/i, () => "Kwas hialuronowy autorska technika Dr Marty - 1 ampułka"],
  [/^kwas hialuronowy/i, () => "Kwas hialuronowy - wypełnienie / modelowanie - 1 ampułka"],
  [/^dermapen 4 0$/i, () => "Odmładzanie z mikronakłuwaniem - twarz + szyja"],
  [/^rf radiofrekwencja mikroiglowa$/i, () => "RF Radiofrekwencja mikroigłowa - twarz"],
  [/^bruksizm$/i, () => "Toksyna botulinowa BOTOX - Bruksizm"],
  [/^stymulator tkankowy jalupro classic$/i, () => "Jalupro mezoterapia aminokwasami - Jalupro Classic® 1 ampułka"],
  [/^dodatek$/i, () => "Dodatek - Ampułka"],
  [/^laserowe usuniecie zmian skornych/i, () => "Laserowe usunięcie zmian skórnych - 1-3 zmian na twarzy"],
  [/^osocze bogatoplytkowe/i, () => "Osocze bogatopłytkowe PRP - Twarz"],
  [/^jalupro mezoterapia aminokwasami/i, () => "Jalupro mezoterapia aminokwasami - Jalupro Classic® 1 ampułka"],
  [/^mezoterapia mezokoktajlami/i, () => "Mezoterapia mezokoktajlami - Twarz"],
  [/^stymulator tkankowy pluryal silk/i, () => "Stymulator tkankowy Pluryal Silk u lekarzy"],
];

export function buildServiceMatcher(
  services: ServiceCandidate[],
  fallbackName = "Konsultacja z indywidualnie dobranym zabiegiem",
) {
  const exact = new Map<string, ServiceCandidate>();
  const tokens = services.map((service) => ({ service, tokens: serviceTokens(service.name) }));
  for (const service of services) exact.set(comparableName(service.name), service);
  const fallback = services.find((s) => comparableName(s.name) === comparableName(fallbackName)) ?? null;

  return function match(booksyName: string): ServiceMatch | null {
    const direct = exact.get(comparableName(booksyName));
    if (direct) return { serviceId: direct.id, serviceName: direct.name, score: 1, kind: "exact" };

    const comparable = comparableName(booksyName.replace(/[®™*]/g, ""));
    for (const [pattern, target] of SERVICE_RULES) {
      const m = pattern.exec(comparable);
      if (!m) continue;
      const found = exact.get(comparableName(target(m)));
      if (found) return { serviceId: found.id, serviceName: found.name, score: 0.9, kind: "similar" };
    }

    const wanted = serviceTokens(booksyName);
    let best: { service: ServiceCandidate; score: number } | null = null;
    let second = 0;
    for (const candidate of tokens) {
      const score = similarity(wanted, candidate.tokens);
      if (!best || score > best.score) {
        second = best?.score ?? 0;
        best = { service: candidate.service, score };
      } else if (score > second) second = score;
    }
    // Remis między różnymi usługami = niejednoznaczne, więc nie zgadujemy.
    if (best && best.score >= SIMILAR_THRESHOLD && best.score > second) {
      return { serviceId: best.service.id, serviceName: best.service.name, score: best.score, kind: "similar" };
    }
    if (fallback) return { serviceId: fallback.id, serviceName: fallback.name, score: best?.score ?? 0, kind: "fallback" };
    return null;
  };
}

