// Czyste (bez bazy i bez next/headers) helpery dziennika zdarzeń — dzięki temu
// da się je testować jednostkowo i używać zarówno w API, jak i w UI.

// Klucze, których wartości NIGDY nie mogą trafić do dziennika (hasła, hashe,
// tokeny resetu itp.). Dziennik jest czytelny dla admina i trwały, więc sekret
// zapisany raz zostałby w nim na zawsze.
const SENSITIVE_KEY = /password|passwd|token|secret|hash/i;

const MAX_STRING = 1000;
const MAX_ARRAY = 50;
const MAX_DEPTH = 6;

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") {
    // Zdjęcia (data URL base64) są ogromne i nie są "danymi zdarzenia".
    if (value.startsWith("data:")) return "[dane binarne]";
    if (value.length > MAX_STRING) {
      return `${value.slice(0, MAX_STRING)}… [+${value.length - MAX_STRING} znaków]`;
    }
    return value;
  }
  if (typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[…]";

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((item) => sanitizeValue(item, depth + 1));
    if (value.length > MAX_ARRAY) items.push(`[+${value.length - MAX_ARRAY} elementów]`);
    return items;
  }

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[ukryte]" : sanitizeValue(inner, depth + 1);
  }
  return out;
}

/**
 * Zamienia dowolną wartość na bezpieczny dla dziennika JSON: Date/Decimal
 * stają się tekstem, sekrety są ukrywane, obrazy i bardzo długie teksty
 * skracane. Zwraca null, gdy nie ma czego zapisać albo wartości nie da się
 * zserializować (np. referencja cykliczna).
 */
export function sanitizeAuditData(data: unknown): Record<string, unknown> | unknown[] | null {
  if (data === null || data === undefined) return null;
  try {
    // JSON round-trip wywołuje toJSON (Date -> ISO, Prisma.Decimal -> string).
    const plain = JSON.parse(JSON.stringify(data));
    const cleaned = sanitizeValue(plain, 0);
    if (cleaned === null || typeof cleaned !== "object") return { value: cleaned };
    return cleaned as Record<string, unknown> | unknown[];
  } catch {
    return null;
  }
}

function comparable(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export type FieldChange = { from: unknown; to: unknown };

/**
 * Porównuje stan przed i po zmianie i zwraca WYŁĄCZNIE pola, które faktycznie
 * się zmieniły: { status: { from: "SCHEDULED", to: "COMPLETED" } }.
 * Pola nieobecne w `after` (undefined) są traktowane jako "nie zmieniano".
 * Zwraca undefined, gdy nic się nie zmieniło.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys?: readonly string[],
): Record<string, FieldChange> | undefined {
  const changes: Record<string, FieldChange> = {};
  for (const key of keys ?? Object.keys(after)) {
    if (after[key] === undefined) continue;
    if (comparable(before[key]) === comparable(after[key])) continue;
    changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}

/** Data i godzina w czasie warszawskim do opisów w dzienniku, np. "12.10.2026 10:00". */
export function formatWarsaw(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("pl-PL", {
      timeZone: "Europe/Warsaw",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((part) => [part.type, part.value]),
  );
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

/** Skraca tekst użytkownika (np. notatkę) do rozsądnej długości w podsumowaniu. */
export function clip(value: string | null | undefined, max = 120): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
