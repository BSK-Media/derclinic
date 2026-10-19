// Import historii z Booksy: klienci i wizyty (clients.csv, appointments.csv).
//
//   npm run import:booksy -- --dir "C:\Users\dell\Downloads"               -> próba na bazie, BEZ zapisu
//   npm run import:booksy -- --dir "C:\Users\dell\Downloads" --apply       -> zapis do bazy
//   npm run import:booksy -- --dir "C:\Users\dell\Downloads" --offline     -> próba bez bazy (usługi i konta z seed.ts)
//
// Zasady:
//  * nie tworzy usług ani produktów — wizyty wskazują na istniejące usługi (patrz lib/booksy-import.ts),
//    a oryginalną nazwę z Booksy zachowuje w polu „nazwa własna”;
//  * nie dubluje: klient z tym samym telefonem i nazwiskiem, który już jest w bazie, zostaje użyty ponownie;
//    identyfikatory zaimportowanych rekordów są stałe (bks_…), więc ponowny import niczego nie podwoi;
//  * za historyczne wizyty nie naliczamy punktów lojalnościowych i nie wysyłamy żadnych wiadomości;
//  * raport (mapowanie usług i specjalistów, liczby) trafia do katalogu --report (domyślnie ./booksy-import-report).

import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import {
  buildServiceMatcher,
  cleanText,
  comparableName,
  mapStatus,
  normalizeEmail,
  normalizePhone,
  parseCsv,
  toGrosze,
  warsawLocalToDate,
} from "../lib/booksy-import";

type Args = { dir: string; apply: boolean; offline: boolean; report: string; location: string };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    dir: get("dir") ?? ".",
    apply: argv.includes("--apply"),
    offline: argv.includes("--offline"),
    report: get("report") ?? "booksy-import-report",
    location: get("location") ?? "grodzisk-mazowiecki",
  };
}

const hash = (value: string) => createHash("sha1").update(value).digest("hex").slice(0, 16);

type ExistingPatient = { id: string; name: string; phone: string | null };
type ExistingUser = { id: string; name: string };
type ExistingService = { id: string; name: string };

type PlannedPatient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  createdAt: Date;
  marketing: boolean;
  existing: boolean; // użyty istniejący rekord (nie tworzymy)
};

