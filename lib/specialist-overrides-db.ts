import { prisma } from "@/lib/db";
import { monthsCoveredBy, type MonthOverride } from "@/lib/specialist-overrides";

/** Nadpisania miesięczne (tylko miesiące objęte zakresem w całości) dla wskazanych specjalistów. */
export async function loadMonthOverrides(specialistIds: string[], start: Date, end: Date): Promise<Map<string, MonthOverride[]>> {
  const map = new Map<string, MonthOverride[]>();
  if (specialistIds.length === 0) return map;
  const months = monthsCoveredBy(start, end);
  if (months.length === 0) return map;
  const rows = await prisma.specialistMonthSettlement.findMany({
    where: { specialistId: { in: specialistIds }, month: { in: months } },
    orderBy: { month: "asc" },
  });
  for (const row of rows) {
    const list = map.get(row.specialistId) ?? [];
    list.push({
      month: row.month,
      appointments: row.appointments,
      revenue: row.revenue,
      materialCost: row.materialCost,
      payout: row.payout,
      note: row.note,
    });
    map.set(row.specialistId, list);
  }
  return map;
}
