import { prisma } from "@/lib/prisma";

// Dane podmiotu (kliniki) zapisane w Ustawieniach → Dane kliniki. Jeden wiersz o stałym identyfikatorze.
export const CLINIC_PROFILE_ID = "clinic";

export type ClinicProfileValue = {
  name: string | null;
  legalForm: string | null;
  address: string | null;
  nip: string | null;
  regon: string | null;
  krs: string | null;
  rpwdl: string | null;
};

const EMPTY: ClinicProfileValue = { name: null, legalForm: null, address: null, nip: null, regon: null, krs: null, rpwdl: null };

/** Dane kliniki albo null, gdy żadne pole nie zostało uzupełnione. */
export async function getClinicProfile(): Promise<ClinicProfileValue | null> {
  const row = await prisma.clinicProfile.findUnique({ where: { id: CLINIC_PROFILE_ID } });
  if (!row) return null;
  const value: ClinicProfileValue = {
    name: row.name ?? null,
    legalForm: row.legalForm ?? null,
    address: row.address ?? null,
    nip: row.nip ?? null,
    regon: row.regon ?? null,
    krs: row.krs ?? null,
    rpwdl: row.rpwdl ?? null,
  };
  return Object.values(value).some(Boolean) ? value : null;
}

export { EMPTY as EMPTY_CLINIC_PROFILE };
