"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rfmScaleRows } from "@/lib/rfm";

type Thresholds = { r: number[]; f: number[]; m: number[] };
type Resp = {
  ok: boolean;
  message?: string;
  settings?: { windowDays: number; thresholds: Thresholds | null };
  defaults?: Thresholds;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const GROUPS: { key: keyof Thresholds; title: string; unit: string; help: string }[] = [
  { key: "r", title: "Świeżość (R)", unit: "dni", help: "Ocena 5 do pierwszej wartości, 4 do drugiej, 3 do trzeciej, 2 do czwartej; powyżej — 1." },
  { key: "f", title: "Częstotliwość (F)", unit: "wizyt i zakupów", help: "Ocena 2 od pierwszej wartości, 3 od drugiej, 4 od trzeciej, 5 od czwartej; poniżej pierwszej — 1." },
  { key: "m", title: "Wartość (M)", unit: "zł", help: "Ocena 2 od pierwszej kwoty, 3 od drugiej, 4 od trzeciej, 5 od czwartej; poniżej pierwszej — 1." },
];

export default function RfmSettingsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN";
  const { data, mutate } = useSWR<Resp>(
    user && (user.role === "ADMIN" || user.role === "MANAGER") ? "/api/admin/settings/rfm" : null,
    fetcher,
  );
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <Link href="/admin/settings" className="text-sm text-slate-500 hover:underline">← Ustawienia</Link>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Segmentacja pacjentów (RFM)</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Zakresy, według których system ocenia pacjentów w skali 1–5 pod względem świeżości, częstotliwości i wartości.
          Zmiany działają od razu w Analityce i na kartach pacjentów.
        </p>
      </div>
      <Card className="space-y-5 p-5">
        {!data ? <div className="text-sm text-slate-500">Ładowanie…</div> : null}
        {data && !data.ok ? <div className="text-sm text-red-600">{data.message || "Brak dostępu."}</div> : null}
        {data?.ok && data.settings ? (
          <RfmForm
            key={JSON.stringify(data.settings)}
            settings={data.settings}
            defaults={data.defaults}
            canEdit={canEdit}
            onSaved={() => mutate()}
          />
        ) : null}
      </Card>
    </div>
  );
}

function RfmForm({
  settings,
  defaults,
  canEdit,
  onSaved,
}: {
  settings: NonNullable<Resp["settings"]>;
  defaults?: Thresholds;
  canEdit: boolean;
  onSaved: () => Promise<unknown>;
}) {
  const source = settings.thresholds ?? defaults;
  const [windowDays, setWindowDays] = React.useState(String(settings.windowDays));
  const [custom, setCustom] = React.useState(Boolean(settings.thresholds));
  const [vals, setVals] = React.useState<Record<string, string[]>>({
    r: source?.r.map(String) ?? [],
    f: source?.f.map(String) ?? [],
    m: source?.m.map(String) ?? [],
  });
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      const thresholds = custom
        ? { r: vals.r.map(Number), f: vals.f.map(Number), m: vals.m.map(Number) }
        : null;
      const res = await fetch("/api/admin/settings/rfm", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ windowDays: Number(windowDays), thresholds }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać ustawień");
      toast.success("Zapisano ustawienia segmentacji");
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
            <div className="space-y-1">
              <Label htmlFor="rfm-window">Okno obliczeń dla częstotliwości i wartości (dni; 0 = cała historia)</Label>
              <Input
                id="rfm-window"
                type="number"
                min={0}
                max={1095}
                value={windowDays}
                disabled={!canEdit}
                onChange={(e) => setWindowDays(e.target.value)}
                className="max-w-[10rem]"
              />
              <p className="text-xs text-slate-500">0 = cała historia pacjenta (zalecane przy długich cyklach powrotów) albo 30–1095 dni. Świeżość liczy się zawsze od ostatniej wizyty lub zakupu.</p>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Sposób oceniania</div>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" checked={!custom} disabled={!canEdit} onChange={() => setCustom(false)} className="mt-1" />
                <span>
                  <strong>Automatyczny</strong> — pacjenci dzieleni na pięć równych grup względem siebie (kwintyle).
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" checked={custom} disabled={!canEdit} onChange={() => setCustom(true)} className="mt-1" />
                <span>
                  <strong>Skala progów</strong> — oceny wynikają z ustalonych wartości (domyślnie wyliczonych z historii kliniki).
                </span>
              </label>
            </div>

            {custom ? (
              <ScaleTable
                thresholds={{
                  r: vals.r.map(Number),
                  f: vals.f.map(Number),
                  m: vals.m.map(Number),
                }}
              />
            ) : null}

            {custom ? (
              <div className="space-y-4">
                {GROUPS.map((g) => (
                  <div key={g.key} className="space-y-1">
                    <div className="text-sm font-medium">
                      {g.title} <span className="font-normal text-slate-500">({g.unit})</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[0, 1, 2, 3].map((i) => (
                        <Input
                          key={i}
                          type="number"
                          min={0}
                          value={vals[g.key]?.[i] ?? ""}
                          disabled={!canEdit}
                          onChange={(e) =>
                            setVals((cur) => {
                              const next = [...(cur[g.key] ?? [])];
                              next[i] = e.target.value;
                              return { ...cur, [g.key]: next };
                            })
                          }
                        />
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">{g.help} Wartości muszą rosnąć.</p>
                  </div>
                ))}
              </div>
            ) : null}

            {canEdit ? (
              <div className="flex justify-end">
                <Button onClick={save} disabled={saving}>{saving ? "Zapisywanie…" : "Zapisz ustawienia"}</Button>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Ustawienia może zmieniać tylko administrator.</p>
            )}
    </>
  );
}

function ScaleTable({ thresholds }: { thresholds: Thresholds }) {
  const valid = ["r", "f", "m"].every(
    (key) =>
      thresholds[key as keyof Thresholds].length === 4 &&
      thresholds[key as keyof Thresholds].every((n) => Number.isFinite(n)),
  );
  if (!valid) return null;
  const rows = rfmScaleRows(thresholds);
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium">Skala ocen</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-3 font-medium">Ocena</th>
              <th className="py-1 pr-3 font-medium">Świeżość (R)</th>
              <th className="py-1 pr-3 font-medium">Częstotliwość (F)</th>
              <th className="py-1 font-medium">Wartość (M)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.score} className="border-t border-slate-200 dark:border-white/10">
                <td className="py-1.5 pr-3 font-semibold">{row.score}</td>
                <td className="py-1.5 pr-3">{row.r}</td>
                <td className="py-1.5 pr-3">{row.f}</td>
                <td className="py-1.5">{row.m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Segmenty: VIP = R, F i M ≥ 4; Do odzyskania = R ≤ 2 i (F ≥ 4 lub M ≥ 4); Zagrożeni = R ≤ 2 i F ≥ 3; Uśpieni = R ≤ 2;
        Nowi = R ≥ 4 i F ≤ 2; Lojalni = R ≥ 3 i F ≥ 3.
      </p>
    </div>
  );
}
