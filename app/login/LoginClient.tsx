"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";
import { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS_HINT, validatePassword } from "@/lib/password-policy";

export default function LoginClient() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Serwer odmówił sesji, bo hasło jest tymczasowe albo za słabe — pokazujemy
  // formularz ustawienia nowego hasła.
  const [changeReason, setChangeReason] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordRepeat, setNewPasswordRepeat] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.code === "PASSWORD_CHANGE_REQUIRED") {
        setChangeReason(data.message);
        return;
      }
      if (!res.ok || !data?.ok) {
        toast.error(data?.message || "Błąd logowania");
        return;
      }
      toast.success("Zalogowano");
      window.location.href = "/";
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
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login, currentPassword: password, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast.error(data?.message || "Nie udało się zmienić hasła");
        return;
      }
      toast.success("Hasło zmienione. Zalogowano");
      window.location.href = "/";
    } catch (err: any) {
      toast.error(err?.message || "Błąd");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center">
            <Image src="/derclinic-logo.webp" alt="DerClinic" width={220} height={220} priority />
          </div>
          <CardTitle className="text-center">Panel DerClinic OS</CardTitle>
          <p className="text-center text-sm text-zinc-500">
            {changeReason ? changeReason : "Zaloguj się do systemu rezerwacji i magazynu."}
          </p>
        </CardHeader>
        <CardContent>
          {changeReason ? (
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
                {loading ? "Zapisywanie..." : "Ustaw hasło i zaloguj"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setChangeReason(null);
                  setPassword("");
                  setNewPassword("");
                  setNewPasswordRepeat("");
                }}
              >
                Wróć
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="login">Login</Label>
                <Input
                  id="login"
                  autoComplete="username"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  required
                />
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
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
