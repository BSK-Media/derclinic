// Kotwica dziennika zdarzeń (L-07): codziennie liczona kontrola, raz w miesiącu zbiorczy e-mail.
// Funkcje czyste (bez bazy i poczty), żeby dało się je przetestować.

export type DailyAnchor = {
  at: string; // ISO
  totalCount: number;
  totalHash: string;
  last24hCount: number;
  last24hHash: string;
  // Weryfikacja podpisów wpisów z ostatniej doby (HMAC).
  checked?: number;
  valid?: number;
  invalid?: number;
  unsigned?: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Klucz miesiąca „RRRR-MM” (UTC). */
export function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** Poprzedni miesiąc kalendarzowy względem `now` (UTC): klucz oraz granice [start, end). */
export function previousMonth(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { key: monthKey(start), start, end };
}

export function monthRange(key: string) {
  const [year, month] = key.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { key, start, end };
}

/** Nieprawidłowości wykryte w porównaniu z poprzednią kotwicą i w podpisach z ostatniej doby. */
export function detectAnomalies(current: DailyAnchor, previous: Pick<DailyAnchor, "totalCount"> | null): string[] {
  const issues: string[] = [];
  if (previous && current.totalCount < previous.totalCount) {
    issues.push(`Liczba wpisów dziennika zmalała z ${previous.totalCount} do ${current.totalCount} (usunięcie wpisów lub cofnięcie bazy).`);
  }
  if ((current.invalid ?? 0) > 0) {
    issues.push(`${current.invalid} z ${current.checked ?? "?"} wpisów z ostatniej doby ma niepoprawny podpis (zmiana wpisu w bazie).`);
  }
  return issues;
}

export type MonthlyDigest = {
  subject: string;
  text: string;
  html: string;
  summary: string;
  days: number;
  missingDays: string[];
  anomalies: number;
};

function dayOf(iso: string) {
  return iso.slice(0, 10);
}

/**
 * Zbiorcze zestawienie kotwic z jednego miesiąca: podsumowanie (liczba dni z kontrolą, brakujące dni,
 * zakres liczby wpisów, wyniki weryfikacji podpisów, anomalie) i pełna lista dzień po dniu.
 */
export function buildMonthlyDigest(key: string, anchors: DailyAnchor[]): MonthlyDigest {
  const { start, end } = monthRange(key);
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const sorted = [...anchors].sort((a, b) => a.at.localeCompare(b.at));

  const byDay = new Map<string, DailyAnchor>();
  for (const anchor of sorted) byDay.set(dayOf(anchor.at), anchor); // przy kilku w dobie liczy się ostatnia

  const missingDays: string[] = [];
  for (let i = 0; i < daysInMonth; i++) {
    const day = `${key}-${pad(i + 1)}`;
    if (!byDay.has(day)) missingDays.push(day);
  }

  let invalidTotal = 0;
  let unsignedTotal = 0;
  let decreases = 0;
  let previous: DailyAnchor | null = null;
  const rows = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, anchor]) => {
      invalidTotal += anchor.invalid ?? 0;
      unsignedTotal += anchor.unsigned ?? 0;
      const decreased = previous !== null && anchor.totalCount < previous.totalCount;
      if (decreased) decreases++;
      previous = anchor;
      const signatures =
        anchor.checked === undefined
          ? "—"
          : `${anchor.valid ?? 0} poprawnych` +
            ((anchor.invalid ?? 0) > 0 ? `, ${anchor.invalid} ZMIENIONYCH` : "") +
            ((anchor.unsigned ?? 0) > 0 ? `, ${anchor.unsigned} bez podpisu` : "");
      return { day, anchor, decreased, signatures };
    });

  const counts = rows.map((row) => row.anchor.totalCount);
  const anomalies = invalidTotal + decreases;
  const range = counts.length ? `${Math.min(...counts)}–${Math.max(...counts)}` : "—";
  const verdict =
    counts.length === 0
      ? "W tym miesiącu nie zapisano żadnej kotwicy — sprawdź zadanie /api/cron/audit-anchor."
      : anomalies === 0 && missingDays.length === 0
        ? "Brak nieprawidłowości: codzienna kontrola przebiegła każdego dnia, liczba wpisów nie malała, a podpisy są poprawne."
        : "UWAGA: wykryto nieprawidłowości — patrz niżej.";

  const summaryLines = [
    `Miesiąc: ${key}`,
    `Dni z kontrolą: ${rows.length} z ${daysInMonth}`,
    `Dni bez kontroli: ${missingDays.length ? missingDays.join(", ") : "brak"}`,
    `Liczba wpisów dziennika w miesiącu (min–max): ${range}`,
    `Spadki liczby wpisów: ${decreases}`,
    `Wpisy ze zmienionym podpisem: ${invalidTotal}`,
    `Wpisy bez podpisu (sprzed wdrożenia podpisów): ${unsignedTotal}`,
  ];

  const text =
    `Zestawienie kotwic dziennika zdarzeń DerClinic CRM za ${key}\n\n` +
    `${verdict}\n\n${summaryLines.join("\n")}\n\n` +
    `Lista dzień po dniu (dzień · wpisów łącznie · wpisów z doby · podpisy z doby · skrót całości · skrót doby):\n` +
    rows
      .map(
        (row) =>
          `${row.day} · ${row.anchor.totalCount}${row.decreased ? " (SPADEK)" : ""} · ${row.anchor.last24hCount} · ${row.signatures} · ${row.anchor.totalHash} · ${row.anchor.last24hHash}`,
      )
      .join("\n") +
    `\n\nCo to jest: system co noc liczy skrót SHA-256 z identyfikatorów i podpisów wszystkich wpisów dziennika oraz sprawdza podpisy wpisów z ostatniej doby. ` +
    `Skróty są zapisywane także poza bazą (magazyn z blokadą WORM). Zmniejszenie liczby wpisów albo niezgodny podpis oznacza ingerencję w dziennik; ` +
    `o takiej sytuacji system powiadamia od razu, a nie dopiero w zestawieniu miesięcznym. Zachowaj tę wiadomość.\n`;

  const cell = "padding:3px 8px;border:1px solid #cbd5e1;font-size:12px;";
  const html =
    `<p><strong>Zestawienie kotwic dziennika zdarzeń DerClinic CRM za ${key}</strong></p>` +
    `<p>${verdict}</p>` +
    `<ul>${summaryLines.map((line) => `<li>${line}</li>`).join("")}</ul>` +
    `<table style="border-collapse:collapse;font-family:Arial,sans-serif">` +
    `<tr style="background:#f1f5f9"><th style="${cell}">Dzień</th><th style="${cell}">Wpisów łącznie</th><th style="${cell}">Z doby</th><th style="${cell}">Podpisy z doby</th><th style="${cell}">Skrót całości (SHA-256)</th><th style="${cell}">Skrót doby</th></tr>` +
    rows
      .map(
        (row) =>
          `<tr><td style="${cell}">${row.day}</td><td style="${cell}">${row.anchor.totalCount}${row.decreased ? " <strong>(SPADEK)</strong>" : ""}</td><td style="${cell}">${row.anchor.last24hCount}</td><td style="${cell}">${row.signatures}</td><td style="${cell}"><code>${row.anchor.totalHash}</code></td><td style="${cell}"><code>${row.anchor.last24hHash}</code></td></tr>`,
      )
      .join("") +
    `</table>` +
    `<p style="font-size:12px;color:#475569">System co noc liczy skrót SHA-256 z identyfikatorów i podpisów wszystkich wpisów dziennika oraz sprawdza podpisy wpisów z ostatniej doby; skróty są zapisywane także poza bazą (magazyn z blokadą WORM). Zmniejszenie liczby wpisów albo niezgodny podpis oznacza ingerencję w dziennik — o takiej sytuacji system powiadamia od razu. Zachowaj tę wiadomość.</p>`;

  return {
    subject: `DerClinic CRM — zestawienie kotwic dziennika zdarzeń ${key}`,
    text,
    html,
    summary: `${key}: ${rows.length}/${daysInMonth} dni z kontrolą, ${anomalies} anomalii, ${missingDays.length} dni bez kontroli`,
    days: rows.length,
    missingDays,
    anomalies,
  };
}
