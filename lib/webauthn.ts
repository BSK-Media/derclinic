import { headers } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { MFA_ISSUER_NAME } from "@/lib/mfa";

// Klucze dostępu (passkeys / WebAuthn / FIDO2) — preferowany, odporny na
// phishing drugi składnik (audyt F-04). Klucz jest powiązany z domeną, na
// której został dodany (rpID), więc nie zadziała na podrobionej stronie.

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Origin i rpID z bieżącego żądania (lub z NEXT_PUBLIC_APP_URL, jeśli ustawiony). */
export async function relyingParty() {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  let origin: string;
  if (configured) {
    origin = new URL(configured).origin;
  } else {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    origin = `${proto}://${host}`;
  }
  return { origin, rpID: new URL(origin).hostname };
}

async function storeChallenge(userId: string, challenge: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { webauthnChallenge: challenge, webauthnChallengeExpiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
}

/** Pobiera i od razu kasuje wyzwanie (jednorazowe). */
async function takeChallenge(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { webauthnChallenge: true, webauthnChallengeExpiresAt: true },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { webauthnChallenge: null, webauthnChallengeExpiresAt: null },
  });
  if (!user?.webauthnChallenge || !user.webauthnChallengeExpiresAt) return null;
  if (user.webauthnChallengeExpiresAt.getTime() < Date.now()) return null;
  return user.webauthnChallenge;
}

export async function passkeyRegistrationOptions(user: { id: string; login: string; name: string }) {
  const { rpID } = await relyingParty();
  const existing = await prisma.webAuthnPasskey.findMany({ where: { userId: user.id }, select: { id: true, transports: true } });
  const options = await generateRegistrationOptions({
    rpName: MFA_ISSUER_NAME,
    rpID,
    userName: user.login,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  await storeChallenge(user.id, options.challenge);
  return options;
}

export async function verifyPasskeyRegistration(userId: string, response: RegistrationResponseJSON, name: string) {
  const expectedChallenge = await takeChallenge(userId);
  if (!expectedChallenge) return null;
  const { origin, rpID } = await relyingParty();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  }).catch(() => null);
  if (!verification?.verified) return null;
  const { credential } = verification.registrationInfo;
  return await prisma.webAuthnPasskey.create({
    data: {
      id: credential.id,
      userId,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      name: name.slice(0, 60) || "Klucz dostępu",
    },
    select: { id: true, name: true, createdAt: true },
  });
}

export async function passkeyAuthenticationOptions(userId: string) {
  const { rpID } = await relyingParty();
  const passkeys = await prisma.webAuthnPasskey.findMany({ where: { userId }, select: { id: true, transports: true } });
  if (passkeys.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: passkeys.map((c) => ({ id: c.id, transports: c.transports })),
    userVerification: "required",
  });
  await storeChallenge(userId, options.challenge);
  return options;
}

/** Zwraca true, gdy odpowiedź urządzenia jest poprawna dla jednego z kluczy tego konta. */
export async function verifyPasskeyAuthentication(userId: string, response: AuthenticationResponseJSON) {
  const expectedChallenge = await takeChallenge(userId);
  if (!expectedChallenge) return false;
  const passkey = await prisma.webAuthnPasskey.findFirst({ where: { id: response.id, userId } });
  if (!passkey) return false;
  const { origin, rpID } = await relyingParty();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: passkey.id,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: passkey.counter,
      transports: passkey.transports,
    },
  }).catch(() => null);
  if (!verification?.verified) return false;
  await prisma.webAuthnPasskey.update({
    where: { id: passkey.id },
    data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
  });
  return true;
}
