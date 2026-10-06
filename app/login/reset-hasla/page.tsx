"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS_HINT, validatePassword } from "@/lib/password-policy";

export default function StaffResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}

// Ustawienie nowego hasła pracownika linkiem z e-maila. Po zmianie nie ma
// automatycznego logowania — pracownik loguje się normalnie, z kodem 2FA.
function ResetForm() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [doneLogin, setDoneLogin] = useState<string | null>(null);
  // Nowe konto (link z wiadomości powitalnej) nie ma jeszcze 2FA.
  const [mfaEnabled, setMfaEnabled] = useState(true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!token) return setError("Link jest nieprawidłowy. Poproś o nowy link do resetu hasła.");
    const issue = validatePassword(password);
    if (issue) return setError(issue);
    if (password !== repeat) return setError("Hasła nie są identyczne");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) return setError(data?.message || "Nie udało się ustawić nowego hasła");
      setMfaEnabled(data.mfaEnabled !== false);
      setDoneLogin(data.login ?? "");
    } catch {
      setError("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center">
            <Image src="/derclinic-logo.webp" alt="DerClinic" width={160} height={160} priority />
          </div>
          <CardTitle className="text-center">Nowe hasło</CardTitle>
          <p className="text-center text-sm text-zinc-500">
            {doneLogin !== null
              ? "Hasło zostało zmienione."
              : "Ustaw nowe hasło do panelu DerClinic OS."}
          </p>
        </CardHeader>
        <CardContent>
          {doneLogin !== null ? (
            <div className="space-y-4">
              <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
                Zaloguj się nowym hasłem{doneLogin ? ` (login: ${doneLogin})` : ""}.{" "}
                {mfaEnabled
                  ? "Przy logowaniu podasz jak zwykle kod z aplikacji uwierzytelniającej."
                  : "Przy pierwszym logowaniu skonfigurujesz logowanie dwuskładnikowe (aplikacja uwierzytelniająca w telefonie)."}
              </p>
              <Link
                href="/login"
                className="block rounded-xl bg-emerald-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Przejdź do logowania
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nowe hasło ({PASSWORD_REQUIREMENTS_HINT})</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password-repeat">Powtórz nowe hasło</Label>
                <Input
                  id="new-password-repeat"
                  type="password"
                  autoComplete="new-password"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                  required
                />
              </div>
              {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Zapisywanie..." : "Ustaw hasło"}
              </Button>
              <Link href="/login" className="block text-center text-sm text-zinc-500 underline">
                Wróć do logowania
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
