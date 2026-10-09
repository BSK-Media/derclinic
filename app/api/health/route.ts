import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Punkt kontrolny dla zewnętrznego monitoringu dostępności (np. UptimeRobot, Better Stack):
// 200 = aplikacja i baza odpowiadają, 503 = baza niedostępna. Bez danych i bez uwierzytelniania.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
