export type DashboardKpi = {
  title: string;
  value: string | number;
  deltaLabel: string;
  deltaValue: string;
  icon: "visits" | "revenue" | "patients" | "alerts";
};

export type RevenuePoint = { day: number; revenue: number; visits: number };
export type ProcedureMix = { name: string; value: number };
export type PopularProcedure = { name: string; volumePct: number; revenue: number };
export type UpcomingVisit = { patient: string; time: string; procedure: string; avatarSeed: string };
export type StockStatus = { name: string; pct: number };

export type DashboardPayload = {
  clinicName: string;
  kpis: DashboardKpi[];
  revenue30d: RevenuePoint[];
  procedureMix: ProcedureMix[];
  popularProcedures: PopularProcedure[];
  upcomingToday: UpcomingVisit[];
  stockStatus: StockStatus[];
  lowStockAlerts: { count: number; message: string };
};

export function getDemoDashboard(): DashboardPayload {
  const revenue30d: RevenuePoint[] = Array.from({ length: 30 }).map((_, i) => {
    const day = i + 1;
    const visits = Math.max(3, Math.round(7 + 3 * Math.sin(day / 2) + (day % 5 === 0 ? 4 : 0)));
    const revenue = Math.round(450 * visits + (day % 7 === 0 ? 1200 : 0));
    return { day, revenue, visits };
  });

  return {
    clinicName: "Estetika Clinique",
    kpis: [
      { title: "Dzisiejsze Wizyty", value: 24, deltaLabel: "z wczoraj", deltaValue: "+8%", icon: "visits" },
      { title: "Dzisiejszy Przychód", value: "PLN 18.750", deltaLabel: "vs. target", deltaValue: "+12%", icon: "revenue" },
      { title: "Nowi Pacjenci", value: 15, deltaLabel: "", deltaValue: "+3", icon: "patients" },
      { title: "Magazyn - Alerty", value: 4, deltaLabel: "", deltaValue: "4 preparaty blisko terminu", icon: "alerts" },
    ],
    revenue30d,
    procedureMix: [
      { name: "Toksyna Botulinowa", value: 35 },
      { name: "Wypełniacze", value: 30 },
      { name: "Laseroterapia", value: 20 },
      { name: "Inne", value: 15 },
    ],
    popularProcedures: [
      { name: "Toksyna Botulinowa", volumePct: 35, revenue: 18750 },
      { name: "Wypełniacze", volumePct: 30, revenue: 18750 },
      { name: "Laseroterapia", volumePct: 20, revenue: 8250 },
      { name: "Inne", volumePct: 15, revenue: 5500 },
    ],
    upcomingToday: [
      { patient: "Ewa Kowalska", time: "09:00", procedure: "Toksyna Botulinowa", avatarSeed: "ek" },
      { patient: "Ewa Kowalska", time: "09:30", procedure: "Wypełniacze", avatarSeed: "ek2" },
      { patient: "Mara Łońsia", time: "10:15", procedure: "Toksyna Botulinowa", avatarSeed: "ml" },
    ],
    stockStatus: [
      { name: "Toksyna Botulinowa (35%)", pct: 35 },
      { name: "Wypełniacze (30%)", pct: 30 },
      { name: "Laseroterapia (20%)", pct: 20 },
      { name: "Inne (15%)", pct: 15 },
    ],
    lowStockAlerts: { count: 4, message: "4 preparaty blisko terminu" },
  };
}
