// Analiza RFM (Recency, Frequency, Monetary): ocena pacjentów w skali 1–5 według tego, jak dawno
// byli ostatnio, jak często korzystają z usług i ile wydali. Czysta logika bez dostępu do bazy.

export const RFM_WINDOW_DAYS = 365; // okno dla częstotliwości i wartości

export type RfmInput = {
  patientId: string;
  lastAt: Date; // ostatnia zakończona wizyta albo zakup
  frequency: number; // liczba wizyt i zakupów w oknie
  monetary: number; // wydane kwoty w oknie (grosze)
};

export type RfmSegment = "VIP" | "LOYAL" | "NEW" | "WIN_BACK" | "AT_RISK" | "DORMANT" | "OTHER";

export type RfmResult = RfmInput & {
  daysSince: number;
  r: number;
  f: number;
  m: number;
  segment: RfmSegment;
};

export const RFM_SEGMENT_LABELS: Record<RfmSegment, { label: string; hint: string }> = {
  VIP: { label: "VIP", hint: "Bywa często, niedawno i wydaje dużo — indywidualna opieka." },
  LOYAL: { label: "Lojalni", hint: "Wracają regularnie — utrzymać relację, program lojalnościowy." },
  NEW: { label: "Nowi", hint: "Niedawno pierwsza wizyta — zachęcić do powrotu." },
  WIN_BACK: { label: "Do odzyskania", hint: "Dawni dobrzy pacjenci, którzy przestali przychodzić — pilna kampania powrotna." },
  AT_RISK: { label: "Zagrożeni", hint: "Wizyty się przerzedzają — przypomnienie lub oferta." },
  DORMANT: { label: "Uśpieni", hint: "Dawno nie byli i rzadko bywali." },
  OTHER: { label: "Pozostali", hint: "Pacjenci o średniej aktywności." },
};

export const RFM_SEGMENT_ORDER: RfmSegment[] = ["VIP", "LOYAL", "NEW", "WIN_BACK", "AT_RISK", "DORMANT", "OTHER"];

const DAY_MS = 24 * 3600 * 1000;

/** Ocena 1–5 według kwintyla: im więcej wartości jest niższych od danej, tym wyższa ocena. */
function quintileScores(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    // liczba wartości ściśle mniejszych (wyszukiwanie binarne)
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(5, 1 + Math.floor((5 * lo) / n));
  });
}

export function classifyRfm(r: number, f: number, m: number): RfmSegment {
  if (r >= 4 && f >= 4 && m >= 4) return "VIP";
  if (r <= 2 && (f >= 4 || m >= 4)) return "WIN_BACK";
  if (r <= 2 && f >= 3) return "AT_RISK";
  if (r <= 2) return "DORMANT";
  if (r >= 4 && f <= 2) return "NEW";
  if (r >= 3 && f >= 3) return "LOYAL";
  return "OTHER";
}

export function computeRfm(inputs: RfmInput[], now: Date = new Date()): RfmResult[] {
  const days = inputs.map((i) => Math.max(0, Math.floor((now.getTime() - i.lastAt.getTime()) / DAY_MS)));
  // Świeżość: mniej dni = lepiej, więc oceniamy odwróconą wartość.
  const rScores = quintileScores(days.map((d) => -d));
  const fScores = quintileScores(inputs.map((i) => i.frequency));
  const mScores = quintileScores(inputs.map((i) => i.monetary));
  return inputs.map((input, idx) => ({
    ...input,
    daysSince: days[idx],
    r: rScores[idx],
    f: fScores[idx],
    m: mScores[idx],
    segment: classifyRfm(rScores[idx], fScores[idx], mScores[idx]),
  }));
}
