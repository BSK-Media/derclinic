import { describe, expect, it } from "vitest";
import { diffFields } from "./audit-format";
import { APPOINTMENT_AUDIT_FIELDS, appointmentSnapshot, describeAppointmentChanges } from "./audit-appointment";

const base = {
  status: "SCHEDULED",
  priceFinal: 10000,
  priceEstimate: 10000,
  note: null as string | null,
  startsAt: new Date("2026-10-12T08:00:00.000Z"), // 10:00 czasu warszawskiego (CEST)
  endsAt: new Date("2026-10-12T09:00:00.000Z"),
  specialistId: "s1",
  serviceId: "svc1",
};

describe("describeAppointmentChanges", () => {
  it("opisuje zmianę statusu z polskimi nazwami", () => {
    const changes = diffFields(
      appointmentSnapshot(base),
      appointmentSnapshot({ ...base, status: "COMPLETED" }),
      APPOINTMENT_AUDIT_FIELDS,
    );
    expect(describeAppointmentChanges(changes)).toBe("status: Zaplanowana → Zakończona");
  });

  it("opisuje termin (czas warszawski) i cenę", () => {
    const changes = diffFields(
      appointmentSnapshot(base),
      appointmentSnapshot({
        ...base,
        startsAt: new Date("2026-10-12T09:00:00.000Z"),
        endsAt: new Date("2026-10-12T10:00:00.000Z"),
        priceFinal: 9000,
      }),
      APPOINTMENT_AUDIT_FIELDS,
    );
    const text = describeAppointmentChanges(changes);
    expect(text).toContain("termin: 12.10.2026 10:00 → 12.10.2026 11:00");
    expect(text).toContain("cena końcowa:");
    expect(text).toContain("→");
  });

  it("zgłasza brak zmian", () => {
    const changes = diffFields(appointmentSnapshot(base), appointmentSnapshot(base), APPOINTMENT_AUDIT_FIELDS);
    expect(changes).toBeUndefined();
    expect(describeAppointmentChanges(changes)).toBe("bez zmian wartości");
  });

  it("opisuje notatkę i zmianę specjalisty bez ujawniania id", () => {
    const changes = diffFields(
      appointmentSnapshot(base),
      appointmentSnapshot({ ...base, note: "Alergia na lidokainę", specialistId: "s2" }),
      APPOINTMENT_AUDIT_FIELDS,
    );
    const text = describeAppointmentChanges(changes);
    expect(text).toContain("zmieniono specjalistę");
    expect(text).toContain("notatka: „Alergia na lidokainę\"");
    expect(text).not.toContain("s2");
  });
});
