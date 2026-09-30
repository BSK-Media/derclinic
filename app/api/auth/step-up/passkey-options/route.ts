import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-cookie";
import { passkeyAuthenticationOptions } from "@/lib/webauthn";

export async function POST() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });
  const options = await passkeyAuthenticationOptions(auth.id);
  if (!options) return NextResponse.json({ ok: false, message: "Brak kluczy dostępu" }, { status: 400 });
  return NextResponse.json({ ok: true, options }, { headers: { "Cache-Control": "no-store" } });
}
