import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getPatientAuth, startPatientSession } from "@/lib/patient-auth";
import { logAudit } from "@/lib/audit";
import {
  GOOGLE_CALLBACK_PATH,
  GOOGLE_STATE_COOKIE,
  decodeGoogleState,
  fetchGoogleProfile,
  googleOAuthConfig,
} from "@/lib/google-oauth";
import { RATE_LIMITS, clientIp, hitRateLimit } from "@/lib/rate-limit";

// Kody błędów trafiają do adresu powrotu jako ?google=<kod>; komunikaty po
// polsku są w components/google-login-button.tsx (GOOGLE_ERROR_MESSAGES).
type ErrorCode = "niedostepne" | "limit" | "anulowano" | "blad" | "konto-istnieje" | "zajete";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const saved = decodeGoogleState(jar.get(GOOGLE_STATE_COOKIE)?.value);
  jar.set({ name: GOOGLE_STATE_COOKIE, value: "", path: "/api/patient/google", maxAge: 0 });

  const returnTo = saved?.returnTo ?? "/panel-klienta/logowanie";
  const finish = (error?: ErrorCode, fallbackPath?: string) => {
    const target = new URL(error && fallbackPath ? fallbackPath : returnTo, url.origin);
    if (error) target.searchParams.set("google", error);
    return NextResponse.redirect(target);
  };

  const config = googleOAuthConfig();
  if (!config) return finish("niedostepne");

  const ipLimit = await hitRateLimit(RATE_LIMITS.patientLoginIp, await clientIp());
  if (!ipLimit.allowed) return finish("limit");

  if (url.searchParams.get("error")) return finish("anulowano");
  const code = url.searchParams.get("code");
  if (!saved || !code || url.searchParams.get("state") !== saved.state) return finish("blad");

  let profile;
  try {
    profile = await fetchGoogleProfile({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: `${url.origin}${GOOGLE_CALLBACK_PATH}`,
      code,
      nonce: saved.nonce,
    });
  } catch (e) {
    console.error("[google-login] weryfikacja nie powiodła się", e);
    return finish("blad");
  }

  const current = await getPatientAuth();
  const linked = await prisma.patient.findUnique({
    where: { googleSub: profile.sub },
    select: { id: true, name: true, phone: true },
  });

  // 1. Zalogowany pacjent dopina Google do swojego konta (Dane klienta → Połącz z Google).
  if (current) {
    if (linked) return linked.id === current.id ? finish() : finish("zajete");
    await prisma.patient.update({ where: { id: current.id }, data: { googleSub: profile.sub } });
    await logAudit({
      actor: { type: "PATIENT", id: current.id, name: current.name, contact: current.phone },
      action: "UPDATE",
      entity: "PatientAccount",
      entityId: current.id,
      summary: `Połączenie konta pacjenta z logowaniem Google (${profile.email})`,
      data: { method: "google", googleEmail: profile.email },
    });
    return finish();
  }

  // 2. Konto Google jest już przypisane do karty — zwykłe logowanie.
  if (linked) {
    await startPatientSession(linked.id);
    await logAudit({
      actor: { type: "PATIENT", id: linked.id, name: linked.name, contact: linked.phone },
      action: "LOGIN",
      entity: "PatientAccount",
      entityId: linked.id,
      summary: "Logowanie do panelu klienta przez Google",
      data: { method: "google" },
    });
    return finish();
  }

  // 3. Ten e-mail ma już konto (hasło albo Facebook). Adresów e-mail nie
  //    potwierdzamy, więc nie wpuszczamy na nie samym Google — właściciel
  //    loguje się dotychczasową metodą i łączy konto w panelu. (Informacja trafia wyłącznie do osoby, która
  //    właśnie udowodniła, że ten adres należy do niej.)
  const passwordAccount = await prisma.patient.findFirst({
    where: {
      OR: [{ passwordHash: { not: null } }, { facebookId: { not: null } }],
      email: { equals: profile.email, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (passwordAccount) {
    await logAudit({
      actor: { type: "GUEST", name: profile.name, contact: profile.email },
      action: "LOGIN_FAILED",
      entity: "PatientAccount",
      entityId: passwordAccount.id,
      summary: "Logowanie przez Google odrzucone — e-mail ma już konto, które nie jest połączone z Google",
      data: { method: "google", reason: "account_exists" },
    });
    return finish("konto-istnieje", "/panel-klienta/logowanie");
  }

  // 4. Nowe konto na nowej karcie pacjenta. Telefon uzupełni się przy pierwszej
  //    rezerwacji (albo prośbą o zmianę danych w panelu).
  const [existingGuest, defaultLocation] = await Promise.all([
    prisma.patient.findFirst({
      where: {
        passwordHash: null,
        googleSub: null,
        facebookId: null,
        email: { equals: profile.email, mode: "insensitive" },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    }),
    prisma.location.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } }),
  ]);
  if (!defaultLocation) return finish("blad");

  let patient;
  try {
    patient = await prisma.patient.create({
      data: {
        name: profile.name ?? profile.email.split("@")[0],
        email: profile.email,
        googleSub: profile.sub,
        locationId: defaultLocation.id,
      },
      select: { id: true, name: true },
    });
  } catch (e) {
    // Równoległe drugie żądanie z tym samym kontem Google (unikalny googleSub).
    console.error("[google-login] nie udało się założyć karty pacjenta", e);
    return finish("blad");
  }

  await startPatientSession(patient.id);
  await logAudit({
    actor: { type: "PATIENT", id: patient.id, name: patient.name, contact: profile.email },
    action: "REGISTER",
    entity: "PatientAccount",
    entityId: patient.id,
    summary: existingGuest
      ? `Rejestracja konta przez Google (nowa karta ${patient.name}; istnieje wcześniejsza karta gościa do połączenia w Pacjenci → Duplikaty)`
      : `Rejestracja konta przez Google (nowa karta pacjenta ${patient.name})`,
    data: { method: "google", email: profile.email, previousGuestPatientId: existingGuest?.id ?? undefined },
  });
  return finish();
}
