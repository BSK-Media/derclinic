import { NextResponse } from "next/server";
import { challengedUser, mfaChallengeExpired } from "@/lib/mfa";
import { passkeyAuthenticationOptions } from "@/lib/webauthn";

// Wyzwanie dla logowania kluczem dostępu (drugi krok logowania).
export async function POST() {
  const user = await challengedUser("verify");
  if (!user) return mfaChallengeExpired();
  const options = await passkeyAuthenticationOptions(user.id);
  if (!options) return NextResponse.json({ ok: false, message: "To konto nie ma kluczy dostępu" }, { status: 400 });
  return NextResponse.json({ ok: true, options }, { headers: { "Cache-Control": "no-store" } });
}
