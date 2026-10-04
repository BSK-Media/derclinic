import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  GOOGLE_CALLBACK_PATH,
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_TTL_SEC,
  buildGoogleAuthUrl,
  encodeGoogleState,
  googleOAuthConfig,
  sanitizeReturnTo,
} from "@/lib/google-oauth";
import { RATE_LIMITS, clientIp, hitRateLimit } from "@/lib/rate-limit";

function withParam(origin: string, returnTo: string, code: string) {
  const url = new URL(returnTo, origin);
  url.searchParams.set("google", code);
  return url;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"));

  const config = googleOAuthConfig();
  if (!config) return NextResponse.redirect(withParam(url.origin, returnTo, "niedostepne"));

  const ipLimit = await hitRateLimit(RATE_LIMITS.patientLoginIp, await clientIp());
  if (!ipLimit.allowed) return NextResponse.redirect(withParam(url.origin, returnTo, "limit"));

  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");

  const response = NextResponse.redirect(
    buildGoogleAuthUrl({
      clientId: config.clientId,
      redirectUri: `${url.origin}${GOOGLE_CALLBACK_PATH}`,
      state,
      nonce,
    }),
  );
  // Lax: ciasteczko musi wrócić przy przekierowaniu z Google (nawigacja GET).
  response.cookies.set({
    name: GOOGLE_STATE_COOKIE,
    value: encodeGoogleState({ state, nonce, returnTo }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/patient/google",
    maxAge: GOOGLE_STATE_TTL_SEC,
  });
  return response;
}
