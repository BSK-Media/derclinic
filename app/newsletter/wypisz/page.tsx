"use client";

import * as React from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Strona z linku „Wypisz się" w newsletterze. Wypisanie dopiero po kliknięciu
// przycisku — sam link otwierany przez filtry poczty niczego nie zmienia.
export default function NewsletterUnsubscribePage() {
  return (
    <React.Suspense fallback={null}>
      <Unsubscribe />
    </React.Suspense>
  );
}

function Unsubscribe() {
  const token = useSearchParams().get("token") || "";
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = React.useState("");

  async function confirm() {
    setState("loading");
    try {
      const res = await fetch("/api/newsletter/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMessage(data?.message || "Nie udało się wypisać z newslettera.");
        return setState("error");
      }
      setState("done");
    } catch {
      setMessage("Nie udało się połączyć z serwerem. Spróbuj ponownie.");
      setState("error");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center">
            <Image src="/derclinic-logo.webp" alt="DerClinic" width={140} height={140} priority />
          </div>
          <CardTitle className="text-center">Wypisanie z newslettera</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center text-sm text-zinc-600">
          {state === "done" ? (
            <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">
              Gotowe — nie będziemy już wysyłać Ci informacji marketingowych. Wiadomości o wizytach (potwierdzenia,
              zmiany, przypomnienia) nadal będą do Ciebie docierać. Zgodę możesz włączyć ponownie w panelu klienta.
            </p>
          ) : (
            <>
              <p>Kliknij przycisk, aby wycofać zgodę na informacje marketingowe od DerClinic.</p>
              {state === "error" ? (
                <p role="alert" className="text-red-600">
                  {message}
                </p>
              ) : null}
              <Button onClick={confirm} disabled={!token || state === "loading"} className="w-full">
                {state === "loading" ? "Zapisywanie…" : "Wypisz mnie z newslettera"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
