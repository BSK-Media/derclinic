"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAccount, formatPhone, isValidPolishAccount } from "@/lib/payment-request";

type Settings = {
  recipientName: string | null;
  bankName: string | null;
  bankAccount: string | null;
  blikPhone: string | null;
  note: string | null;
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

// Dane do płatności ręcznych przy rezerwacji online: konto do przelewu i numer
// telefonu do BLIK-a. Klient widzi je po wybraniu metody płatności.
export default function PaymentSettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { data, mutate } = useSWR(user?.role === "ADMIN" ? "/api/admin/payment-settings" : null, fetcher);

  const [recipientName, setRecipientName] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [bankAccount, setBankAccount] = React.useState("");
  const [blikPhone, setBlikPhone] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!loading && user && user.role !== "ADMIN") router.replace("/admin/settings");
  }, [loading, user, router]);

  React.useEffect(() => {
    const s: Settings | undefined = data?.settings;
    if (!s) return;
    setRecipientName(s.recipientName ?? "");
    setBankName(s.bankName ?? "");
    setBankAccount(s.bankAccount ? formatAccount(s.bankAccount) : "");
    setBlikPhone(s.blikPhone ? formatPhone(s.blikPhone) : "");
    setNote(s.note ?? "");
  }, [data]);

  const accountInvalid = bankAccount.trim() !== "" && !isValidPolishAccount(bankAccount);

  async function save() {
    if (accountInvalid) return toast.error("Niepoprawny numer konta — podaj 26 cyfr polskiego rachunku.");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/payment-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipientName, bankName, bankAccount, blikPhone, note }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać danych.");
      toast.success("Dane do płatności zapisane");
      await mutate();
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user || user.role !== "ADMIN") return null;
  const available = data?.available as { BLIK: boolean; TRANSFER: boolean } | undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href="/admin/settings" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-white">
          ← Ustawienia
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Płatności</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Dane, które klient zobaczy po rezerwacji, wybierając BLIK na telefon albo przelew tradycyjny. Tytuł każdej
          płatności (kod DC-…) generuje system i widzisz go przy płatności w zakładce Wizyty → Płatności. Przelewy24
          pojawią się, gdy zostaną podłączone.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <div className="font-medium">Przelew tradycyjny</div>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="pay-recipient">Odbiorca (nazwa na rachunku)</Label>
            <Input id="pay-recipient" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={120} placeholder="np. DerClinic by Martha Sp. z o.o." />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay-bank">Bank (opcjonalnie)</Label>
            <Input id="pay-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay-account">Numer konta (26 cyfr)</Label>
            <Input
              id="pay-account"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder="00 0000 0000 0000 0000 0000 0000"
              inputMode="numeric"
              className="font-mono"
            />
            {accountInvalid ? <p className="text-xs text-red-600">Numer konta jest niepoprawny (sprawdź cyfry).</p> : null}
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          Status:{" "}
          {available?.TRANSFER ? (
            <span className="font-medium text-green-700">dostępny dla klientów</span>
          ) : (
            <span className="font-medium text-amber-700">niedostępny — uzupełnij odbiorcę i poprawny numer konta</span>
          )}
        </p>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="font-medium">BLIK na telefon</div>
        <div className="space-y-1">
          <Label htmlFor="pay-blik">Numer telefonu kliniki do BLIK-a</Label>
          <Input
            id="pay-blik"
            value={blikPhone}
            onChange={(e) => setBlikPhone(e.target.value)}
            placeholder="np. 600 000 000"
            inputMode="tel"
          />
        </div>
        <p className="text-xs text-zinc-500">
          Status:{" "}
          {available?.BLIK ? (
            <span className="font-medium text-green-700">dostępny dla klientów</span>
          ) : (
            <span className="font-medium text-amber-700">niedostępny — podaj numer telefonu</span>
          )}
        </p>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="font-medium">Dodatkowa informacja dla klienta (opcjonalnie)</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]"
          placeholder="np. Wpłaty księgujemy w dni robocze do godz. 16:00."
        />
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || accountInvalid}>
          {saving ? "Zapisywanie…" : "Zapisz dane do płatności"}
        </Button>
      </div>
    </div>
  );
}
