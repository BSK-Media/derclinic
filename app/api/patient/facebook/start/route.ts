import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { encodeGoogleState, sanitizeReturnTo } from "@/lib/google-oauth";
import {
  FACEBOOK_CALLBACK_PATH,
  FACEBOOK_STATE_COOKIE,
  FACEBOOK_STATE_TTL_SEC,
  buildFacebookAuthUrl,
  facebookOAuthConfig,
} from "@/lib/facebook-oauth";
import { RATE_LIMITS, clientIp, hitRateLimit } from "@/lib/rate-limit";

function withParam(origin: string, returnTo: string, code: string) {
  const url = new URL(returnTo, origin);
  url.searchParams.set("facebook", code);
  return url;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

  const config = facebookOAuthConfig();
  if (!config) return NextResponse.redirect(withParam(url.origin, returnTo, "niedostepne"));

  const ipLimit = await hitRateLimit(RATE_LIMITS.patientLoginIp, await clientIp());
  if (!ipLimit.allowed) return NextResponse.redirect(withParam(url.origin, returnTo, "limit"));

  const state = randomBytes(24).toString("base64url");

  const response = NextResponse.redirect(
    buildFacebookAuthUrl({
      appId: config.appId,
      redirectUri: `${url.origin}${FACEBOOK_CALLBACK_PATH}`,
      state,
    }),
  );
  // Lax: ciasteczko musi wrócić przy przekierowaniu z Facebooka (nawigacja GET).
  // Format stanu wspólny z Google; Facebook nie używa nonce, więc zostaje pusty.
  response.cookies.set({
    name: FACEBOOK_STATE_COOKIE,
    value: encodeGoogleState({ state, nonce: "", returnTo }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/patient/facebook",
    maxAge: FACEBOOK_STATE_TTL_SEC,
  });
  return response;
}
