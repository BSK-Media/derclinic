import { prisma } from "@/lib/db";
import { computePeriodReport } from "@/lib/finance";

export async function buildReport(from: Date, to: Date) {
  const fromKey = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
  const toKey = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}`;

  const [users, projects, assignments, timeEntries, bonuses] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, hourlyRateDefault: true } }),
    prisma.project.findMany({ include: { client: { select: { name: true } } } }),
    prisma.assignment.findMany(),
    prisma.timeEntry.findMany({ where: { date: { gte: from, lte: to } }, select: { userId: true, projectId: true, date: true, hours: true, status: true } }),
    prisma.bonus.findMany({
      where: {
        month: { gte: fromKey, lte: toKey },
      },
      select: { userId: true, projectId: true, amount: true, type: true, month: true, note: true },
    }),
  ]);

  // Hide projects that are not relevant for the selected period.
  // - recurring: show only if contract overlaps the period (or no contractEnd)
  // - one-off: show only in the month of its deadline (fallback: contractEnd/contractStart/createdAt)
  const relevantProjects = projects.filter((p) => {
    if (p.cadence === "ONE_OFF") {
      const d = p.deadlineAt ?? p.contractEnd ?? p.contractStart ?? p.createdAt;
      return d >= from && d <= to;
    }
    const start = p.contractStart ?? p.createdAt;
    const end = p.contractEnd;
    if (start > to) return false;
    if (end && end < from) return false;
    return true;
  });

  return computePeriodReport({
    from,
    to,
    users: users.map((u) => ({ ...u, hourlyRateDefault: Number(u.hourlyRateDefault) })),
    projects: relevantProjects.map((p) => ({
      id: p.id,
      name: p.name,
      clientId: p.clientId,
      clientName: p.client.name,
      billingType: p.billingType,
      cadence: p.cadence,
      hourlyClientRate: p.hourlyClientRate ? Number(p.hourlyClientRate) : null,
      monthlyRetainerAmount: p.monthlyRetainerAmount ? Number(p.monthlyRetainerAmount) : null,
      fixedClientPrice: p.fixedClientPrice ? Number(p.fixedClientPrice) : null,
      completedAt: p.completedAt,
      contractStart: p.contractStart,
      contractEnd: p.contractEnd,
      deadlineAt: p.deadlineAt,
      createdAt: p.createdAt,
    })),
    assignments: assignments.map((a) => ({
      userId: a.userId,
      projectId: a.projectId,
      hourlyRateOverride: a.hourlyRateOverride ? Number(a.hourlyRateOverride) : null,
      fixedPayoutAmount: a.fixedPayoutAmount ? Number(a.fixedPayoutAmount) : null,
    })),
    timeEntries: timeEntries.map((t) => ({ ...t, hours: Number(t.hours) })),
    bonuses: bonuses.map((b) => ({ ...b, amount: Number(b.amount) })),
  });
}
