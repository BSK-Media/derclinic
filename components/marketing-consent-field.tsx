"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MarketingConsentValue = { checked: boolean; file: File | null };
export const EMPTY_MARKETING_CONSENT: MarketingConsentValue = { checked: false, file: null };

const MAX_BYTES = 6 * 1024 * 1024;
const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Zapis zgody marketingowej pacjenta wyrażonej na recepcji (papierowy dokument) wraz z opcjonalnym skanem. */
export async function saveMarketingConsent(patientId: string, value: MarketingConsentValue, granted = true): Promise<boolean> {
  const form = new FormData();
  form.set("granted", granted ? "true" : "false");
  if (value.file) form.set("file", value.file);
  try {
    const res = await fetch(`/api/admin/patients/${patientId}/consents`, { method: "POST", body: form });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) {
      toast.error(out?.message || "Nie udało się zapisać zgody marketingowej");
      return false;
    }
    return true;
  } catch {
    toast.error("Nie udało się zapisać zgody marketingowej");
    return false;
  }
}

// Pole zgody marketingowej przy rejestracji: recepcja daje pacjentowi dokument do wypełnienia, zaznacza checkbox
// i opcjonalnie dołącza skan podpisanej zgody. Przy pacjencie, który zgodę już ma, pokazujemy tylko informację.
export function MarketingConsentField({
  value,
  onChange,
  patientId,
}: {
  value: MarketingConsentValue;
  onChange: (next: MarketingConsentValue) => void;
  /** Istniejący pacjent — sprawdzamy, czy zgoda została już udzielona. */
  patientId?: string | null;
}) {
  const { data } = useSWR<{ ok: boolean; marketing?: { granted: boolean; grantedAt: string | null } }>(
    patientId ? `/api/admin/patients/${patientId}/consents` : null,
    fetcher,
  );
  const alreadyGranted = Boolean(patientId && data?.ok && data.marketing?.granted);

  if (alreadyGranted) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
        Zgoda marketingowa tego pacjenta jest już udzielona
        {data?.marketing?.grantedAt ? ` (${new Date(data.marketing.grantedAt).toLocaleDateString("pl-PL")})` : ""}.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-emerald-600"
          checked={value.checked}
          onChange={(event) => onChange({ checked: event.target.checked, file: event.target.checked ? value.file : null })}
        />
        <span>
          <span className="font-medium">Zgoda marketingowa</span> — pacjent wypełnił i podpisał dokument zgody na komunikację marketingową
          (newsletter, powiadomienia).
        </span>
      </label>
      {value.checked ? (
        <div className="space-y-1 pl-6">
          <Label htmlFor="marketing-consent-scan" className="text-xs text-zinc-500">
            Skan podpisanej zgody (opcjonalnie — PDF lub zdjęcie, do 6 MB)
          </Label>
          <Input
            id="marketing-consent-scan"
            type="file"
            accept="application/pdf,image/*"
            className="h-auto py-1.5"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (file && file.size > MAX_BYTES) {
                toast.error("Plik jest za duży (maksymalnie 6 MB)");
                event.target.value = "";
                return;
              }
              onChange({ ...value, file });
            }}
          />
        </div>
      ) : (
        <div className="pl-6 text-xs text-zinc-500">Zaznacz, gdy pacjent odda wypełniony dokument. Zgodę można też uzupełnić później w karcie pacjenta.</div>
      )}
    </div>
  );
}
