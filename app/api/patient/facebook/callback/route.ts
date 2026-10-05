import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getPatientAuth, startPatientSession } from "@/lib/patient-auth";
import { logAudit } from "@/lib/audit";
import { decodeGoogleState } from "@/lib/google-oauth";
import {
  FACEBOOK_CALLBACK_PATH,
  FACEBOOK_STATE_COOKIE,
  facebookOAuthConfig,
  fetchFacebookProfile,
} from "@/lib/facebook-oauth";
import { RATE_LIMITS, clientIp, hitRateLimit } from "@/lib/rate-limit";

// Kody błędów trafiają do adresu powrotu jako ?facebook=<kod>; komunikaty po
// polsku są w components/facebook-login-button.tsx (FACEBOOK_ERROR_MESSAGES).
type ErrorCode = "niedostepne" | "limit" | "anulowano" | "blad" | "konto-istnieje" | "zajete";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const saved = decodeGoogleState(jar.get(FACEBOOK_STATE_COOKIE)?.value);
  jar.set({ name: FACEBOOK_STATE_COOKIE, value: "", path: "/api/patient/facebook", maxAge: 0 });

  const returnTo = saved?.returnTo ?? "/panel-klienta/logowanie";
  const finish = (error?: ErrorCode, fallbackPath?: string) => {
    const target = new URL(error && fallbackPath ? fallbackPath : returnTo, url.origin);
    if (error) target.searchParams.set("facebook", error);
    // Facebook dokleja do adresu powrotu fragment "#_=_", który przeglądarka
    // przenosi przez przekierowania — pusty fragment go usuwa.
    return NextResponse.redirect(`${target.toString()}#`);
  };

  const config = facebookOAuthConfig();
  if (!config) return finish("niedostepne");

  const ipLimit = await hitRateLimit(RATE_LIMITS.patientLoginIp, await clientIp());
  if (!ipLimit.allowed) return finish("limit");

  if (url.searchParams.get("error")) return finish("anulowano");
  const code = url.searchParams.get("code");
  if (!saved || !code || url.searchParams.get("state") !== saved.state) return finish("blad");

  let profile;
  try {
    profile = await fetchFacebookProfile({
      appId: config.appId,
      appSecret: config.appSecret,
      redirectUri: `${url.origin}${FACEBOOK_CALLBACK_PATH}`,
      code,
    });
  } catch (e) {
    console.error("[facebook-login] weryfikacja nie powiodła się", e);
    return finish("blad");
  }

  const contact = profile.email ?? `Facebook ${profile.id}`;
  const current = await getPatientAuth();
  const linked = await prisma.patient.findUnique({
    where: { facebookId: profile.id },
    select: { id: true, name: true, phone: true },
  });

  // 1. Zalogowany pacjent dopina Facebooka do swojego konta (Dane klienta → Połącz z Facebookiem).
  if (current) {
    if (linked) return linked.id === current.id ? finish() : finish("zajete");
    await prisma.patient.update({ where: { id: current.id }, data: { facebookId: profile.id } });
    await logAudit({
      actor: { type: "PATIENT", id: current.id, name: current.name, contact: current.phone },
      action: "UPDATE",
      entity: "PatientAccount",
      entityId: current.id,
      summary: `Połączenie konta pacjenta z logowaniem przez Facebooka (${contact})`,
      data: { method: "facebook", facebookEmail: profile.email },
    });
    return finish();
  }

  // 2. Konto Facebooka jest już przypisane do karty — zwykłe logowanie.
  if (linked) {
    await startPatientSession(linked.id);
    await logAudit({
      actor: { type: "PATIENT", id: linked.id, name: linked.name, contact: linked.phone },
      action: "LOGIN",
      entity: "PatientAccount",
      entityId: linked.id,
      summary: "Logowanie do panelu klienta przez Facebooka",
      data: { method: "facebook" },
    });
    return finish();
  }

  // 3. Ten e-mail ma już konto (hasło albo Google). Nie wpuszczamy na nie
  //    samym Facebookiem ani nie zakładamy drugiego konta — właściciel loguje
  //    się dotychczasową metodą i łączy konto w panelu.
  if (profile.email) {
    const existingAccount = await prisma.patient.findFirst({
      where: {
        OR: [{ passwordHash: { not: null } }, { googleSub: { not: null } }],
        email: { equals: profile.email, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (existingAccount) {
      await logAudit({
        actor: { type: "GUEST", name: profile.name, contact: profile.email },
        action: "LOGIN_FAILED",
        entity: "PatientAccount",
        entityId: existingAccount.id,
        summary: "Logowanie przez Facebooka odrzucone — e-mail ma już konto, które nie jest połączone z Facebookiem",
        data: { method: "facebook", reason: "account_exists" },
      });
      return finish("konto-istnieje", "/panel-klienta/logowanie");
    }
  }

  // 4. Nowe konto na nowej karcie pacjenta. Telefon (i e-mail, jeśli Facebook
  //    go nie podał) uzupełni się przy pierwszej rezerwacji.
  const [existingGuest, defaultLocation] = await Promise.all([
    profile.email
      ? prisma.patient.findFirst({
          where: {
            passwordHash: null,
            googleSub: null,
            facebookId: null,
            email: { equals: profile.email, mode: "insensitive" },
          },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        })
      : null,
    prisma.location.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } }),
  ]);
  if (!defaultLocation) return finish("blad");

  let patient;
  try {
    patient = await prisma.patient.create({
      data: {
        name: profile.name ?? profile.email?.split("@")[0] ?? "Klient",
        email: profile.email,
        facebookId: profile.id,
        locationId: defaultLocation.id,
      },
      select: { id: true, name: true },
    });
  } catch (e) {
    // Równoległe drugie żądanie z tym samym kontem Facebooka (unikalny facebookId).
    console.error("[facebook-login] nie udało się założyć karty pacjenta", e);
    return finish("blad");
  }

  await startPatientSession(patient.id);
  await logAudit({
    actor: { type: "PATIENT", id: patient.id, name: patient.name, contact },
    action: "REGISTER",
    entity: "PatientAccount",
    entityId: patient.id,
    summary: existingGuest
      ? `Rejestracja konta przez Facebooka (nowa karta ${patient.name}; istnieje wcześniejsza karta gościa do połączenia w Pacjenci → Duplikaty)`
      : `Rejestracja konta przez Facebooka (nowa karta pacjenta ${patient.name})`,
    data: {
      method: "facebook",
      email: profile.email,
      emailProvided: Boolean(profile.email),
      previousGuestPatientId: existingGuest?.id ?? undefined,
    },
  });
  return finish();
}
