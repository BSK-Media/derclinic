"use client";

import * as React from "react";
import Image from "next/image";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { OPERATOR_PIN_LENGTH } from "@/lib/operator-pin";

// Drugi krok logowania na koncie wspólnym (recepcja): po haśle i kodzie MFA
// każda osoba podaje swój PIN — to on wskazuje, kto jest przy komputerze.
export default function OperatorPinPage() {
  const [pin, setPin] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pin.length !== OPERATOR_PIN_LENGTH) return setError(`PIN to ${OPERATOR_PIN_LENGTH} cyfr`);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/operator/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && !data?.message?.includes("PIN")) {
        window.location.href = "/login";
        return;
      }
      if (data?.locked) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok || !data?.ok) {
        setPin("");
        return setError(data?.message || "Nie udało się sprawdzić PIN-u");
      }
      window.location.href = data.redirect || "/admin";
    } catch {
      setError("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center">
            <Image src="/derclinic-logo.webp" alt="DerClinic" width={160} height={160} priority />
          </div>
          <CardTitle className="text-center">Podaj PIN</CardTitle>
          <p className="text-center text-sm text-zinc-500">
            To konto jest wspólne. Wpisz swój {OPERATOR_PIN_LENGTH}-cyfrowy PIN, żeby system wiedział, kto pracuje.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="operator-pin">PIN</Label>
              <Input
                id="operator-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                autoFocus
                maxLength={OPERATOR_PIN_LENGTH}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, OPERATOR_PIN_LENGTH))}
                className="text-center text-2xl tracking-[0.5em]"
                required
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading || pin.length !== OPERATOR_PIN_LENGTH}>
              {loading ? "Sprawdzanie..." : "Wejdź"}
            </Button>
            <button type="button" onClick={logout} className="block w-full text-center text-sm text-zinc-500 underline">
              Wyloguj
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
