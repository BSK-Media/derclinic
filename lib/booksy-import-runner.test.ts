import { describe, expect, it } from "vitest";
import { ARCHIVE, planBooksyImport, previewSegments } from "./booksy-import-runner";

const clientsCsv = `client_card_id,name,cell_phone,email,address,city,allergens,discount,booking_count,web_communication_agreement,processing_consent,blacklisted,business_secret_note
1,Anna Test,+48 500100200,None,,,,0,3,1,0,0,
`;
const header = '"price","status","staffer","added_by","booking_id","booked_from","booked_till","customer_id","final_price","source_name","service_name","business_note","appointment_type","customer_card_id","customer_last_name","booking_finished_at","customer_card_phone","customer_first_name"';
const row = (id: string, service: string, status = "Finished") =>
  `"500.0","${status}","Marta Szyderska","","${id}","2025-03-10 10:00:00","2025-03-10 10:30:00","1","500.0","Web","${service}","","Business","1","","2025-03-10 10:30:00","+48 500100200","Anna Test"`;
const appointmentsCsv = [
  header,
  row("1", "Konsultacja dermatologiczna"),
  row("2", "Botoks 3 okolice"),
  row("3", "Laminacja rzęs z farbowaniem"),
].join("\n");

const state = {
  patients: [],
  users: [{ id: "u1", name: "Marta Szyderska" }],
  services: [
    { id: "s1", name: "Konsultacja dermatologiczna" },
    { id: "s2", name: "Toksyna botulinowa BOTOX - 3 okolice" },
    { id: "s3", name: "Toksyna botulinowa BOTOX - 1 okolica" },
  ],
};

describe("planBooksyImport – wybór usług", () => {
  it("dokładne mapuje, podobne sugeruje, bez odpowiednika tworzy jako archiwalną", () => {
    const plan = planBooksyImport({ clientsCsv, appointmentsCsv }, state, new Date("2026-10-15T10:00:00Z"));
    const byName = Object.fromEntries(plan.appointments.map((a) => [a.id, a]));
    expect(byName["bks_a_1"].serviceId).toBe("s1");
    expect(byName["bks_a_1"].customServiceName).toBeNull();
    expect(byName["bks_a_2"].serviceId).toBe("s2");
    expect(byName["bks_a_2"].customServiceName).toBe("Botoks 3 okolice");
    expect(plan.archivalServices).toHaveLength(1);
    expect(plan.archivalServices[0].name).toBe("Laminacja rzęs z farbowaniem");
    expect(byName["bks_a_3"].serviceId).toBe(plan.archivalServices[0].id);
  });

  it("nasz wybór zmienia mapowanie: inna usługa lub archiwalna", () => {
    const plan = planBooksyImport({ clientsCsv, appointmentsCsv }, state, new Date("2026-10-15T10:00:00Z"), {
      "Botoks 3 okolice": "s3",
      "Laminacja rzęs z farbowaniem": "s1",
    });
    const byId = Object.fromEntries(plan.appointments.map((a) => [a.id, a]));
    expect(byId["bks_a_2"].serviceId).toBe("s3");
    expect(byId["bks_a_3"].serviceId).toBe("s1");
    expect(plan.archivalServices).toHaveLength(0);

    const archived = planBooksyImport({ clientsCsv, appointmentsCsv }, state, new Date("2026-10-15T10:00:00Z"), {
      "Botoks 3 okolice": ARCHIVE,
    });
    expect(archived.archivalServices.map((s) => s.name)).toContain("Botoks 3 okolice");
  });

  it("podgląd segmentów liczy pacjentów z importu", () => {
    const plan = planBooksyImport({ clientsCsv, appointmentsCsv }, state, new Date("2026-10-15T10:00:00Z"));
    const preview = previewSegments(plan, 365, {}, new Date("2026-10-15T10:00:00Z"));
    expect(preview.reduce((sum, s) => sum + s.count, 0)).toBe(1);
  });
});
