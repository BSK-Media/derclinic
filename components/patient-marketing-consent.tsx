"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMarketingConsent } from "@/components/marketing-consent-field";

type Doc = { id: string; fileName: string; mimeType: string; size: number; createdAt: string };
type Data = { ok: boolean; marketing: { granted: boolean; grantedAt: string | null; revokedAt: string | null }; documents: Doc[] };

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const dateTime = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" });
const MAX_BYTES = 6 * 1024 * 1024;

// Zgoda marketingowa w karcie pacjenta (recepcja): zaznaczenie zgody z papierowego dokumentu, opcjonalny skan
// i lista wgranych skanów. Zgodę można uzupełnić w dowolnym momencie, także długo po rejestracji.
export function PatientMarketingConsent({ patientId }: { patientId: string }) {
  const { data, mutate } = useSWR<Data>(`/api/admin/patients/${patientId}/consents`, fetcher);
  const [file, setFile] = React.useState<File | null>(null);
  const [fileKey, setFileKey] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

  if (!data?.ok) return null;
  const granted = data.marketing.granted;

  async function submit(nextGranted: boolean) {
    setSaving(true);
    try {
      const ok = await saveMarketingConsent(patientId, { checked: nextGranted, file }, nextGranted);
      if (!ok) return;
      toast.success(nextGranted ? (granted ? "Dołączono skan zgody" : "Zapisano zgodę marketingową") : "Zapisano wycofanie zgody");
      setFile(null);
      setFileKey((key) => key + 1);
      await mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm dark:bg-zinc-950">
      <div className="border-b p-4">
        <div className="font-medium">Zgoda marketingowa (dokument papierowy)</div>
        <div className="text-xs text-zinc-500">
          Zgodę z papierowego dokumentu można zapisać tutaj w dowolnym momencie, opcjonalnie ze skanem.
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={
              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " +
              (granted
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300")
            }
          >
            {granted ? "Zgoda udzielona" : "Brak zgody"}
          </span>
          {granted && data.marketing.grantedAt ? <span className="text-xs text-zinc-500">od {dateTime.format(new Date(data.marketing.grantedAt))}</span> : null}
          {!granted && data.marketing.revokedAt ? <span className="text-xs text-zinc-500">wycofana {dateTime.format(new Date(data.marketing.revokedAt))}</span> : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="patient-consent-scan" className="text-xs text-zinc-500">
            Skan podpisanej zgody (opcjonalnie — PDF lub zdjęcie, do 6 MB)
          </Label>
          <Input
            key={fileKey}
            id="patient-consent-scan"
            type="file"
            accept="application/pdf,image/*"
            className="h-auto max-w-md py-1.5"
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              if (picked && picked.size > MAX_BYTES) {
                toast.error("Plik jest za duży (maksymalnie 6 MB)");
                event.target.value = "";
                return;
              }
              setFile(picked);
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {!granted ? (
            <Button size="sm" onClick={() => submit(true)} disabled={saving}>
              {saving ? "Zapisywanie…" : "Zapisz zgodę marketingową"}
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => submit(true)} disabled={saving || !file}>
                Dołącz skan do zgody
              </Button>
              <Button size="sm" variant="outline" onClick={() => submit(false)} disabled={saving}>
                Zapisz wycofanie zgody
              </Button>
            </>
          )}
        </div>

        {data.documents.length > 0 ? (
          <ul className="space-y-1.5 border-t pt-3 text-sm">
            {data.documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3">
                <a
                  href={`/api/admin/patients/${patientId}/consents/documents/${doc.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 items-center gap-1.5 text-indigo-700 hover:underline dark:text-indigo-300"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{doc.fileName}</span>
                </a>
                <span className="shrink-0 text-xs text-zinc-400">{dateTime.format(new Date(doc.createdAt))}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
