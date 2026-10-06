import type { Prisma } from "@prisma/client";
import { z } from "zod";

// Odbiorcy newslettera. Wybór (wszyscy / listy / ręcznie wybrani klienci) tylko
// ZAWĘŻA grono — każdy odbiorca musi mieć aktywną zgodę marketingową, adres
// e-mail i nieusunięte konto. Klient bez zgody nie dostanie newslettera, nawet
// jeśli ktoś doda go do listy.

export const AudienceSchema = z.object({
  type: z.enum(["ALL", "LISTS", "PATIENTS"]),
  listIds: z.array(z.string().min(1).max(100)).max(100).default([]),
  patientIds: z.array(z.string().min(1).max(100)).max(5000).default([]),
});

export type NewsletterAudience = z.infer<typeof AudienceSchema>;

export const DEFAULT_AUDIENCE: NewsletterAudience = { type: "ALL", listIds: [], patientIds: [] };

/** Klient, który w ogóle może dostać newsletter (zgoda + e-mail + aktywne konto). */
export function subscribedPatientWhere(locationScopeId: string | null): Prisma.PatientWhereInput {
  return {
    email: { not: null },
    NOT: { email: "" },
    accountDeletedAt: null,
    consents: { some: { type: "MARKETING", granted: true } },
    ...(locationScopeId ? { locationId: locationScopeId } : {}),
  };
}

/**
 * Kto dostaje wysyłkę dla wybranych odbiorców. Przy zawężeniu do lokalizacji
 * (manager lub wybrana lokalizacja admina) — tylko klienci tej lokalizacji.
 */
export function newsletterRecipientsWhere(
  locationScopeId: string | null,
  audience: NewsletterAudience = DEFAULT_AUDIENCE,
): Prisma.PatientWhereInput {
  const base = subscribedPatientWhere(locationScopeId);
  if (audience.type === "LISTS") {
    return { ...base, newsletterListMemberships: { some: { listId: { in: audience.listIds } } } };
  }
  if (audience.type === "PATIENTS") {
    return { ...base, id: { in: audience.patientIds } };
  }
  return base;
}

/** Odtwarza wybór odbiorców zapisany w kampanii. */
export function audienceFromCampaign(campaign: {
  audienceType: string;
  audienceListIds: string[];
  audiencePatientIds: string[];
}): NewsletterAudience {
  const type = campaign.audienceType === "LISTS" || campaign.audienceType === "PATIENTS" ? campaign.audienceType : "ALL";
  return { type, listIds: campaign.audienceListIds ?? [], patientIds: campaign.audiencePatientIds ?? [] };
}
