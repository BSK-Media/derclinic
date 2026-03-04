import { NextResponse } from "next/server";
import { getDemoDashboard } from "@/lib/demo-dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getDemoDashboard());
}
