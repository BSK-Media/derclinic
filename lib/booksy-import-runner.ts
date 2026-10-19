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
import { RFM_SEGMENT_LABELS, RFM_SEGMENT_ORDER, computeRfm, type RfmConfig } from "@/lib/rfm";

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
export type ArchivalService = { id: string; name: string; durationMin: number };

/** Wybór dla nazwy usługi z Booksy: id istniejącej usługi albo ARCHIVE (utworzenie usługi archiwalnej). */
export type ServiceDecisions = Record<string, string>;
export const ARCHIVE = "ARCHIVE";

export type ServiceMappingRow = {
  booksy: string;
  count: number;
  /** exact — nazwa zgadza się z usługą aplikacji; similar — podobna (do potwierdzenia); none — brak odpowiednika. */
  kind: "exact" | "similar" | "none";
  suggestedId: string | null;
  suggestedName: string | null;
  /** Aktualny wybór: id usługi albo ARCHIVE. */
  selected: string;
};

export type BooksyPlan = {
  patients: PlannedPatient[];
  appointments: PlannedAppointment[];
  archivalUsers: ArchivalUser[];
  archivalServices: ArchivalService[];
  summary: Record<string, unknown>;
  serviceMapping: ServiceMappingRow[];
  staffers: { name: string; count: number; archival: boolean }[];
};

export function planBooksyImport(
  input: { clientsCsv: string; appointmentsCsv: string },
  state: ExistingState,
  now: Date = new Date(),
  decisions: ServiceDecisions = {},
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
  const validServiceIds = new Set(state.services.map((s) => s.id));
  const serviceNameById = new Map(state.services.map((s) => [s.id, s.name]));

  // Najczęstszy czas trwania wizyty dla nazwy usługi — do usług archiwalnych.
  const durationVotes = new Map<string, Map<number, number>>();
  for (const a of appointments) {
    const start = warsawLocalToDate(a.booked_from);
    const end = warsawLocalToDate(a.booked_till);
    if (!start || !end || end <= start) continue;
    const key = comparableName(cleanText(a.service_name) ?? "");
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    const votes = durationVotes.get(key) ?? new Map<number, number>();
    votes.set(minutes, (votes.get(minutes) ?? 0) + 1);
    durationVotes.set(key, votes);
  }
  const modalDuration = (key: string) => {
    const votes = durationVotes.get(key);
    if (!votes) return 30;
    return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  // Rozstrzygnięcie usługi dla każdej nazwy z Booksy (raz na nazwę).
  const archivalServices = new Map<string, ArchivalService>();
  const resolved = new Map<string, { serviceId: string; customName: string | null }>();
  const resolveService = (rawName: string) => {
    const cached = resolved.get(rawName);
    if (cached) return cached;
    const name = cleanText(rawName) ?? "Wizyta (bez nazwy usługi)";
    const match = matchService(name);
    const decision = decisions[rawName];
    let result: { serviceId: string; customName: string | null };
    const archive = () => {
      const key = comparableName(name);
      const id = `bks_s_${hash(key)}`;
      if (!archivalServices.has(id)) archivalServices.set(id, { id, name, durationMin: modalDuration(key) });
      return { serviceId: id, customName: null };
    };
    if (decision === ARCHIVE) result = archive();
    else if (decision && validServiceIds.has(decision)) result = { serviceId: decision, customName: name };
    else if (match && match.kind === "exact") result = { serviceId: match.serviceId, customName: null };
    else if (match && match.kind === "similar") result = { serviceId: match.serviceId, customName: name };
    else result = archive();
    resolved.set(rawName, result);
    return result;
  };

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
  const serviceCounts = new Map<string, number>();
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
    const service = resolveService(a.service_name);
    const mapped = mapStatus(a.status, startsAt, now);
    const price = toGrosze(a.price);
    const finalPrice = toGrosze(a.final_price) ?? price;
    const statusKey = `${a.status} → ${mapped.status}`;
    statusCounts[statusKey] = (statusCounts[statusKey] ?? 0) + 1;

    serviceCounts.set(a.service_name, (serviceCounts.get(a.service_name) ?? 0) + 1);

    plannedAppointments.push({
      id: `bks_a_${a.booking_id}`,
      patientId: patient.id,
      specialistId: stafferToUser.get(staffer)!,
      serviceId: service.serviceId,
      customServiceName: service.customName,
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
  const serviceMapping: ServiceMappingRow[] = [...serviceCounts.entries()]
    .map(([booksy, count]) => {
      const name = cleanText(booksy) ?? "Wizyta (bez nazwy usługi)";
      const match = matchService(name);
      const kind: ServiceMappingRow["kind"] = match?.kind === "exact" ? "exact" : match?.kind === "similar" ? "similar" : "none";
      const chosen = resolveService(booksy);
      return {
        booksy,
        count,
        kind,
        suggestedId: kind === "none" ? null : match!.serviceId,
        suggestedName: kind === "none" ? null : (serviceNameById.get(match!.serviceId) ?? null),
        selected: archivalServices.has(chosen.serviceId) ? ARCHIVE : chosen.serviceId,
      };
    })
    .sort((a, b) => b.count - a.count);
  const byKind = { mapowaneDokladnie: 0, mapowanePodobne: 0, archiwalne: 0 };
  for (const row of serviceMapping) {
    if (row.selected === ARCHIVE) byKind.archiwalne += row.count;
    else if (row.kind === "exact") byKind.mapowaneDokladnie += row.count;
    else byKind.mapowanePodobne += row.count;
  }

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
    uslugiArchiwalneDoUtworzenia: archivalServices.size,
  };

  return {
    patients: patientsToCreate,
    appointments: plannedAppointments,
    archivalUsers,
    summary,
    archivalServices: [...archivalServices.values()],
    serviceMapping,
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

  if (plan.archivalServices.length) {
    await db.service.createMany({
      data: plan.archivalServices.map((s) => ({
        id: s.id,
        name: s.name,
        category: "Archiwum (import z Booksy)",
        durationMin: s.durationMin,
        isArchived: true,
      })),
      skipDuplicates: true,
    });
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

  return {
    patientsDone,
    appointmentsDone,
    paymentsDone,
    archivalUsers: plan.archivalUsers.length,
    archivalServices: plan.archivalServices.length,
  };
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

/**
 * Podgląd segmentów RFM dla pacjentów z importu (liczony tylko z historii z Booksy, według bieżących ustawień RFM).
 * Po zapisie segmenty liczą się już ze wszystkich danych w systemie.
 */
export function previewSegments(plan: BooksyPlan, windowDays: number, config: RfmConfig, now: Date = new Date()) {
  const windowStart = new Date(now.getTime() - windowDays * 24 * 3600 * 1000);
  const agg = new Map<string, { lastAt: Date; frequency: number; monetary: number }>();
  for (const a of plan.appointments) {
    if (a.status !== "COMPLETED") continue;
    const cur = agg.get(a.patientId) ?? { lastAt: a.startsAt, frequency: 0, monetary: 0 };
    if (a.startsAt > cur.lastAt) cur.lastAt = a.startsAt;
    if (a.startsAt >= windowStart) {
      cur.frequency += 1;
      cur.monetary += a.priceFinal ?? a.priceEstimate ?? 0;
    }
    agg.set(a.patientId, cur);
  }
  const scored = computeRfm([...agg.entries()].map(([patientId, v]) => ({ patientId, ...v })), now, config);
  return RFM_SEGMENT_ORDER.map((segment) => ({
    segment,
    label: RFM_SEGMENT_LABELS[segment].label,
    count: scored.filter((r) => r.segment === segment).length,
  }));
}
