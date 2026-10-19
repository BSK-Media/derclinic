// Import historii z Booksy z linii poleceń (to samo, co tymczasowa strona Ustawienia → Import z Booksy).
//
//   npm run import:booksy -- --dir "C:\Users\dell\Downloads"             -> próba na bazie, BEZ zapisu
//   npm run import:booksy -- --dir "C:\Users\dell\Downloads" --apply     -> zapis do bazy
//   npm run import:booksy -- --dir "C:\Users\dell\Downloads" --offline   -> próba bez bazy (usługi i konta z seed.ts)

import fs from "node:fs";
import path from "node:path";
import { applyBooksyPlan, loadExistingState, planBooksyImport, type ExistingState } from "../lib/booksy-import-runner";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const dir = arg("dir") ?? ".";
  const apply = process.argv.includes("--apply");
  const offline = process.argv.includes("--offline");
  const location = arg("location") ?? "grodzisk-mazowiecki";
  const clientsCsv = fs.readFileSync(path.join(dir, "clients.csv"), "utf8");
  const appointmentsCsv = fs.readFileSync(path.join(dir, "appointments.csv"), "utf8");

  let state: ExistingState;
  let db: Awaited<typeof import("../lib/prisma")>["prisma"] | null = null;
  if (offline) {
    const seed = fs.readFileSync(path.join(process.cwd(), "prisma", "seed.ts"), "utf8");
    state = {
      patients: [],
      users: [...seed.matchAll(/specialistCode:\s*\d+,\s*name:\s*"([^"]+)"/g)].map((m, i) => ({ id: `u${i}`, name: m[1] })),
      services: [...seed.matchAll(/\{\s*name:\s*['"]([^'"]+)['"],\s*price:\s*(\d+)/g)].map((m, i) => ({ id: `s${i}`, name: m[1] })),
    };
  } else {
    ({ prisma: db } = await import("../lib/prisma"));
    state = await loadExistingState(db);
  }

  const plan = planBooksyImport({ clientsCsv, appointmentsCsv }, state);
  console.log(JSON.stringify(plan.summary, null, 2));

  if (!apply) {
    console.log("\nTo była PRÓBA — nic nie zapisano. Aby zapisać, dodaj --apply.");
    return;
  }
  if (!db) throw new Error("Zapis wymaga połączenia z bazą (bez --offline).");
  const done = await applyBooksyPlan(db, plan, location);
  console.log(`\nZAPISANO: pacjenci ${done.patientsDone}, wizyty ${done.appointmentsDone}, płatności ${done.paymentsDone}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌", error instanceof Error ? error.message : error);
    process.exit(1);
  });
