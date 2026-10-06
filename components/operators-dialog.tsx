"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OPERATOR_PIN_LENGTH, validateOperatorPin } from "@/lib/operator-pin";

type Operator = { id: string; name: string; createdAt: string; updatedAt: string };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

// Osoby pracujące na wspólnym koncie recepcji i ich 6-cyfrowe PIN-y (tylko
// administrator). PIN-u nie da się odczytać — można go tylko ustawić na nowo.
export function OperatorsDialog({
  account,
  onOpenChange,
}: {
  account: { id: string; login: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const url = account ? `/api/admin/users/${account.id}/operators` : null;
  const { data, mutate, isLoading } = useSWR(url, fetcher);
  const operators: Operator[] = data?.operators ?? [];

  const [name, setName] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editPin, setEditPin] = React.useState("");

  React.useEffect(() => {
    setName("");
    setPin("");
    setEditId(null);
    setEditPin("");
  }, [account?.id]);

  async function call(input: string, init: RequestInit, success: string) {
    setBusy(true);
    try {
      const res = await fetch(input, { ...init, headers: { "content-type": "application/json" } });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się zapisać zmiany.");
        return false;
      }
      toast.success(success);
      await mutate();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!url) return;
    const issue = validateOperatorPin(pin);
    if (issue) return toast.error(issue);
    if (name.trim().length < 2) return toast.error("Podaj imię i nazwisko (min. 2 znaki)");
    if (await call(url, { method: "POST", body: JSON.stringify({ name: name.trim(), pin }) }, "Dodano osobę")) {
      setName("");
      setPin("");
    }
  }

  async function savePin(operator: Operator) {
    if (!url) return;
    const issue = validateOperatorPin(editPin);
    if (issue) return toast.error(issue);
    if (await call(`${url}/${operator.id}`, { method: "PATCH", body: JSON.stringify({ pin: editPin }) }, "Zmieniono PIN")) {
      setEditId(null);
      setEditPin("");
    }
  }

  async function remove(operator: Operator) {
    if (!url) return;
    if (
      !confirm(
        `Usunąć osobę „${operator.name}” z konta „${account?.login}”?\n\nJej PIN przestanie działać, a jeśli teraz pracuje na koncie, system poprosi o PIN ponownie.`,
      )
    ) {
      return;
    }
    await call(`${url}/${operator.id}`, { method: "DELETE" }, "Usunięto osobę");
  }

  const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, OPERATOR_PIN_LENGTH);

  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Osoby i PIN-y — konto „{account?.login}”</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-zinc-500">
          Po zalogowaniu na to konto (hasło i kod 2FA) system poprosi o {OPERATOR_PIN_LENGTH}-cyfrowy PIN. To, który PIN
          zostanie wpisany, wskazuje osobę — jej imię pojawia się w logach przy każdej akcji. Bez żadnej osoby konto
          działa normalnie, bez PIN-u.
        </p>

        <div className="space-y-2">
          {isLoading ? <div className="text-sm text-zinc-500">Ładowanie…</div> : null}
          {!isLoading && operators.length === 0 ? (
            <div className="rounded-xl border border-dashed p-3 text-center text-sm text-zinc-500">
              Brak osób — konto działa bez PIN-u.
            </div>
          ) : null}
          {operators.map((operator) => (
            <div key={operator.id} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{operator.name}</div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setEditId(editId === operator.id ? null : operator.id);
                      setEditPin("");
                    }}
                  >
                    Zmień PIN
                  </Button>
                  <Button variant="destructive" size="sm" disabled={busy} onClick={() => remove(operator)}>
                    Usuń
                  </Button>
                </div>
              </div>
              {editId === operator.id ? (
                <div className="mt-3 flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label>Nowy PIN ({OPERATOR_PIN_LENGTH} cyfr)</Label>
                    <Input
                      value={editPin}
                      onChange={(e) => setEditPin(digitsOnly(e.target.value))}
                      inputMode="numeric"
                      autoComplete="off"
                      className="tracking-[0.3em]"
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={busy || editPin.length !== OPERATOR_PIN_LENGTH}
                    onClick={() => savePin(operator)}
                  >
                    Zapisz
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border bg-zinc-50 p-3 dark:bg-zinc-900">
          <div className="text-sm font-medium">Dodaj osobę</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Imię i nazwisko</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Anna Kowalska" />
            </div>
            <div className="space-y-1">
              <Label>PIN ({OPERATOR_PIN_LENGTH} cyfr)</Label>
              <Input
                value={pin}
                onChange={(e) => setPin(digitsOnly(e.target.value))}
                inputMode="numeric"
                autoComplete="off"
                className="tracking-[0.3em]"
              />
            </div>
          </div>
          <Button
            size="sm"
            disabled={busy || name.trim().length < 2 || pin.length !== OPERATOR_PIN_LENGTH}
            onClick={add}
          >
            Dodaj osobę
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zamknij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
