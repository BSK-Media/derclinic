"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS_HINT, validatePassword } from "@/lib/password-policy";

// Logowanie personelu: hasło → (zmiana hasła, jeśli tymczasowe/słabe) →
// obowiązkowe MFA: konfiguracja przy pierwszym logowaniu albo podanie kodu.
// Pełna sesja powstaje dopiero po drugim składniku (audyt F-04).

type Step =
  | { kind: "credentials" }
  | { kind: "changePassword"; message: string }
  | { kind: "enroll"; qrSvg?: string; secret?: string }
  | { kind: "recoveryCodes"; codes: string[] }
  | { kind: "verify"; passkey: boolean };

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export default function LoginClient() {
  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordRepeat, setNewPasswordRepeat] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [codesSaved, setCodesSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  function goToApp() {
    window.location.href = "/";
  }

  // Wspólna obsługa odpowiedzi po haśle / zmianie hasła.
  async function handleAuthResponse(res: Response, data: any) {
    if (data?.code === "PASSWORD_CHANGE_REQUIRED") {
      setStep({ kind: "changePassword", message: data.message });
      return;
    }
    if (data?.code === "MFA_ENROLL_REQUIRED") {
      setCode("");
      setStep({ kind: "enroll" });
      const setup = await postJson("/api/auth/mfa/totp/setup");
      if (!setup.data?.ok) {
        toast.error(setup.data?.message || "Nie udało się przygotować konfiguracji");
        setStep({ kind: "credentials" });
        return;
      }
      setStep({ kind: "enroll", qrSvg: setup.data.qrSvg, secret: setup.data.secret });
      return;
    }
    if (data?.code === "MFA_REQUIRED") {
      setCode("");
      setUseRecovery(false);
      setStep({ kind: "verify", passkey: Boolean(data.methods?.passkey) });
      return;
    }
    if (data?.code === "MFA_CHALLENGE_EXPIRED") {
      toast.error(data.message);
      setStep({ kind: "credentials" });
      setPassword("");
      return;
    }
    if (!res.ok || !data?.ok) toast.error(data?.message || "Błąd logowania");
  }

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { res, data } = await postJson("/api/auth/login", { login, password });
      await handleAuthResponse(res, data);
    } catch (err: any) {
      toast.error(err?.message || "Błąd");
    } finally {
      setLoading(false);
    }
  }

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    const issue = validatePassword(newPassword, { login });
    if (issue) return toast.error(issue);
    if (newPassword !== newPasswordRepeat) return toast.error("Hasła nie są identyczne");
    setLoading(true);
    try {
      const { res, data } = await postJson("/api/auth/change-password", {
        login,
        currentPassword: password,
        newPassword,
      });
      // Po udanej zmianie serwer od razu przechodzi do kroku MFA.
      if (typeof data?.code === "string" && data.code.startsWith("MFA_")) {
        toast.success("Hasło zmienione");
        setPassword(newPassword);
      }
      await handleAuthResponse(res, data);
    } finally {
      setLoading(false);
    }
  }

  async function submitEnroll(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { res, data } = await postJson("/api/auth/mfa/totp/enroll", { code });
      if (data?.ok) {
        setCodesSaved(false);
        setStep({ kind: "recoveryCodes", codes: data.recoveryCodes });
        return;
      }
      await handleAuthResponse(res, data);
    } finally {
      setLoading(false);
    }
  }

  async function submitVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { res, data } = await postJson("/api/auth/mfa/verify", useRecovery ? { recoveryCode: code } : { code });
      if (data?.ok) {
        if (typeof data.recoveryCodesRemaining === "number" && data.recoveryCodesRemaining <= 3) {
          toast.warning(
            `Zostało ${data.recoveryCodesRemaining} kodów odzyskiwania. Wygeneruj nowe w „Bezpieczeństwo konta”.`,
          );
        }
        goToApp();
        return;
      }
      await handleAuthResponse(res, data);
    } finally {
      setLoading(false);
    }
  }

  async function loginWithPasskey() {
    setLoading(true);
    try {
      const options = await postJson("/api/auth/mfa/passkey/options");
      if (!options.data?.ok) return await handleAuthResponse(options.res, options.data);
      const response = await startAuthentication({ optionsJSON: options.data.options });
      const { res, data } = await postJson("/api/auth/mfa/passkey/verify", { response });
      if (data?.ok) return goToApp();
      await handleAuthResponse(res, data);
    } catch {
      toast.error("Anulowano albo urządzenie nie potwierdziło klucza dostępu");
    } finally {
      setLoading(false);
    }
  }

  function downloadCodes(codes: string[]) {
    const text = `DerClinic OS — kody odzyskiwania (konto: ${login})\nKażdy kod działa tylko raz.\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `derclinic-kody-odzyskiwania-${login}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function backToStart() {
    setStep({ kind: "credentials" });
    setPassword("");
    setNewPassword("");
    setNewPasswordRepeat("");
    setCode("");
  }

  const subtitle =
    step.kind === "credentials"
      ? "Zaloguj się do systemu rezerwacji i magazynu."
      : step.kind === "changePassword"
        ? step.message
        : step.kind === "enroll"
          ? "Logowanie dwuskładnikowe jest obowiązkowe. Skonfiguruj aplikację uwierzytelniającą."
          : step.kind === "recoveryCodes"
            ? "Zapisz kody odzyskiwania — pozwolą się zalogować, gdy zgubisz telefon."
            : useRecovery
              ? "Podaj jeden z jednorazowych kodów odzyskiwania."
              : "Podaj 6-cyfrowy kod z aplikacji uwierzytelniającej.";

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center">
            <Image src="/derclinic-logo.webp" alt="DerClinic" width={220} height={220} priority />
          </div>
          <CardTitle className="text-center">Panel DerClinic OS</CardTitle>
          <p className="text-center text-sm text-zinc-500">{subtitle}</p>
        </CardHeader>
        <CardContent>
          {step.kind === "credentials" ? (
            <form className="space-y-4" onSubmit={submitCredentials}>
              <div className="space-y-2">
                <Label htmlFor="login">Login</Label>
                <Input id="login" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Hasło</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Logowanie..." : "Zaloguj"}
              </Button>
              <Link href="/login/zapomniane-haslo" className="block text-center text-sm text-zinc-500 underline">
                Nie pamiętam hasła
              </Link>
            </form>
          ) : null}

          {step.kind === "changePassword" ? (
            <form className="space-y-4" onSubmit={submitNewPassword}>
              {/* Ukryte pole z loginem pomaga menedżerom haseł zapisać nowe hasło do właściwego konta. */}
              <input type="text" name="username" autoComplete="username" value={login} readOnly hidden />
              <div className="space-y-2">
                <Label htmlFor="new-password">Nowe hasło ({PASSWORD_REQUIREMENTS_HINT})</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password-repeat">Powtórz nowe hasło</Label>
                <Input
                  id="new-password-repeat"
                  type="password"
                  autoComplete="new-password"
                  value={newPasswordRepeat}
                  onChange={(e) => setNewPasswordRepeat(e.target.value)}
                  required
                />
              </div>
              <p className="text-xs text-zinc-500">
                Najlepiej użyj menedżera haseł albo kilku przypadkowych słów. Hasło nie może opierać się na
                loginie, imieniu ani nazwie kliniki.
              </p>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Zapisywanie..." : "Ustaw hasło"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={backToStart}>
                Wróć
              </Button>
            </form>
          ) : null}

          {step.kind === "enroll" ? (
            <form className="space-y-4" onSubmit={submitEnroll}>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
                <li>
                  Zainstaluj aplikację uwierzytelniającą (np. Microsoft Authenticator, Google Authenticator albo
                  1Password).
                </li>
                <li>W aplikacji dodaj konto i zeskanuj kod QR.</li>
                <li>Wpisz 6-cyfrowy kod, który pokaże aplikacja.</li>
              </ol>
              {step.qrSvg ? (
                <div
                  className="mx-auto w-48 rounded-lg bg-white p-2"
                  // SVG generowany po naszej stronie (biblioteka qrcode) z adresu otpauth.
                  dangerouslySetInnerHTML={{ __html: step.qrSvg }}
                />
              ) : (
                <p className="text-center text-sm text-zinc-500">Przygotowywanie kodu…</p>
              )}
              {step.secret ? (
                <p className="text-center text-xs text-zinc-500">
                  Nie możesz zeskanować? Wpisz klucz ręcznie:
                  <br />
                  <span className="select-all font-mono text-sm text-zinc-800 dark:text-zinc-100">{step.secret}</span>
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="enroll-code">Kod z aplikacji</Label>
                <Input
                  id="enroll-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !step.secret}>
                {loading ? "Sprawdzanie..." : "Potwierdź i włącz"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={backToStart}>
                Anuluj
              </Button>
            </form>
          ) : null}

          {step.kind === "recoveryCodes" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-zinc-50 p-3 font-mono text-sm dark:bg-zinc-900">
                {step.codes.map((c) => (
                  <span key={c} className="select-all text-center">
                    {c}
                  </span>
                ))}
              </div>
              <p className="text-xs text-zinc-500">
                Każdy kod działa tylko raz. Przechowuj je w bezpiecznym miejscu (menedżer haseł, wydruk w zamkniętej
                szufladzie) — nie pokażemy ich ponownie.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => downloadCodes(step.codes)}>
                  Pobierz
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigator.clipboard?.writeText(step.codes.join("\n")).then(() => toast.success("Skopiowano"))}
                >
                  Kopiuj
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={codesSaved} onChange={(e) => setCodesSaved(e.target.checked)} />
                Zapisałem/am kody odzyskiwania
              </label>
              <Button type="button" className="w-full" disabled={!codesSaved} onClick={goToApp}>
                Przejdź do panelu
              </Button>
            </div>
          ) : null}

          {step.kind === "verify" ? (
            <form className="space-y-4" onSubmit={submitVerify}>
              {step.passkey && browserSupportsWebAuthn() ? (
                <>
                  <Button type="button" className="w-full" disabled={loading} onClick={() => void loginWithPasskey()}>
                    Użyj klucza dostępu (passkey)
                  </Button>
                  <p className="text-center text-xs text-zinc-500">albo</p>
                </>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="mfa-code">{useRecovery ? "Kod odzyskiwania" : "Kod z aplikacji"}</Label>
                <Input
                  id="mfa-code"
                  autoFocus
                  inputMode={useRecovery ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  placeholder={useRecovery ? "XXXXX-XXXXX" : "123456"}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sprawdzanie..." : "Zaloguj"}
              </Button>
              <div className="flex justify-between text-sm">
                <button
                  type="button"
                  className="text-zinc-500 underline"
                  onClick={() => {
                    setUseRecovery(!useRecovery);
                    setCode("");
                  }}
                >
                  {useRecovery ? "Użyj kodu z aplikacji" : "Nie mam telefonu — kod odzyskiwania"}
                </button>
                <button type="button" className="text-zinc-500 underline" onClick={backToStart}>
                  Wróć
                </button>
              </div>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
