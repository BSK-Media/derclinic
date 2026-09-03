import { NextResponse } from "next/server";
import { clearPatientAuthCookie } from "@/lib/patient-auth";

export async function POST() {
  clearPatientAuthCookie();
  return NextResponse.json({ ok: true });
}
