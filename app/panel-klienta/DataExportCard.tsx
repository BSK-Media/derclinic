"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { downloadFile } from "@/lib/download-file";

// Pobranie kopii własnych danych (art. 15 i 20 RODO).
export function DataExportCard() {
  const [busy, setBusy] = React.useState(false);

  async function download() {
    setBusy(true);
    try {
      const result = await downloadFile("/api/patient/export", "moje-dane-derclinic.json");
      if (!result.ok) toast.error(result.message || "Nie udało się pobrać danych");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="text-sm font-semibold text-zinc-900">Moje dane</div>
      <p className="mt-1 text-xs text-zinc-500">
        Pobierz kopię swoich danych: dane konta, zgody, wizyty, płatności i punkty (plik JSON). Zdjęcia z wizyt znajdziesz przy
        każdej wizycie.
      </p>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-600 px-3.5 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
      >
        <Download className="h-4 w-4" /> {busy ? "Przygotowuję…" : "Pobierz moje dane"}
      </button>
    </div>
  );
}
