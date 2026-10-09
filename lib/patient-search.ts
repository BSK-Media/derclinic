import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Imię, telefon i e-mail pacjenta są zaszyfrowane w bazie (lib/blind-index.ts), więc wyszukiwanie
// "zawiera" robimy w aplikacji na odszyfrowanych danych: pobieramy kandydatów (z zawężeniem do
// lokalizacji itp.) i filtrujemy w pamięci. Przy skali kliniki to tanie; wynik to lista identyfikatorów,
// którą zapytania mogą dalej łączyć przez `id: { in: ids }`.

type Searchable = { name?: string | null; email?: string | null; phone?: string | null };
export type PatientSearchField = "name" | "email" | "phone";

const lower = (value: string | null | undefined) => (value ?? "").toLocaleLowerCase("pl");
const digitsOf = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

export function patientMatches(
  patient: Searchable,
  query: string,
  fields: readonly PatientSearchField[] = ["name", "email", "phone"],
): boolean {
  const q = lower(query.trim());
  if (!q) return true;
  const qDigits = digitsOf(query);
  return fields.some((field) => {
    if (field === "name") return lower(patient.name).includes(q);
    if (field === "email") return lower(patient.email).includes(q);
    return (patient.phone ?? "").includes(query.trim()) || (qDigits.length >= 3 && digitsOf(patient.phone).includes(qDigits));
  });
}

export async function patientIdsMatching(
  query: string,
  where: Prisma.PatientWhereInput = {},
  fields: readonly PatientSearchField[] = ["name", "email", "phone"],
): Promise<string[]> {
  const candidates = await prisma.patient.findMany({
    where,
    select: { id: true, name: true, email: true, phone: true },
  });
  return candidates.filter((patient) => patientMatches(patient, query, fields)).map((patient) => patient.id);
}

export const comparePolish = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").localeCompare(b ?? "", "pl", { sensitivity: "base" });
