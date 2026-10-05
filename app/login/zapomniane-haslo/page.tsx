"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

// "Nie pamiętam hasła" dla personelu — wysyła link na e-mail przypisany do
// konta (patrz /api/auth/forgot-password). Odpowiedź jest zawsze taka sama,
// niezależnie od tego, czy konto istnieje.
export default function StaffForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.message || "Nie udało się wysłać prośby. Spróbuj ponownie.");
        return;
      }
      setMessage(data.message);
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
          <CardTitle className="text-center">Nie pamiętam hasła</CardTitle>
          <p className="text-center text-sm text-zinc-500">
            Podaj login albo adres e-mail przypisany do konta — wyślemy link do ustawienia nowego hasła.
          </p>
        </CardHeader>
        <CardContent>
          {message ? (
            <div className="space-y-4">
              <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
                {message}
              </p>
              <Link href="/login" className="block text-center text-sm text-zinc-500 underline">
                Wróć do logowania
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="identifier">Login albo e-mail</Label>
                <Input
                  id="identifier"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
              {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={loading || !identifier.trim()}>
                {loading ? "Wysyłanie..." : "Wyślij link"}
              </Button>
              <p className="text-xs text-zinc-500">
                Konto bez adresu e-mail? Poproś administratora — nada hasło tymczasowe w „Konta pracowników”.
              </p>
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
