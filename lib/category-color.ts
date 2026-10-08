// Kolory kategorii usług: sprawdzanie, czy nowy kolor nie jest zbyt podobny do już używanych.

/** Odległość między kolorami (RGB, 0–441); poniżej progu kolory są trudne do odróżnienia. */
export const SIMILAR_COLOR_DISTANCE = 60;

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function colorDistance(a: string, b: string) {
  const first = rgb(a);
  const second = rgb(b);
  if (!first || !second) return Infinity;
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

export type UsedCategoryColor = { name: string; color: string };

/** Zwraca kategorię, której kolor jest zbyt podobny do `color` (pomijając `exceptName`), albo null. */
export function findSimilarCategoryColor(color: string, used: UsedCategoryColor[], exceptName?: string) {
  return (
    used.find(
      (item) => item.name !== exceptName && colorDistance(color, item.color) < SIMILAR_COLOR_DISTANCE,
    ) ?? null
  );
}

/** Zestaw wyraźnie różnych kolorów do wyboru dla nowej kategorii. */
export const CATEGORY_COLOR_CANDIDATES = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4",
  "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#78716c",
] as const;

export function freeCategoryColors(used: UsedCategoryColor[]) {
  return CATEGORY_COLOR_CANDIDATES.filter((candidate) => !findSimilarCategoryColor(candidate, used));
}

const FALLBACK_COLORS = ["#8b5cf6", "#3b82f6", "#22c55e", "#f59e0b", "#ec4899", "#06b6d4", "#f97316"] as const;

/** Kolor pokazywany dla kategorii, która nie ma zapisanego koloru (wyliczany z nazwy). */
export function fallbackCategoryColor(category?: string | null) {
  const value = category?.trim() || "Bez kategorii";
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

/** Kolory wszystkich kategorii (zapisany albo zastępczy) — to one są "w użyciu" na ekranie. */
export function effectiveCategoryColors(services: { category: string | null; categoryColor: string | null }[]) {
  const stored = new Map<string, string>();
  const names = new Set<string>();
  for (const service of services) {
    const name = service.category?.trim();
    if (!name) continue;
    names.add(name);
    if (service.categoryColor && !stored.has(name)) stored.set(name, service.categoryColor);
  }
  return [...names].map((name) => ({ name, color: stored.get(name) ?? fallbackCategoryColor(name) }));
}
