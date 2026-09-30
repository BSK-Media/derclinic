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

function prisma(args, { capture = false } = {}) {
  const result = spawnSync("npx", ["prisma", ...args], {
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
    env: process.env,
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

const first = prisma(["migrate", "deploy"], { capture: true });
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

if (prisma(["migrate", "deploy"]).status !== 0) fail("`prisma migrate deploy` nie powiódł się po baseline.");
