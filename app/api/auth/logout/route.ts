import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth-cookie";

export async function POST() {
  clearAuthCookie();
  return NextResponse.json({ ok: true });
}
