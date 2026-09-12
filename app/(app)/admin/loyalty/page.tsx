"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Star, Coins, Gift, ShieldCheck, Info, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// UWAGA: to jest strona WYŁĄCZNIE do odczytu. Zasady programu lojalnościowego
// (1 pkt za 10 zł, 1 pkt = 1 zł rabatu) są ustalone raz w lib/loyalty.ts i
// celowo nie da się ich zmienić z panelu — żeby ktoś przez pomyłkę nie
// rozregulował naliczania/rabatów w produkcji. Zmiana zasady wymaga zmiany
// kodu (świadomej decyzji deweloperskiej), a nie klikania w ustawieniach.
export default function LoyaltyExplainerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [backfilling, setBackfilling] = React.useState(false);

  React.useEffect(() => {
    if (!loading && user && user.role !== "ADMIN") {
      router.replace("/admin");
    }
  }, [loading, user, router]);

  async function runBackfill() {
    setBackfilling(true);
    try {
      const res = await fetch("/api/admin/loyalty/backfill", { method: "POST" });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zsynchronizować punktów");
      toast.success(
        out.appointmentsFixed > 0
          ? `Doliczono ${out.pointsAdded} pkt na ${out.appointmentsFixed} wizyt (sprawdzono ${out.appointmentsScanned}, pominięto ${out.skippedUnpaid} nieopłaconych w pełni)`
          : `Wszystko już naliczone poprawnie (sprawdzono ${out.appointmentsScanned} wizyt, pominięto ${out.skippedUnpaid} nieopłaconych w pełni)`,
      );
    } finally {
      setBackfilling(false);
    }
  }

  if (loading || !user || user.role !== "ADMIN") return null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Star className="h-5 w-5 text-violet-600" /> Punkty lojalnościowe
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Widok tylko do odczytu — wyjaśnienie działania programu. Zasady nie są edytowalne z tego miejsca.
        </p>
      </div>

      <div
        className="flex items-start gap-2 rounded-2xl border border-violet-200 bg-violet-50 p-3.5 text-sm text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300"
      >
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          To jest zakładka informacyjna, widoczna tylko dla administratora. Zasady naliczania i wykorzystania
          punktów są zakodowane na stałe w aplikacji (jedno źródło prawdy: <code>lib/loyalty.ts</code>) i nie
          można ich zmienić z panelu — zapobiega to przypadkowej zmianie działania programu w produkcji.
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-violet-600" /> Naliczanie punktów
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>
            Za każde <strong>wydane 10 zł</strong> na wizycie pacjent otrzymuje <strong>1 punkt</strong>{" "}
            (zaokrąglenie w dół — np. 45 zł to 4 pkt, nie 4,5).
          </p>
          <p>
            Punkty są naliczane od <strong>ceny końcowej wizyty</strong> (pole „Cena końcowa" na karcie wizyty),
            czyli już po ewentualnym rabacie za punkty użyte przy rezerwacji tej samej wizyty.
          </p>
          <p>
            Moment naliczenia: dopiero gdy recepcja lub administrator{" "}
            <strong>zaakceptuje zakończoną wizytę</strong> (przycisk „Zaakceptuj" na karcie wizyty) — nie samo
            oznaczenie jako „Zakończona". Dzięki temu punkty nie trafiają na konto za wizyty, które później
            okażą się błędnie wprowadzone i zostaną poprawione przed akceptacją.
          </p>
          <p className="text-zinc-500 dark:text-zinc-400">
            Każda wizyta nalicza punkty dokładnie raz — ponowna akceptacja tej samej wizyty nie dubluje punktów.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-4 w-4 text-violet-600" /> Wykorzystanie punktów (rabat)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>
            <strong>1 punkt = 1 zł rabatu.</strong> Zalogowany pacjent, rezerwując wizytę online, widzi swoje
            saldo punktów i suwakiem wybiera, ile chce wykorzystać — do wysokości mniejszej z dwóch wartości:
            posiadanego salda albo ceny wybranego zabiegu (rabat nie może przekroczyć ceny usługi).
          </p>
          <p>
            Rabat jest odejmowany od ceny standardowej i zapisywany na wizycie jako{" "}
            <strong>cena końcowa</strong>. Informacja o tym, ile punktów wykorzystano i jaki to rabat, jest
            widoczna na karcie wizyty w panelu admina/recepcji (żółta/fioletowa plakietka nad polami cen).
          </p>
          <p className="text-zinc-500 dark:text-zinc-400">
            Wykorzystanie punktów jest dostępne tylko dla zalogowanych pacjentów — gość rezerwujący bez konta
            nie ma trwałego salda punktów do wykorzystania.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-violet-600" /> Dokumentacja i audyt
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>
            Każde naliczenie i każde wykorzystanie punktów zapisuje się jako osobny, niezmienny wpis w historii
            punktów pacjenta (widoczny też dla samego pacjenta w jego panelu, zakładka „Punkty lojalnościowe") —
            z datą, liczbą punktów i wizytą, której dotyczy.
          </p>
          <p>
            Bieżące saldo punktów pacjenta jest zawsze sumą tej historii — nic nie da się „ręcznie" podkręcić
            bez pozostawienia śladu w dzienniku operacji.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4 text-violet-600" /> Synchronizacja historycznych wizyt
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>
            Sprawdza wszystkie zakończone i zaakceptowane wizyty w systemie i dolicza brakujące punkty tym, które
            są w pełni opłacone, a z jakiegoś powodu (np. wizyta zaakceptowana zanim naprawiono liczenie ceny)
            punktów jeszcze nie otrzymały. Nigdy nie odbiera punktów i bezpiecznie można uruchomić wielokrotnie —
            wizyty, które mają już poprawną liczbę punktów, są pomijane.
          </p>
          <Button size="sm" onClick={runBackfill} disabled={backfilling}>
            {backfilling ? "Synchronizuję…" : "Zsynchronizuj punkty za wszystkie wizyty"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
