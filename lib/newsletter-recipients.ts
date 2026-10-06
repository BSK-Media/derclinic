import type { Prisma } from "@prisma/client";

/**
 * Kto dostaje newsletter: klient z aktywną zgodą marketingową, z adresem
 * e-mail i bez usuniętego konta. Przy zawężeniu do lokalizacji (manager lub
 * wybrana lokalizacja admina) — tylko klienci tej lokalizacji.
 */
export function newsletterRecipientsWhere(locationScopeId: string | null): Prisma.PatientWhereInput {
  return {
    email: { not: null },
    NOT: { email: "" },
    accountDeletedAt: null,
    consents: { some: { type: "MARKETING", granted: true } },
    ...(locationScopeId ? { locationId: locationScopeId } : {}),
  };
}
