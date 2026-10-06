import { describe, expect, it } from "vitest";
import { audienceFromCampaign, newsletterRecipientsWhere } from "./newsletter-recipients";

describe("odbiorcy newslettera", () => {
  it("zawsze wymaga zgody marketingowej, e-maila i aktywnego konta", () => {
    for (const audience of [
      { type: "ALL" as const, listIds: [], patientIds: [] },
      { type: "LISTS" as const, listIds: ["l1"], patientIds: [] },
      { type: "PATIENTS" as const, listIds: [], patientIds: ["p1"] },
    ]) {
      const where = newsletterRecipientsWhere(null, audience);
      expect(where.consents).toEqual({ some: { type: "MARKETING", granted: true } });
      expect(where.accountDeletedAt).toBeNull();
      expect(where.email).toEqual({ not: null });
    }
  });

  it("zawęża do list albo do wybranych klientów", () => {
    expect(newsletterRecipientsWhere(null, { type: "LISTS", listIds: ["l1", "l2"], patientIds: [] })).toMatchObject({
      newsletterListMemberships: { some: { listId: { in: ["l1", "l2"] } } },
    });
    expect(newsletterRecipientsWhere(null, { type: "PATIENTS", listIds: [], patientIds: ["p1"] })).toMatchObject({
      id: { in: ["p1"] },
    });
  });

  it("uwzględnia lokalizację managera", () => {
    expect(newsletterRecipientsWhere("loc1")).toMatchObject({ locationId: "loc1" });
    expect(newsletterRecipientsWhere(null)).not.toHaveProperty("locationId");
  });

  it("odtwarza wybór z kampanii, nieznany typ traktuje jak wszystkich", () => {
    expect(audienceFromCampaign({ audienceType: "LISTS", audienceListIds: ["a"], audiencePatientIds: [] })).toEqual({
      type: "LISTS",
      listIds: ["a"],
      patientIds: [],
    });
    expect(audienceFromCampaign({ audienceType: "???", audienceListIds: [], audiencePatientIds: [] }).type).toBe("ALL");
  });
});
