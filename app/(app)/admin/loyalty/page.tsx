"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star, Coins, Users, TrendingUp, Gift } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { isAdminLike } from "@/lib/roles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  points: number;
  earned: number;
  redeemed: number;
  lastAt: string | null;
};

type HistoryRow = {
  id: string;
  createdAt: string;
  type: "EARNED" | "REDEEMED";
  points: number;
  note: string | null;
  serviceName: string | null;
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" }) : "—";
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" });
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-zinc-500">{hint}</div> : null}
    </Card>
  );
}

// Statystyki programu lojalnościowego: salda wszystkich klientów i ręczne
// dopisywanie punktów. Zasady programu (1 pkt za 10 zł, 1 pkt = 1 zł rabatu)
// i synchronizacja historycznych wizyt są w Ustawienia → Program lojalnościowy.
export default function LoyaltyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [onlyWithPoints, setOnlyWithPoints] = React.useState(false);

  React.useEffect(() => {
    const handle = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(handle);
  }, [search]);

  React.useEffect(() => {
    if (!loading && user && !isAdminLike(user.role)) router.replace("/admin");
  }, [loading, user, router]);

  const { data, mutate, isLoading } = useSWR(
    user && isAdminLike(user.role)
      ? `/api/admin/loyalty/stats?q=${encodeURIComponent(query)}&onlyWithPoints=${onlyWithPoints ? 1 : 0}`
      : null,
    fetcher,
  );
  const clients: ClientRow[] = data?.clients ?? [];
  const kpi = data?.kpi;

  // Okno korekty punktów + historia klienta.
  const [target, setTarget] = React.useState<ClientRow | null>(null);
  const [direction, setDirection] = React.useState<"ADD" | "SUBTRACT">("ADD");
  const [points, setPoints] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const { data: historyData } = useSWR(target ? `/api/admin/loyalty/history?patientId=${target.id}` : null, fetcher);
  const history: HistoryRow[] = historyData?.history ?? [];

  function openFor(client: ClientRow) {
    setTarget(client);
    setDirection("ADD");
    setPoints("");
    setNote("");
  }

  const pointsNumber = Number(points);
  const validPoints = Number.isInteger(pointsNumber) && pointsNumber > 0;
  const balanceAfter = target && validPoints ? target.points + (direction === "ADD" ? pointsNumber : -pointsNumber) : null;

  async function submit() {
    if (!target || !validPoints) return toast.error("Podaj liczbę punktów (liczba całkowita, min. 1)");
    if (note.trim().length < 3) return toast.error("Podaj powód (min. 3 znaki)");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/loyalty/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patientId: target.id, direction, points: pointsNumber, note: note.trim() }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać punktów.");
      toast.success(
        `${direction === "ADD" ? "Dopisano" : "Odjęto"} ${pointsNumber} pkt — saldo klienta: ${out.balance} pkt`,
      );
      setTarget(null);
      await mutate();
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user || !isAdminLike(user.role)) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Star className="h-5 w-5 text-violet-600" /> Punkty lojalnościowe
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Salda wszystkich klientów i ręczne dopisywanie punktów. Zasady programu są w{" "}
            <Link href="/admin/settings/loyalty" className="underline underline-offset-2">
              Ustawieniach
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<Coins className="h-4 w-4 text-violet-600" />}
          label="Punkty w obiegu"
          value={kpi ? kpi.pointsInCirculation.toLocaleString("pl-PL") : "…"}
          hint={kpi ? `≈ ${kpi.pointsInCirculation.toLocaleString("pl-PL")} zł rabatu do wykorzystania` : undefined}
        />
        <Kpi
          icon={<Users className="h-4 w-4 text-violet-600" />}
          label="Klienci z punktami"
          value={kpi ? kpi.clientsWithPoints.toLocaleString("pl-PL") : "…"}
        />
        <Kpi
          icon={<TrendingUp className="h-4 w-4 text-violet-600" />}
          label="Naliczone łącznie"
          value={kpi ? kpi.totalEarned.toLocaleString("pl-PL") : "…"}
        />
        <Kpi
          icon={<Gift className="h-4 w-4 text-violet-600" />}
          label="Wykorzystane łącznie"
          value={kpi ? kpi.totalRedeemed.toLocaleString("pl-PL") : "…"}
        />
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj klienta po imieniu, e-mailu lub telefonie…"
            className="max-w-sm"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyWithPoints}
              onChange={(e) => setOnlyWithPoints(e.target.checked)}
              className="h-4 w-4 accent-violet-600"
            />
            Tylko z punktami
          </label>
          {data ? (
            <span className="ml-auto text-xs text-zinc-500">
              {data.total > data.limit
                ? `Pokazano ${clients.length} z ${data.total} — zawęź wyszukiwanie`
                : `${clients.length} ${clients.length === 1 ? "klient" : "klientów"}`}
            </span>
          ) : null}
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="p-3">Klient</th>
                <th className="p-3 text-right">Saldo</th>
                <th className="p-3 text-right">Naliczone</th>
                <th className="p-3 text-right">Wykorzystane</th>
                <th className="p-3">Ostatnia zmiana</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={6}>
                    Ładowanie…
                  </td>
                </tr>
              ) : null}
              {!isLoading && clients.length === 0 ? (
                <tr>
                  <td className="p-3 text-zinc-500" colSpan={6}>
                    Brak klientów spełniających kryteria.
                  </td>
                </tr>
              ) : null}
              {clients.map((client) => (
                <tr key={client.id} className="border-t">
                  <td className="p-3">
                    <Link href={`/admin/patients/${client.id}`} className="font-medium underline-offset-2 hover:underline">
                      {client.name}
                    </Link>
                    <div className="text-xs text-zinc-500">
                      {[client.phone, client.email].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>
                  <td className="p-3 text-right text-base font-semibold tabular-nums text-violet-700 dark:text-violet-300">
                    {client.points}
                  </td>
                  <td className="p-3 text-right tabular-nums">{client.earned}</td>
                  <td className="p-3 text-right tabular-nums">{client.redeemed}</td>
                  <td className="p-3 text-zinc-500">{formatDate(client.lastAt)}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => openFor(client)}>
                      Punkty
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={target !== null} onOpenChange={(open) => (!open && !saving ? setTarget(null) : undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Punkty: {target?.name}</DialogTitle>
          </DialogHeader>

          {target ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-violet-50 p-3 text-sm dark:bg-violet-500/10">
                Aktualne saldo: <strong className="text-violet-700 dark:text-violet-300">{target.points} pkt</strong>
                {balanceAfter !== null ? (
                  <>
                    {" "}
                    → po zmianie: <strong>{balanceAfter} pkt</strong>
                  </>
                ) : null}
              </div>

              <div className="flex gap-2">
                {(
                  [
                    { value: "ADD", label: "Dopisz punkty" },
                    { value: "SUBTRACT", label: "Odejmij (korekta)" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDirection(option.value)}
                    className={
                      "flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition " +
                      (direction === option.value
                        ? "border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-200"
                        : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300")
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                <div className="space-y-1">
                  <Label htmlFor="loyalty-points">Liczba punktów</Label>
                  <Input
                    id="loyalty-points"
                    value={points}
                    onChange={(e) => setPoints(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="loyalty-note">Powód (widoczny w historii klienta)</Label>
                  <Input
                    id="loyalty-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={300}
                    placeholder="np. rekompensata za zmianę terminu"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-zinc-500">Ostatnie operacje</div>
                <div className="max-h-48 overflow-auto rounded-xl border">
                  {history.length === 0 ? (
                    <div className="p-3 text-sm text-zinc-500">Brak operacji.</div>
                  ) : (
                    history.map((row) => (
                      <div key={row.id} className="flex items-start justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                        <div className="min-w-0">
                          <div className="truncate">{row.serviceName ?? row.note ?? "—"}</div>
                          <div className="text-xs text-zinc-500">
                            {formatDateTime(row.createdAt)}
                            {row.serviceName && row.note ? ` · ${row.note}` : ""}
                          </div>
                        </div>
                        <div
                          className={
                            "shrink-0 font-semibold tabular-nums " +
                            (row.type === "EARNED" ? "text-emerald-700" : "text-red-600")
                          }
                        >
                          {row.type === "EARNED" ? "+" : "−"}
                          {row.points}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={saving}>
              Anuluj
            </Button>
            <Button onClick={submit} disabled={saving || !validPoints || note.trim().length < 3}>
              {saving ? "Zapisywanie…" : direction === "ADD" ? "Dopisz punkty" : "Odejmij punkty"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
