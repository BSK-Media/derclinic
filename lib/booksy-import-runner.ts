// Planowanie i zapis importu historii z Booksy (klienci i wizyty). Używa tego skrypt scripts/import-booksy.ts
// oraz tymczasowa strona administratora. Plan (planBooksyImport) nie dotyka bazy; zapis (applyBooksyPlan) jest
// idempotentny — rekordy mają stałe identyfikatory bks_…, więc ponowny import niczego nie podwoi.

import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
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
} from "@/lib/booksy-import";

const hash = (value: string) => createHash("sha1").update(value).digest("hex").slice(0, 16);

export type ExistingState = {
  patients: { id: string; name: string; phone: string | null }[];
  users: { id: string; name: string }[];
  services: { id: string; name: string }[];
};

export type PlannedPatient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  createdAt: Date;
  marketing: boolean;
  existing: boolean; // użyty istniejący rekord (nie tworzymy)
};

export type PlannedAppointment = {
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

export type ArchivalUser = { id: string; name: string; login: string };

export type BooksyPlan = {
  patients: PlannedPatient[];
  appointments: PlannedAppointment[];
  archivalUsers: ArchivalUser[];
  summary: Record<string, unknown>;
  serviceMapping: { booksy: string; count: number; to: string; kind: string; score: number }[];
  staffers: { name: string; count: number; archival: boolean }[];
};

export function planBooksyImport(
  input: { clientsCsv: string; appointmentsCsv: string },
  state: ExistingState,
  now: Date = new Date(),
): BooksyPlan {
  const clients = parseCsv(input.clientsCsv);
  const appointments = parseCsv(input.appointmentsCsv);

  // --- specjaliści ---
  const userByName = new Map(state.users.map((u) => [comparableName(u.name), u.id]));
  const staffers = [...new Set(appointments.map((a) => cleanText(a.staffer) ?? "Brak przypisania"))];
  const archivalUsers: ArchivalUser[] = [];
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

  const matchService = buildServiceMatcher(state.services);

  // --- klienci ---
  const firstVisit = new Map<string, Date>();
  let earliestOverall = now;
  for (const a of appointments) {
    const when = warsawLocalToDate(a.booked_from);
    if (!when) continue;
    if (when < earliestOverall) earliestOverall = when;
    const card = cleanText(a.customer_card_id);
    if (card) {
      const cur = firstVisit.get(card);
      if (!cur || when < cur) firstVisit.set(card, when);
    }
  }

  const existingByKey = new Map<string, { id: string; name: string; phone: string | null }>();
  for (const p of state.patients) {
    const phone = normalizePhone(p.phone);
    if (phone) existingByKey.set(`${phone}|${comparableName(p.name)}`, p);
  }

  const planned = new Map<string, PlannedPatient>();
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
  const existingIds = new Set(state.patients.map((p) => p.id));
  for (const p of planned.values()) if (!p.existing && existingIds.has(p.id)) p.existing = true;

  // --- wizyty ---
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
      const name = [cleanText(a.customer_first_name), cleanText(a.customer_last_name)].filter(Boolean).join(" ").replace(/\s+/g, " ");
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
        const id = existing ? existing.id : `bks_d_${hash(key)}`;
        planned.set(key, {
          id,
          name,
          phone,
          email: null,
          note: null,
          createdAt: startsAt,
          marketing: false,
          existing: Boolean(existing) || existingIds.has(id),
        });
      }
    }
    const patient = planned.get(key)!;
    if (startsAt < patient.createdAt) patient.createdAt = startsAt;

    const staffer = cleanText(a.staffer) ?? "Brak przypisania";
    const match = matchService(cleanText(a.service_name) ?? "");
    if (!match) {
      throw new Error(
        "W bazie nie ma usługi zastępczej „Konsultacja z indywidualnie dobranym zabiegiem” — nie mogę przypisać nieznanych usług.",
      );
    }
    const mapped = mapStatus(a.status, startsAt, now);
    const price = toGrosze(a.price);
    const finalPrice = toGrosze(a.final_price) ?? price;
    const statusKey = `${a.status} → ${mapped.status}`;
    statusCounts[statusKey] = (statusCounts[statusKey] ?? 0) + 1;

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

  const patientsToCreate = [...planned.values()].filter((p) => !p.existing);
  const completedWithPrice = plannedAppointments.filter((a) => a.status === "COMPLETED" && (a.priceFinal ?? 0) > 0);
  const byKind: Record<string, number> = { exact: 0, similar: 0, fallback: 0 };
  for (const s of serviceStats.values()) byKind[s.kind] += s.count;

  const summary = {
    klienciWPliku: clients.length,
    pacjenciDoUtworzenia: patientsToCreate.length,
    pacjenciPolaczeniZIstniejacymi: linkedExisting,
    kartyPolaczoneWPliku: mergedInFile,
    pacjenciUtworzeniZWizyt: derivedPatients,
    zgodyMarketingoweDoZapisu: patientsToCreate.filter((p) => p.marketing).length,
    wizytyWPliku: appointments.length,
    wizytyDoZaimportowania: plannedAppointments.length,
    wizytyPominiete: skipped,
    statusy: statusCounts,
    platnosciGotowkaDoUtworzenia: completedWithPrice.length,
    sumaPlatnosciZl: Math.round(completedWithPrice.reduce((s, a) => s + (a.priceFinal ?? 0), 0)) / 100,
    kontaArchiwalneDoUtworzenia: archivalUsers.length,
    dopasowanieUslug: byKind,
  };

  return {
    patients: patientsToCreate,
    appointments: plannedAppointments,
    archivalUsers,
    summary,
    serviceMapping: [...serviceStats.entries()]
      .map(([booksy, s]) => ({ booksy, count: s.count, to: s.to, kind: s.kind, score: s.score }))
      .sort((a, b) => b.count - a.count),
    staffers: staffers.map((name) => ({
      name,
      count: appointments.filter((a) => (cleanText(a.staffer) ?? "Brak przypisania") === name).length,
      archival: archivalUsers.some((u) => u.name === name),
    })),
  };
}