async function main() {
  const args = parseArgs();
  const read = (file: string) => parseCsv(fs.readFileSync(path.join(args.dir, file), "utf8"));
  const clients = read("clients.csv");
  const appointments = read("appointments.csv");
  const now = new Date();

  // --- stan bazy ---------------------------------------------------------------------------
  let prisma: typeof import("../lib/prisma").prisma | null = null;
  let existingPatients: ExistingPatient[] = [];
  let existingUsers: ExistingUser[] = [];
  let existingServices: ExistingService[] = [];

  if (args.offline) {
    const seed = fs.readFileSync(path.join(process.cwd(), "prisma", "seed.ts"), "utf8");
    existingUsers = [...seed.matchAll(/specialistCode:\s*\d+,\s*name:\s*"([^"]+)"/g)].map((m, i) => ({ id: `u${i}`, name: m[1] }));
    existingServices = [...seed.matchAll(/\{\s*name:\s*['"]([^'"]+)['"],\s*price:\s*(\d+)/g)].map((m, i) => ({ id: `s${i}`, name: m[1] }));
  } else {
    ({ prisma } = await import("../lib/prisma"));
    const location = await prisma.location.findUnique({ where: { id: args.location }, select: { id: true } });
    if (!location) throw new Error(`Brak lokalizacji „${args.location}” w bazie.`);
    existingPatients = (await prisma.patient.findMany({ select: { id: true, name: true, phone: true } })) as ExistingPatient[];
    existingUsers = await prisma.user.findMany({ select: { id: true, name: true } });
    existingServices = await prisma.service.findMany({
      where: { name: { not: "__DERCLINIC_REZERWACJA_CZASU__" } },
      select: { id: true, name: true },
    });
  }

  // --- specjaliści -------------------------------------------------------------------------
  const userByName = new Map(existingUsers.map((u) => [comparableName(u.name), u.id]));
  const staffers = [...new Set(appointments.map((a) => cleanText(a.staffer) ?? "Brak przypisania"))];
  const archivalUsers: { id: string; name: string; login: string }[] = [];
  const stafferToUser = new Map<string, string>();
  for (const name of staffers) {
    const found = userByName.get(comparableName(name));
    if (found) {
      stafferToUser.set(name, found);
      continue;
    }
    const id = `bks_u_${hash(comparableName(name))}`;
    archivalUsers.push({ id, name, login: `booksy-archiwum-${hash(comparableName(name)).slice(0, 8)}` });
    stafferToUser.set(name, id);
  }

  // --- usługi ------------------------------------------------------------------------------
  const matchService = buildServiceMatcher(existingServices);

  // --- klienci -----------------------------------------------------------------------------
  const firstVisit = new Map<string, Date>(); // klucz karty -> najwcześniejsza wizyta
  const earliestOverall = appointments
    .map((a) => warsawLocalToDate(a.booked_from))
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? now;

  const existingByKey = new Map<string, ExistingPatient>();
  for (const p of existingPatients) {
    const phone = normalizePhone(p.phone);
    if (phone) existingByKey.set(`${phone}|${comparableName(p.name)}`, p);
  }

  const planned = new Map<string, PlannedPatient>(); // klucz osoby -> pacjent
  const cardToKey = new Map<string, string>();
  const keyFor = (name: string, phone: string | null, fallbackId: string) =>
    phone ? `${phone}|${comparableName(name)}` : `nophone|${fallbackId}`;

  const noteParts = (c: Record<string, string>) => {
    const parts: string[] = [];
    const note = cleanText(c.business_secret_note);
    if (note) parts.push(note);
    if (c.blacklisted === "1") parts.push("Booksy: klient oznaczony jako czarna lista");
    if (c.discount && c.discount !== "0" && Number(c.discount) > 0) parts.push(`Booksy: rabat ${c.discount}%`);
    const address = [cleanText(c.address), cleanText(c.city)].filter(Boolean).join(", ");
    if (address) parts.push(`Adres: ${address}`);
    return parts.length ? parts.join("\n") : null;
  };

  for (const a of appointments) {
    const card = cleanText(a.customer_card_id);
    const when = warsawLocalToDate(a.booked_from);
    if (card && when) {
      const cur = firstVisit.get(card);
      if (!cur || when < cur) firstVisit.set(card, when);
    }
  }

  let mergedInFile = 0;
  let linkedExisting = 0;
  for (const c of clients) {
    const name = (cleanText(c.name) ?? "").replace(/\s+/g, " ");
    if (!name) continue;
    const phone = normalizePhone(c.cell_phone);
    const key = keyFor(name, phone, c.client_card_id);
    cardToKey.set(c.client_card_id, key);
    const created = firstVisit.get(c.client_card_id) ?? earliestOverall;
    const marketing = c.web_communication_agreement === "1";

    const already = planned.get(key);
    if (already) {
      // Ta sama osoba (telefon + nazwisko) z drugą kartą w Booksy — łączymy w jednego pacjenta.
      mergedInFile++;
      if (created < already.createdAt) already.createdAt = created;
      already.marketing = already.marketing || marketing;
      const extraNote = noteParts(c);
      if (extraNote && !already.note?.includes(extraNote)) already.note = [already.note, extraNote].filter(Boolean).join("\n");
      if (!already.email) already.email = normalizeEmail(c.email);
      continue;
    }

    const existing = phone ? existingByKey.get(key) : undefined;
    if (existing) linkedExisting++;
    planned.set(key, {
      id: existing ? existing.id : `bks_c_${c.client_card_id}`,
      name,
      phone,
      email: normalizeEmail(c.email),
      note: noteParts(c),
      createdAt: created,
      marketing,
      existing: Boolean(existing),
    });
  }

  // Rekordy z poprzedniego (częściowego) importu — nie tworzymy ich drugi raz.
  const existingIds = new Set(existingPatients.map((p) => p.id));
  for (const p of planned.values()) if (!p.existing && existingIds.has(p.id)) p.existing = true;

  // --- wizyty ------------------------------------------------------------------------------
  type PlannedAppointment = {
    id: string;
    patientId: string;
    specialistId: string;
    serviceId: string;
    customServiceName: string | null;
    startsAt: Date;
    endsAt: Date;
    status: "SCHEDULED" | "COMPLETED" | "CANCELED" | "NO_SHOW";
    approved: boolean;
    priceEstimate: number | null;
    priceFinal: number | null;
    note: string | null;
  };
  const plannedAppointments: PlannedAppointment[] = [];
  const skipped = { badDate: 0, noPatient: 0 };
  let derivedPatients = 0;
  const serviceStats = new Map<string, { count: number; to: string; kind: string; score: number }>();
  const statusCounts: Record<string, number> = {};

  for (const a of appointments) {
    const startsAt = warsawLocalToDate(a.booked_from);
    const endsAtRaw = warsawLocalToDate(a.booked_till);
    if (!startsAt) {
      skipped.badDate++;
      continue;
    }
    const endsAt = endsAtRaw && endsAtRaw > startsAt ? endsAtRaw : new Date(startsAt.getTime() + 30 * 60 * 1000);

    // Pacjent: po karcie; bez karty — po telefonie i nazwisku z wiersza wizyty; w ostateczności nowa karta z tych danych.
    const card = cleanText(a.customer_card_id);
    let key = card ? cardToKey.get(card) : undefined;
    if (!key) {
      const name = ([cleanText(a.customer_first_name), cleanText(a.customer_last_name)].filter(Boolean).join(" ")).replace(/\s+/g, " ");
      const phone = normalizePhone(a.customer_card_phone);
      if (!name) {
        skipped.noPatient++;
        continue;
      }
      key = keyFor(name, phone, `appt-${a.booking_id}`);
      if (!planned.has(key)) {
        const existing = phone ? existingByKey.get(key) : undefined;
        if (existing) linkedExisting++;
        derivedPatients++;
        planned.set(key, {
          id: existing ? existing.id : `bks_d_${hash(key)}`,
          name,
          phone,
          email: null,
          note: null,
          createdAt: startsAt,
          marketing: false,
          existing: Boolean(existing),
        });
      }
    }
    const patient = planned.get(key)!;
    if (startsAt < patient.createdAt) patient.createdAt = startsAt;

    const staffer = cleanText(a.staffer) ?? "Brak przypisania";
    const match = matchService(cleanText(a.service_name) ?? "");
    if (!match) throw new Error("Brak usługi zastępczej w bazie — nie mogę przypisać usług (dodaj/zachowaj usługę „Konsultacja z indywidualnie dobranym zabiegiem”).");
    const mapped = mapStatus(a.status, startsAt, now);
    const price = toGrosze(a.price);
    const finalPrice = toGrosze(a.final_price) ?? price;
    statusCounts[`${a.status} → ${mapped.status}`] = (statusCounts[`${a.status} → ${mapped.status}`] ?? 0) + 1;

    const stat = serviceStats.get(a.service_name) ?? { count: 0, to: match.serviceName, kind: match.kind, score: match.score };
    stat.count++;
    serviceStats.set(a.service_name, stat);

    plannedAppointments.push({
      id: `bks_a_${a.booking_id}`,
      patientId: patient.id,
      specialistId: stafferToUser.get(staffer)!,
      serviceId: match.serviceId,
      customServiceName: match.kind === "exact" ? null : (cleanText(a.service_name) ?? null),
      startsAt,
      endsAt,
      status: mapped.status,
      approved: mapped.approved,
      priceEstimate: price,
      priceFinal: mapped.status === "COMPLETED" ? finalPrice : null,
      note: cleanText(a.business_note),
    });
  }

  // --- raport ------------------------------------------------------------------------------
  const patientsToCreate = [...planned.values()].filter((p) => !p.existing);
  const completedWithPrice = plannedAppointments.filter((a) => a.status === "COMPLETED" && (a.priceFinal ?? 0) > 0);
  const byKind = { exact: 0, similar: 0, fallback: 0 } as Record<string, number>;
  for (const s of serviceStats.values()) byKind[s.kind] += s.count;

  const summary = {
    tryb: args.apply ? "ZAPIS" : "PRÓBA (bez zapisu)",
    klienciWPliku: clients.length,
    pacjenciDoUtworzenia: patientsToCreate.length,
    pacjenciPołączeniZIstniejącymi: linkedExisting,
    kartyPołączoneWPliku: mergedInFile,
    pacjenciUtworzeniZWizyt: derivedPatients,
    zgodyMarketingoweDoZapisu: patientsToCreate.filter((p) => p.marketing).length,
    wizytyWPliku: appointments.length,
    wizytyDoZaimportowania: plannedAppointments.length,
    wizytyPominięte: skipped,
    statusy: statusCounts,
    platnosciGotowkaDoUtworzenia: completedWithPrice.length,
    sumaPlatnosciZl: Math.round(completedWithPrice.reduce((s, a) => s + (a.priceFinal ?? 0), 0)) / 100,
    kontaArchiwalneDoUtworzenia: archivalUsers.length,
    dopasowanieUslug: byKind,
  };

  fs.mkdirSync(args.report, { recursive: true });
  fs.writeFileSync(path.join(args.report, "podsumowanie.json"), JSON.stringify(summary, null, 2));
  const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  fs.writeFileSync(
    path.join(args.report, "mapowanie-uslug.csv"),
    ["usluga_booksy;liczba_wizyt;usluga_w_aplikacji;rodzaj;podobienstwo"]
      .concat(
        [...serviceStats.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .map(([name, s]) => [name, s.count, s.to, s.kind, s.score.toFixed(2)].map(csvCell).join(";")),
      )
      .join("\n"),
  );
  fs.writeFileSync(
    path.join(args.report, "specjalisci.csv"),
    ["specjalista_booksy;liczba_wizyt;konto"]
      .concat(
        staffers.map((name) => {
          const archival = archivalUsers.some((u) => u.name === name);
          const count = appointments.filter((a) => (cleanText(a.staffer) ?? "Brak przypisania") === name).length;
          return [name, count, archival ? "NOWE konto archiwalne (wyłączone)" : "istniejące konto"].map(csvCell).join(";");
        }),
      )
      .join("\n"),
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Raport zapisano w: ${path.resolve(args.report)}`);

  if (!args.apply) {
    console.log("\nTo była PRÓBA — nic nie zapisano. Aby zapisać, dodaj --apply.");
    return;
  }
  if (!prisma) throw new Error("Zapis wymaga połączenia z bazą (bez --offline).");

  // --- zapis -------------------------------------------------------------------------------
  const db = prisma;
  const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

  // Konta archiwalne: wyłączone, bez możliwości logowania, niewidoczne w rezerwacjach.
  if (archivalUsers.length) {
    const bcrypt = (await import("bcryptjs")).default;
    const unusable = await bcrypt.hash(randomBytes(32).toString("base64url"), 10);
    for (const u of archivalUsers) {
      await db.user.upsert({
        where: { id: u.id },
        update: {},
        create: {
          id: u.id,
          name: u.name,
          login: u.login,
          passwordHash: unusable,
          role: "SPECIALIST",
          disabledAt: now,
          isVisible: false,
          isAvailable: false,
          locationId: args.location,
          jobTitle: "Konto archiwalne (import z Booksy)",
        },
      });
    }
  }

  let patientsDone = 0;
  for (const part of chunk(patientsToCreate, 200)) {
    const res = await db.patient.createMany({
      data: part.map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        note: p.note,
        createdAt: p.createdAt,
        locationId: args.location,
      })),
      skipDuplicates: true,
    });
    patientsDone += res.count;
  }

  const consentPatients = patientsToCreate.filter((p) => p.marketing);
  for (const part of chunk(consentPatients, 500)) {
    await db.patientConsent.createMany({
      data: part.map((p) => ({ patientId: p.id, type: "MARKETING" as const, granted: true, grantedAt: now })),
      skipDuplicates: true,
    });
    await db.patientConsentEvent.createMany({
      data: part.map((p) => ({ patientId: p.id, type: "MARKETING" as const, granted: true })),
    });
  }

  let appointmentsDone = 0;
  for (const part of chunk(plannedAppointments, 500)) {
    const res = await db.appointment.createMany({
      data: part.map((a) => ({
        id: a.id,
        patientId: a.patientId,
        specialistId: a.specialistId,
        locationId: args.location,
        serviceId: a.serviceId,
        customServiceName: a.customServiceName,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        status: a.status,
        approvalStatus: a.approved ? ("APPROVED" as const) : ("PENDING" as const),
        approvedAt: a.approved ? a.endsAt : null,
        priceEstimate: a.priceEstimate,
        priceFinal: a.priceFinal,
        note: a.note,
        // Historia: punkty lojalnościowe nie są naliczane wstecz.
        loyaltyPointsAwardedAt: a.approved ? a.endsAt : null,
      })),
      skipDuplicates: true,
    });
    appointmentsDone += res.count;
  }

  let paymentsDone = 0;
  for (const part of chunk(completedWithPrice, 500)) {
    const res = await db.payment.createMany({
      data: part.map((a) => ({
        id: `bks_p_${a.id.replace("bks_a_", "")}`,
        method: "CASH" as const,
        amount: a.priceFinal!,
        appointmentId: a.id,
        createdAt: a.endsAt,
      })),
      skipDuplicates: true,
    });
    paymentsDone += res.count;
  }

  const { logAudit } = await import("../lib/audit");
  await logAudit({
    actor: { type: "SYSTEM", name: "Import z Booksy" },
    action: "CREATE",
    entity: "BooksyImport",
    entityId: "booksy",
    summary: `Import z Booksy: pacjenci ${patientsDone}, wizyty ${appointmentsDone}, płatności ${paymentsDone}, konta archiwalne ${archivalUsers.length}`,
    data: { patientsDone, appointmentsDone, paymentsDone, archivalUsers: archivalUsers.length },
  }).catch(() => undefined);

  console.log(`\nZAPISANO: pacjenci ${patientsDone}, wizyty ${appointmentsDone}, płatności ${paymentsDone}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌", error instanceof Error ? error.message : error);
    process.exit(1);
  });
