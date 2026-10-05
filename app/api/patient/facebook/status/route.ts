import { NextResponse } from "next/server";
import { facebookOAuthConfig } from "@/lib/facebook-oauth";

// Przycisk "Kontynuuj z Facebookiem" pokazujemy tylko, gdy logowanie jest
// skonfigurowane (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET).
export async function GET() {
  return NextResponse.json({ ok: true, enabled: facebookOAuthConfig() !== null });
}
