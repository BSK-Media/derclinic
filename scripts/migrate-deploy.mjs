// Stosuje wersjonowane migracje Prisma (prisma/migrations) — i nic więcej.
// Zastępuje dawne `prisma db push && prisma db seed` w buildzie (audyt, F-03):
// deployment nie zmienia schematu "na oko" według schema.prisma ani nie
// wgrywa danych, wykonuje wyłącznie migracje zatwierdzone w repozytorium.
//
// Jednorazowe przejście z `db push` na migracje (baseline):
// baza produkcyjna była dotąd budowana przez `db push`, więc nie ma tabeli
// _prisma_migrations i `migrate deploy` odmawia pracy (błąd P3005). Wtedy
// porównujemy schemat bazy z migracją 0_init. Tylko jeśli są IDENTYCZNE,
// oznaczamy 0_init jako już zastosowaną i puszczamy pozostałe migracje.
// Przy jakiejkolwiek rozbieżności build się zatrzymuje — nic nie jest zmieniane.

import { spawnSync } from "node:child_process";

const BASELINE_MIGRATION = "0_init";
const BASELINE_SCHEMA = "prisma/migrations/0_init/baseline-schema.prisma.txt";

// Migracje muszą iść BEZPOŚREDNIM połączeniem z bazą, nie przez pooler
// (PgBouncer). Prisma zabezpiecza migracje blokadą pg_advisory_lock, która
// jest przypisana do sesji — a pooler w trybie transakcyjnym potrafi założyć
// ją na jednym połączeniu i "zwolnić" na innym. Blokada zostaje wtedy
// zawieszona i kolejny deploy pada z P1002 (timeout na advisory lock).
// Adres bezpośredni: DIRECT_URL / DATABASE_URL_UNPOOLED, a gdy ich nie ma —
// dla Neon wyprowadzany z DATABASE_URL (ten sam host bez "-pooler").
function directDatabaseUrl() {
  const explicit = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED;
  if (explicit) return explicit;
  try {
    const url = new URL(process.env.DATABASE_URL);
    if (!url.hostname.includes("-pooler.")) return null;
    url.hostname = url.hostname.replace("-pooler.", ".");
    url.searchParams.delete("pgbouncer");
    return url.toString();
  } catch {
    return null;
  }
}

const directUrl = process.env.DATABASE_URL ? directDatabaseUrl() : null;
const baseEnv = directUrl ? { ...process.env, DATABASE_URL: directUrl } : process.env;
if (directUrl) console.log("ℹ️  Migracje: bezpośrednie połączenie z bazą (z pominięciem poolera).");

function prisma(args, { capture = false, env = {} } = {}) {
  const result = spawnSync("npx", ["prisma", ...args], {
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...baseEnv, ...env },
  });
  if (capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) fail("Brak zmiennej DATABASE_URL — nie można zastosować migracji.");

// Klucze, od których zależą trwałe dane (audyt F-08/F-10). Bez nich deploy się
// zatrzymuje — lepiej zostać przy poprzedniej wersji niż zaszyfrować dane
// kluczem, który zniknie przy zmianie AUTH_SECRET.
if (process.env.VERCEL_ENV === "production" || process.env.REQUIRE_SECURITY_KEYS === "1") {
  const required = ["MFA_ENCRYPTION_KEY", "DATA_ENCRYPTION_KEY", "AUDIT_SIGNING_KEY", "STAFF_AUTH_SECRET", "PATIENT_AUTH_SECRET"];
  const missing = required.filter((name) => (process.env[name] ?? "").length < 32);
  if (missing.length > 0) {
    fail(
      `Brak lub za krótkie (min. 32 znaki) zmienne środowiskowe: ${missing.join(", ")}. ` +
        "Ustaw je w Vercel → Settings → Environment Variables (Production) i ponów deploy. Opis w env.example.",
    );
  }
}

// `migrate deploy` odporne na zawieszoną blokadę migracji: kilka prób w
// odstępach (prawdziwy równoległy deploy zdąży skończyć), a jeśli blokada
// nadal wisi — ostatnia próba bez niej. To bezpieczne: Prisma i tak zapisuje
// rozpoczęcie każdej migracji w _prisma_migrations i odmawia pracy, gdy
// znajdzie migrację w toku.
const LOCK_RETRIES = 3;
const LOCK_RETRY_DELAY_MS = 15_000;

function migrateDeploy() {
  let result;
  for (let attempt = 1; attempt <= LOCK_RETRIES; attempt += 1) {
    result = prisma(["migrate", "deploy"], { capture: true });
    if (result.status === 0 || !result.output.includes("advisory lock")) return result;
    console.log(`\n⏳ Blokada migracji jest zajęta (próba ${attempt}/${LOCK_RETRIES}).`);
    if (attempt < LOCK_RETRIES) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_DELAY_MS);
  }
  console.log("\n⚠️  Blokada migracji nadal zajęta — wygląda na zawieszoną. Ostatnia próba bez blokady.");
  return prisma(["migrate", "deploy"], { capture: true, env: { PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" } });
}

const first = migrateDeploy();
if (first.status === 0) process.exit(0);

if (!first.output.includes("P3005")) fail("`prisma migrate deploy` nie powiódł się (szczegóły powyżej).");

console.log("\nℹ️  Baza nie ma historii migracji (była tworzona przez `db push`). Sprawdzam, czy można ją oznaczyć jako baseline…");

const diff = prisma(
  // Adres bazy czytany z DATABASE_URL przez datasource w schema.prisma —
  // nie przekazujemy go w argumentach procesu (nie trafi do listy procesów/logów).
  [
    "migrate",
    "diff",
    "--from-schema-datasource",
    "prisma/schema.prisma",
    "--to-schema-datamodel",
    BASELINE_SCHEMA,
    "--exit-code",
  ],
  { capture: true },
);

if (diff.status === 2) {
  fail(
    "Schemat bazy różni się od migracji bazowej 0_init (różnice powyżej). " +
      "Nie oznaczam bazy jako baseline, żeby niczego nie nadpisać. " +
      "Trzeba ręcznie doprowadzić bazę do zgodności z 0_init i ponowić deploy.",
  );
}
if (diff.status !== 0) fail("Nie udało się porównać schematu bazy z migracją bazową (szczegóły powyżej).");

console.log(`✅ Schemat bazy zgodny z ${BASELINE_MIGRATION} — oznaczam jako zastosowaną.`);
if (prisma(["migrate", "resolve", "--applied", BASELINE_MIGRATION]).status !== 0) {
  fail(`Nie udało się oznaczyć migracji ${BASELINE_MIGRATION} jako zastosowanej.`);
}

if (migrateDeploy().status !== 0) fail("`prisma migrate deploy` nie powiódł się po baseline.");
