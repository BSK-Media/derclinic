"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/confirm-provider";
import { NewsletterClientPicker, type PickerClient } from "@/components/newsletter-client-picker";

// Okno jednej listy odbiorców: nazwa, członkowie (wyszukiwanie i zaznaczanie
// klientów), usuwanie listy. Zmiany zapisują się przyciskiem „Zapisz".
export function NewsletterListDialog({
  listId,
  onOpenChange,
  onChanged,
}: {
  listId: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [name, setName] = React.useState("");
  const [originalName, setOriginalName] = React.useState("");
  const [auto, setAuto] = React.useState(false);
  const [autoMembers, setAutoMembers] = React.useState<PickerClient[]>([]);
  const [memberIds, setMemberIds] = React.useState<string[]>([]);
  const [originalIds, setOriginalIds] = React.useState<string[]>([]);
  const [unsubscribedCount, setUnsubscribedCount] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!listId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await fetch(`/api/admin/newsletter/lists/${listId}`, { cache: "no-store" });
      const out = await res.json().catch(() => ({}));
      if (cancelled) return;
      setLoading(false);
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się wczytać listy.");
        return onOpenChange(false);
      }
      const members: PickerClient[] = out.list.members;
      setAuto(Boolean(out.list.auto));
      setAutoMembers(members);
      setName(out.list.name);
      setOriginalName(out.list.name);
      setMemberIds(members.map((m) => m.id));
      setOriginalIds(members.map((m) => m.id));
      setUnsubscribedCount(members.filter((m) => !m.subscribed).length);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);

  const added = memberIds.filter((id) => !originalIds.includes(id));
  const removed = originalIds.filter((id) => !memberIds.includes(id));
  const dirty = name.trim() !== originalName || added.length > 0 || removed.length > 0;

  async function save() {
    if (!listId) return;
    if (name.trim().length < 2) return toast.error("Podaj nazwę listy (min. 2 znaki)");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/newsletter/lists/${listId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(name.trim() !== originalName ? { name: name.trim() } : {}),
          addPatientIds: added,
          removePatientIds: removed,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać listy.");
      toast.success("Lista zapisana");
      onChanged();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!listId) return;
    const ok = await confirm({
      message: `Usunąć listę „${originalName}”? Klienci zostają w systemie, znika tylko lista.`,
      destructive: true,
      confirmLabel: "Usuń listę",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/newsletter/lists/${listId}`, { method: "DELETE" });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się usunąć listy.");
    toast.success("Lista usunięta");
    onChanged();
    onOpenChange(false);
  }

  return (
    <Dialog open={listId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Lista odbiorców</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Ładowanie…</div>
        ) : (
          <div className="space-y-4">
            {auto ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-400/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                  <strong>{name}</strong> — lista automatyczna. Skład wyznacza segment pacjentów (RFM) i jest przeliczany
                  sam: gdy pacjent trafi do innego segmentu, znika z tej listy. Nie edytuje się jej ręcznie.
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto text-sm">
                  {autoMembers.length === 0 ? (
                    <div className="text-slate-500">Na liście nie ma teraz nikogo.</div>
                  ) : (
                    autoMembers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1 dark:border-white/5">
                        <span className="truncate">{m.name}</span>
                        {!m.subscribed ? <span className="shrink-0 text-xs text-amber-700 dark:text-amber-300">bez zgody</span> : null}
                      </div>
                    ))
                  )}
                </div>
                {unsubscribedCount > 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {unsubscribedCount} z listy nie ma zgody marketingowej lub adresu e-mail — nie dostaną newslettera.
                  </p>
                ) : null}
              </div>
            ) : (
            <>
            <div className="space-y-1">
              <Label htmlFor="list-name">Nazwa listy</Label>
              <Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">Klienci na liście</div>
              {/* Do listy można dodać też klienta bez zgody — dostanie wiadomość dopiero, gdy ją wyrazi. */}
              <NewsletterClientPicker selectedIds={memberIds} onChange={setMemberIds} allowUnsubscribed />
              {unsubscribedCount > 0 ? (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  {unsubscribedCount} {unsubscribedCount === 1 ? "klient na liście nie ma" : "klientów na liście nie ma"}{" "}
                  zgody marketingowej — nie dostaną newslettera.
                </p>
              ) : null}
            </div>
            </>
            )}
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          {auto ? (
            <span />
          ) : (
            <Button variant="destructive" onClick={remove} disabled={loading || saving}>
              Usuń listę
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Zamknij
            </Button>
            {auto ? null : (
              <Button onClick={save} disabled={loading || saving || !dirty}>
                {saving ? "Zapisywanie…" : "Zapisz"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
