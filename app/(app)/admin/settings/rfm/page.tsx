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
import { RFM_SEGMENT_LABELS, RFM_SEGMENT_ORDER, rfmScaleRows, type RfmSegment } from "@/lib/rfm";

type Thresholds = { r: number[]; f: number[]; m: number[] };
type Rule = { segment: RfmSegment; r: [number, number]; f: [number, number]; m: [number, number] };
type Resp = {
  ok: boolean;
  message?: string;
  settings?: { windowDays: number; thresholds: Thresholds | null; rules: Rule[] };
  defaults?: Thresholds;
  defaultRules?: Rule[];
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
            defaultRules={data.defaultRules ?? []}
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
  defaultRules,
  canEdit,
  onSaved,
}: {
  settings: NonNullable<Resp["settings"]>;
  defaults?: Thresholds;
  defaultRules: Rule[];
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
  const [rules, setRules] = React.useState<Rule[]>(settings.rules);
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
        body: JSON.stringify({ windowDays: Number(windowDays), thresholds, rules }),
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

            <RulesEditor rules={rules} setRules={setRules} defaultRules={defaultRules} canEdit={canEdit} />

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
    </div>
  );
}

const SCORE_OPTIONS = [1, 2, 3, 4, 5];
const SELECT_CLASS = "h-8 rounded-md border border-slate-300 bg-white px-1 text-sm dark:border-white/15 dark:bg-[#0b1220]";

function RangeSelects({
  value,
  onChange,
  canEdit,
}: {
  value: [number, number];
  onChange: (next: [number, number]) => void;
  canEdit: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={value[0]}
        disabled={!canEdit}
        className={SELECT_CLASS}
        onChange={(e) => {
          const lo = Number(e.target.value);
          onChange([lo, Math.max(lo, value[1])]);
        }}
      >
        {SCORE_OPTIONS.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <span className="text-slate-400">–</span>
      <select
        value={value[1]}
        disabled={!canEdit}
        className={SELECT_CLASS}
        onChange={(e) => {
          const hi = Number(e.target.value);
          onChange([Math.min(hi, value[0]), hi]);
        }}
      >
        {SCORE_OPTIONS.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </span>
  );
}

function RulesEditor({
  rules,
  setRules,
  defaultRules,
  canEdit,
}: {
  rules: Rule[];
  setRules: React.Dispatch<React.SetStateAction<Rule[]>>;
  defaultRules: Rule[];
  canEdit: boolean;
}) {
  const update = (index: number, patch: Partial<Rule>) =>
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  const move = (index: number, delta: number) =>
    setRules((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Reguły segmentów</div>
      <p className="text-xs text-slate-500">
        Pacjent trafia do segmentu pierwszej pasującej reguły (od góry). Reguła pasuje, gdy oceny pacjenta (1–5) mieszczą się
        we wszystkich trzech zakresach. Ten sam segment może mieć kilka reguł („lub”). Pacjent, którego nie złapie żadna
        reguła, jest w „Pozostali”.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-2 font-medium">#</th>
              <th className="py-1 pr-2 font-medium">Segment</th>
              <th className="py-1 pr-2 font-medium">Świeżość (R)</th>
              <th className="py-1 pr-2 font-medium">Częstotliwość (F)</th>
              <th className="py-1 pr-2 font-medium">Wartość (M)</th>
              <th className="py-1 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule, index) => (
              <tr key={index} className="border-t border-slate-200 dark:border-white/10">
                <td className="py-1.5 pr-2 text-xs text-slate-500">{index + 1}</td>
                <td className="py-1.5 pr-2">
                  <select
                    value={rule.segment}
                    disabled={!canEdit}
                    onChange={(e) => update(index, { segment: e.target.value as RfmSegment })}
                    className="h-8 rounded-md border border-slate-300 bg-white px-1 text-sm dark:border-white/15 dark:bg-[#0b1220]"
                  >
                    {RFM_SEGMENT_ORDER.map((segment) => (
                      <option key={segment} value={segment}>
                        {RFM_SEGMENT_LABELS[segment].label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 pr-2"><RangeSelects canEdit={canEdit} value={rule.r} onChange={(r) => update(index, { r })} /></td>
                <td className="py-1.5 pr-2"><RangeSelects canEdit={canEdit} value={rule.f} onChange={(f) => update(index, { f })} /></td>
                <td className="py-1.5 pr-2"><RangeSelects canEdit={canEdit} value={rule.m} onChange={(m) => update(index, { m })} /></td>
                <td className="py-1.5 text-right whitespace-nowrap">
                  {canEdit ? (
                    <>
                      <button type="button" className="px-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30" disabled={index === 0} onClick={() => move(index, -1)} aria-label="W górę">↑</button>
                      <button type="button" className="px-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30" disabled={index === rules.length - 1} onClick={() => move(index, 1)} aria-label="W dół">↓</button>
                      <button type="button" className="px-1.5 text-red-600 hover:text-red-800" onClick={() => setRules((current) => current.filter((_, i) => i !== index))} aria-label="Usuń regułę">✕</button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
            {rules.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-3 text-slate-500">Brak reguł — wszyscy pacjenci trafią do „Pozostali”.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRules((current) => [...current, { segment: "VIP", r: [1, 5], f: [1, 5], m: [1, 5] }])}
          >
            + Dodaj regułę
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setRules(defaultRules)}>
            Przywróć reguły domyślne
          </Button>
        </div>
      ) : null}
    </div>
  );
}
