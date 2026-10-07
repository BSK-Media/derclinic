import { cookies, headers } from "next/headers";
import { sessionImpersonatorName, sessionOperatorName } from "@/lib/session-core";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { maskPii, sanitizeAuditData } from "@/lib/audit-format";
import { signAuditEntry } from "@/lib/audit-signature";

export { diffFields, clip, formatWarsaw } from "@/lib/audit-format";

// Kto wykonał akcję:
//  * STAFF   — pracownik (id konta User); imię, login i rolę dopisujemy sami
//              z bazy, żeby wywołania nie musiały ich przekazywać,
//  * PATIENT — zalogowany pacjent z panelu klienta (contact = telefon),
//  * GUEST   — niezalogowana osoba (rezerwacja online jako gość, nieudane
//              logowanie) — zapisujemy to, co sama podała: imię i kontakt
//              (telefon albo wpisany login); to dane deklarowane, nie
//              potwierdzone tożsamości,
//  * SYSTEM  — zadanie systemowe.
export type AuditActor =
  | { type: "STAFF"; id: string }
  | { type: "PATIENT"; id: string; name?: string | null; contact?: string | null }
  | { type: "GUEST"; name?: string | null; contact?: string | null }
  | { type: "SYSTEM"; name?: string | null };

type LogAuditBase = {
  action: string; // np. CREATE, UPDATE, DELETE, LOGIN, LOGOUT
  entity: string; // np. Appointment, Patient, User, Payment
  entityId?: string | null;
  // Jedno zdanie po polsku: kto/co/z czego na co. Wyświetlane w zakładce Logi.
  summary?: string | null;
  // Szczegóły techniczne (wartości przed/po, kwoty, id powiązanych rekordów).
  data?: unknown;
  // Gdy zdarzenie jest częścią transakcji, przekaż jej klienta: wpis dziennika
  // zapisze się (albo wycofa) razem ze zmianą — nie ma zmiany bez śladu.
  tx?: Prisma.TransactionClient;
};

export type LogAuditInput = LogAuditBase &
  (
    | { /** Skrót dla pracownika (STAFF). */ actorId: string; actor?: undefined }
    | { actor: AuditActor; actorId?: undefined }
  );

type ResolvedActor = {
  actorType: "STAFF" | "PATIENT" | "GUEST" | "SYSTEM";
  actorId: string | null;
  actorName: string | null;
  actorLogin: string | null;
  actorRole: string | null;
};

async function requestContext(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  try {
    const h = (await headers());
    const forwarded = h.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
    const ua = h.get("user-agent");
    return { ipAddress: ip ? ip.slice(0, 64) : null, userAgent: ua ? ua.slice(0, 300) : null };
  } catch {
    // poza kontekstem żądania (skrypt, test) — zapisujemy bez IP
    return { ipAddress: null, userAgent: null };
  }
}

async function currentOperatorName(userId: string): Promise<string | null> {
  try {
    const token = (await cookies()).get("bsk_session")?.value;
    return await sessionOperatorName(token, userId);
  } catch {
    // poza kontekstem żądania (skrypt, test) — bez operatora
    return null;
  }
}

async function currentImpersonatorName(userId: string): Promise<string | null> {
  try {
    const token = (await cookies()).get("bsk_session")?.value;
    return await sessionImpersonatorName(token, userId);
  } catch {
    // poza kontekstem żądania (skrypt, test) — bez administratora
    return null;
  }
}

async function resolveActor(
  client: Prisma.TransactionClient | typeof prisma,
  input: LogAuditInput,
): Promise<ResolvedActor> {
  const actor: AuditActor = input.actor ?? { type: "STAFF", id: input.actorId! };

  if (actor.type === "STAFF") {
    const user = await client.user.findUnique({
      where: { id: actor.id },
      select: { name: true, login: true, role: true },
    });
    // Konto wspólne (recepcja): do nazwy konta dopisujemy osobę wybraną PIN-em.
    const operatorName = await currentOperatorName(actor.id);
    // Administrator pracujący na tym koncie: wpis jest oznaczony jego imieniem.
    const impersonatorName = await currentImpersonatorName(actor.id);
    const suffix = impersonatorName ? ` [administrator: ${impersonatorName}]` : operatorName ? ` (${operatorName})` : "";
    return {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: user?.name ? `${user.name}${suffix}` : null,
      actorLogin: user?.login ?? null,
      actorRole: user?.role ?? null,
    };
  }
  if (actor.type === "PATIENT") {
    return {
      actorType: "PATIENT",
      actorId: actor.id,
      actorName: actor.name ?? null,
      actorLogin: actor.contact ?? null,
      actorRole: null,
    };
  }
  if (actor.type === "GUEST") {
    return {
      actorType: "GUEST",
      actorId: null,
      actorName: actor.name ?? null,
      actorLogin: actor.contact ?? null,
      actorRole: null,
    };
  }
  return { actorType: "SYSTEM", actorId: null, actorName: actor.name ?? "System", actorLogin: null, actorRole: null };
}

/**
 * Dopisuje wpis do dziennika zdarzeń (tabela AuditLog, widoczna dla admina w
 * zakładce "Logi"). Wpisy są niezmienne — nie ma funkcji edycji ani usuwania.
 *
 * Błąd zapisu:
 *  * bez `tx` — jest tylko logowany na serwerze (razem z pełną treścią wpisu,
 *    żeby dało się go odtworzyć); nie przerywamy żądania, które już zmieniło dane,
 *  * z `tx` — jest rzucany dalej, więc cała transakcja (zmiana + log) się wycofuje.
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  const client = input.tx ?? prisma;
  let entry: Prisma.AuditLogUncheckedCreateInput | null = null;
  try {
    const actor = await resolveActor(client, input);
    const data = sanitizeAuditData(input.data);
    const base = {
      id: randomUUID(),
      createdAt: new Date(),
      ...actor,
      // Kontakt podany przez gościa/pacjenta (telefon, e-mail) — maskowany.
      actorLogin: actor.actorType === "STAFF" ? actor.actorLogin : actor.actorLogin ? maskPii(actor.actorLogin) : null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary ? maskPii(input.summary).slice(0, 2000) : null,
      data: data === null ? undefined : (data as Prisma.InputJsonValue),
      ...(await requestContext()),
    };
    entry = { ...base, signature: signAuditEntry({ ...base, data: base.data ?? null }) };
    await client.auditLog.create({ data: entry });
  } catch (e) {
    let payload = "";
    try {
      payload = JSON.stringify(entry ?? { action: input.action, entity: input.entity, entityId: input.entityId });
    } catch {
      /* ignoruj */
    }
    console.error("[audit] NIE ZAPISANO wpisu dziennika", payload, e);
    if (input.tx) throw e;
  }
}

/**
 * Wpisy sprzed wprowadzenia migawki aktora (actorName = null) mają tylko
 * actorId pracownika. Ta funkcja dociąga ich aktualne imiona jednym zapytaniem.
 */
export async function resolveStaffNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}
