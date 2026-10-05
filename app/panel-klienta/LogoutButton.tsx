"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { disablePushOnThisDevice } from "@/components/push-toggle";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function logout() {
    setLoading(true);
    try {
      // Po wylogowaniu telefon nie powinien już pokazywać powiadomień o wizytach
      // tej osoby — wyłączamy je na tym urządzeniu, zanim zniknie sesja.
      await disablePushOnThisDevice("patient");
      await fetch("/api/patient/logout", { method: "POST" });
    } finally {
      router.push("/panel-klienta/logowanie");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className="rounded-xl border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60"
    >
      {loading ? "Wylogowywanie…" : "Wyloguj się"}
    </button>
  );
}
