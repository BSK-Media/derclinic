import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";
import { patientMatches } from "@/lib/patient-search";
import { PATIENT_PUBLIC_SELECT } from "@/lib/patient-select";

const MIN_CHARS = 3;
const RESERVATION_PATIENT_NAME = "__DERCLINIC_REZERWACJA_CZASU__";
const LIMIT = 30;

// Wyszukiwarka pacjentów do wyboru przy rezerwacji: wszyscy pacjenci z zakresu użytkownika, dopasowanie „zawiera”
// w nazwisku, telefonie lub e-mailu (dane są zaszyfrowane w bazie, więc dopasowanie robimy po odszyfrowaniu).
// Minimum 3 znaki, wynik ograniczony do 30 pozycji.
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < MIN_CHARS) return NextResponse.json({ ok: true, patients: [], minChars: MIN_CHARS });

  // Administrator wybiera lokalizację w formularzu rezerwacji; konta z przypisaną lokalizacją widzą tylko swoją.
  const requestedLocation = url.searchParams.get("locationId");
  const scope = user!.locationScopeId ? scopedLocationWhere(user!) : requestedLocation ? { locationId: requestedLocation } : {};

  const candidates = await prisma.patient.findMany({ where: scope, select: PATIENT_PUBLIC_SELECT });
  const found = candidates
    .filter((patient) => patient.name !== RESERVATION_PATIENT_NAME && patientMatches(patient, q))
    .sort((a, b) => a.name.localeCompare(b.name, "pl", { sensitivity: "base" }));

  return NextResponse.json({
    ok: true,
    total: found.length,
    patients: found.slice(0, LIMIT).map((p) => ({ id: p.id, name: p.name, phone: p.phone, locationId: p.locationId })),
  });
}
