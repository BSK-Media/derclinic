import { NextResponse } from "next/server";
import { googleOAuthConfig } from "@/lib/google-oauth";

// Przycisk "Kontynuuj z Google" pokazujemy tylko, gdy logowanie jest
// skonfigurowane (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).
export async function GET() {
  return NextResponse.json({ ok: true, enabled: googleOAuthConfig() !== null });
}
