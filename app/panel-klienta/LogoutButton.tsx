"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function logout() {
    setLoading(true);
    try {
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
