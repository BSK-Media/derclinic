import { computePeriodReport } from "@/lib/finance";

describe("computePeriodReport", () => {
  it("hourly revenue/cost", () => {
    const report = computePeriodReport({
      from: new Date(2026, 0, 1),
      to: new Date(2026, 0, 31),
      users: [{ id: "u1", name: "A", hourlyRateDefault: 50 }],
      projects: [{ id: "p1", name: "P", clientName: "C", billingType: "HOURLY" as any, cadence: "ONE_OFF" as any, hourlyClientRate: 100 }],
      assignments: [{ userId: "u1", projectId: "p1", hourlyRateOverride: 60 }],
      timeEntries: [{ userId: "u1", projectId: "p1", date: new Date(2026, 0, 10), hours: 10, status: "APPROVED" as any }],
      bonuses: [],
    });
    expect(report.kpi.revenue).toBe(1000);
    expect(report.projects[0].cost).toBe(600);
    expect(report.projects[0].margin).toBe(400);
  });
});