const chunk = <T>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Zapis planu do bazy. Idempotentny dzięki stałym identyfikatorom i skipDuplicates. */
export async function applyBooksyPlan(db: PrismaClient, plan: BooksyPlan, locationId: string, now: Date = new Date()) {
  if (plan.archivalUsers.length) {
    const bcrypt = (await import("bcryptjs")).default;
    const unusable = await bcrypt.hash(randomBytes(32).toString("base64url"), 10);
    for (const u of plan.archivalUsers) {
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
          locationId,
          jobTitle: "Konto archiwalne (import z Booksy)",
        },
      });
    }
  }

  let patientsDone = 0;
  for (const part of chunk(plan.patients, 200)) {
    const res = await db.patient.createMany({
      data: part.map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        note: p.note,
        createdAt: p.createdAt,
        locationId,
      })),
      skipDuplicates: true,
    });
    patientsDone += res.count;
  }

  const withConsent = plan.patients.filter((p) => p.marketing);
  for (const part of chunk(withConsent, 500)) {
    // Zgoda tylko tam, gdzie jeszcze jej nie ma (ponowny import nie dubluje wpisów historii).
    const existing = new Set(
      (await db.patientConsent.findMany({ where: { patientId: { in: part.map((p) => p.id) }, type: "MARKETING" }, select: { patientId: true } })).map(
        (c) => c.patientId,
      ),
    );
    const fresh = part.filter((p) => !existing.has(p.id));
    if (!fresh.length) continue;
    await db.patientConsent.createMany({
      data: fresh.map((p) => ({ patientId: p.id, type: "MARKETING" as const, granted: true, grantedAt: now })),
      skipDuplicates: true,
    });
    await db.patientConsentEvent.createMany({
      data: fresh.map((p) => ({ patientId: p.id, type: "MARKETING" as const, granted: true })),
    });
  }

  let appointmentsDone = 0;
  for (const part of chunk(plan.appointments, 500)) {
    const res = await db.appointment.createMany({
      data: part.map((a) => ({
        id: a.id,
        patientId: a.patientId,
        specialistId: a.specialistId,
        locationId,
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

  const paid = plan.appointments.filter((a) => a.status === "COMPLETED" && (a.priceFinal ?? 0) > 0);
  let paymentsDone = 0;
  for (const part of chunk(paid, 500)) {
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

  return { patientsDone, appointmentsDone, paymentsDone, archivalUsers: plan.archivalUsers.length };
}

/** Stan bazy potrzebny do planu (bez usługi technicznej blokady terminu). */
export async function loadExistingState(db: PrismaClient): Promise<ExistingState> {
  const [patients, users, services] = await Promise.all([
    db.patient.findMany({ select: { id: true, name: true, phone: true } }),
    db.user.findMany({ select: { id: true, name: true } }),
    db.service.findMany({ where: { name: { not: "__DERCLINIC_REZERWACJA_CZASU__" } }, select: { id: true, name: true } }),
  ]);
  return { patients, users, services };
}
