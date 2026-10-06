"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { RichHtmlEditor } from "@/components/rich-html-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CampaignRow = {
  id: string;
  subject: string;
  status: "DRAFT" | "SENT";
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  recipientCount: number;
  sentCount: number;
};

type Campaign = CampaignRow & { preheader: string | null; html: string };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

const SECTION =
  "rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55";
const INPUT =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]";

const STARTER_HTML =
  "<h2>Nowość w DerClinic</h2><p>Dzień dobry!</p><p>Napisz tutaj treść wiadomości…</p>";

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : "—";
}

// Podgląd w ramce z sandboxem bez skryptów — wiadomość w ramce DerClinic jak u klienta.
function previewDoc(html: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;">
<div style="background:#059669;padding:18px 28px;color:#fff;font-size:18px;font-weight:700;">DerClinic</div>
<div style="padding:28px;color:#3f3f46;font-size:15px;line-height:1.6;">${html}</div>
<div style="padding:16px 28px;background:#fafafa;color:#a1a1aa;font-size:12px;">Otrzymujesz tę wiadomość, bo wyraziłaś/eś zgodę na informacje marketingowe od DerClinic. Wypisz się z newslettera · Ustawienia zgód w panelu klienta</div>
</div></body></html>`;
}

export default function NewsletterPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/newsletter", fetcher);
  const campaigns: CampaignRow[] = data?.campaigns ?? [];
  const recipients: number = data?.recipients ?? 0;
  const mailConfigured: boolean = data?.mailConfigured ?? true;

  // null = nic nie wybrane; "new" = nowy szkic; inaczej id kampanii.
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState<Campaign | null>(null);
  const [subject, setSubject] = React.useState("");
  const [preheader, setPreheader] = React.useState("");
  const [html, setHtml] = React.useState("");
  const [busy, setBusy] = React.useState<null | "save" | "test" | "send">(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  // Potwierdzenie w oknie aplikacji (zamiast okienka przeglądarki).
  const [confirmAction, setConfirmAction] = React.useState<null | {
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
    run: () => void;
  }>(null);
  // Zmienia się przy każdym wyborze kampanii — wymusza ponowne załadowanie edytora.
  const [editorKey, setEditorKey] = React.useState(0);

  const readOnly = loaded?.status === "SENT";

  function startNew(initial?: { subject: string; preheader: string | null; html: string }) {
    setSelectedId("new");
    setLoaded(null);
    setSubject(initial?.subject ?? "");
    setPreheader(initial?.preheader ?? "");
    setHtml(initial?.html ?? STARTER_HTML);
    setEditorKey((k) => k + 1);
  }

  async function open(id: string) {
    const res = await fetch(`/api/admin/newsletter/${id}`, { cache: "no-store" });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się wczytać wiadomości.");
    const campaign: Campaign = out.campaign;
    setSelectedId(id);
    setLoaded(campaign);
    setSubject(campaign.subject);
    setPreheader(campaign.preheader ?? "");
    setHtml(campaign.html);
    setEditorKey((k) => k + 1);
  }

  async function save(): Promise<string | null> {
    if (!subject.trim()) {
      toast.error("Podaj temat wiadomości.");
      return null;
    }
    setBusy("save");
    try {
      const isNew = selectedId === "new" || !selectedId;
      const res = await fetch(isNew ? "/api/admin/newsletter" : `/api/admin/newsletter/${selectedId}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, preheader, html }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się zapisać szkicu.");
        return null;
      }
      const id: string = isNew ? out.id : (selectedId as string);
      if (isNew) {
        setSelectedId(id);
        setLoaded({
          id,
          subject,
          preheader,
          html,
          status: "DRAFT",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sentAt: null,
          recipientCount: 0,
          sentCount: 0,
        });
      }
      await mutate();
      return id;
    } finally {
      setBusy(null);
    }
  }

  async function saveClicked() {
    if (await save()) toast.success("Szkic zapisany");
  }

  function askSendAll() {
    const remaining = loaded?.status === "SENT" ? Math.max(0, recipients - loaded.sentCount) : recipients;
    setConfirmAction({
      title: loaded?.status === "SENT" ? "Dokończyć wysyłkę?" : "Wysłać newsletter?",
      message: `„${subject}” zostanie wysłany do ${remaining} ${
        remaining === 1 ? "klienta" : "klientów"
      } ze zgodą marketingową. Tej operacji nie można cofnąć — sprawdź wcześniej wiadomość próbną.`,
      confirmLabel: "Wyślij",
      run: () => send("all"),
    });
  }

  async function send(mode: "test" | "all") {
    const id = readOnly ? (selectedId as string) : await save();
    if (!id) return;
    setBusy(mode === "test" ? "test" : "send");
    try {
      const res = await fetch(`/api/admin/newsletter/${id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się wysłać wiadomości.");
      if (mode === "test") return toast.success(`Wiadomość próbna wysłana na ${out.sentTo}`);

      if (out.remaining > 0) {
        toast.warning(
          `Wysłano ${out.sentNow} wiadomości (razem ${out.sentTotal} z ${out.recipientCount}). Kliknij „Dokończ wysyłkę”, żeby wysłać pozostałe.`,
          { duration: 12000 },
        );
      } else {
        toast.success(`Wysłano do ${out.sentTotal} klientów${out.failed ? `, błędy: ${out.failed}` : ""}.`);
      }
      await mutate();
      await open(id);
    } finally {
      setBusy(null);
    }
  }

  function askRemove() {
    if (!selectedId || selectedId === "new") return;
    setConfirmAction({
      title: "Usunąć szkic?",
      message: `Szkic „${subject}” zostanie usunięty bezpowrotnie.`,
      confirmLabel: "Usuń",
      destructive: true,
      run: remove,
    });
  }

  async function remove() {
    if (!selectedId || selectedId === "new") return;
    const res = await fetch(`/api/admin/newsletter/${selectedId}`, { method: "DELETE" });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się usunąć szkicu.");
    toast.success("Szkic usunięty");
    setSelectedId(null);
    setLoaded(null);
    mutate();
  }

  const remainingToSend = loaded?.status === "SENT" ? Math.max(0, recipients - loaded.sentCount) : recipients;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Newsletter</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Wiadomości e-mail do klientów ze zgodą marketingową ({recipients}{" "}
            {recipients === 1 ? "odbiorca" : "odbiorców"}). W stopce każdej wiadomości jest link do wypisania się.
          </p>
        </div>
        <Button onClick={() => startNew()}>+ Nowa wiadomość</Button>
      </div>

      {!mailConfigured ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          Wysyłka e-mail nie jest skonfigurowana (brak RESEND_API_KEY) — szkice można pisać, ale nie da się ich wysłać.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <section className={SECTION}>
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Wiadomości</h2>
          {isLoading ? <div className="text-sm text-slate-500">Ładowanie…</div> : null}
          {!isLoading && campaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">
              Brak wiadomości. Kliknij „Nowa wiadomość”.
            </div>
          ) : null}
          <ul className="space-y-2">
            {campaigns.map((campaign) => (
              <li key={campaign.id}>
                <button
                  type="button"
                  onClick={() => open(campaign.id)}
                  className={
                    "w-full rounded-2xl border p-3 text-left transition hover:bg-slate-50 dark:hover:bg-white/5 " +
                    (selectedId === campaign.id
                      ? "border-emerald-400 bg-emerald-50/60 dark:border-emerald-500/50 dark:bg-emerald-500/10"
                      : "border-slate-200 dark:border-white/10")
                  }
                >
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{campaign.subject}</div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {campaign.status === "SENT"
                        ? `Wysłano ${campaign.sentCount}/${campaign.recipientCount}`
                        : "Szkic"}
                    </span>
                    <span>{formatDate(campaign.sentAt ?? campaign.updatedAt)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className={SECTION}>
          {!selectedId ? (
            <div className="py-16 text-center text-sm text-slate-500">
              Wybierz wiadomość z listy albo utwórz nową.
            </div>
          ) : (
            <div className="space-y-4">
              {readOnly ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  Ta wiadomość została wysłana ({formatDate(loaded?.sentAt ?? null)}) i nie można jej edytować.
                  {remainingToSend > 0
                    ? ` Do ${remainingToSend} klientów jeszcze nie dotarła — możesz dokończyć wysyłkę.`
                    : ""}
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Temat</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={readOnly}
                  maxLength={150}
                  className={INPUT}
                  placeholder="np. Jesienne promocje w DerClinic"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Podgląd w skrzynce (opcjonalnie)
                </label>
                <input
                  value={preheader}
                  onChange={(e) => setPreheader(e.target.value)}
                  disabled={readOnly}
                  maxLength={200}
                  className={INPUT}
                  placeholder="Krótki tekst widoczny obok tematu"
                />
              </div>

              {readOnly ? (
                <iframe
                  title="Treść wysłanej wiadomości"
                  sandbox=""
                  srcDoc={previewDoc(html)}
                  className="h-[480px] w-full rounded-2xl border border-slate-200 bg-white dark:border-white/10"
                />
              ) : (
                <RichHtmlEditor key={editorKey} value={html} onChange={setHtml} />
              )}

              <div className="flex flex-wrap items-center gap-2">
                {!readOnly ? (
                  <Button variant="outline" onClick={saveClicked} disabled={busy !== null}>
                    {busy === "save" ? "Zapisywanie…" : "Zapisz szkic"}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => startNew({ subject: subject, preheader, html })}
                  >
                    Duplikuj jako nowy szkic
                  </Button>
                )}
                <Button variant="outline" onClick={() => setPreviewOpen(true)}>
                  Podgląd
                </Button>
                {!readOnly ? (
                  <Button variant="outline" onClick={() => send("test")} disabled={busy !== null || !mailConfigured}>
                    {busy === "test" ? "Wysyłanie…" : "Wyślij próbną do siebie"}
                  </Button>
                ) : null}
                <Button
                  onClick={askSendAll}
                  disabled={busy !== null || !mailConfigured || remainingToSend === 0}
                >
                  {busy === "send"
                    ? "Wysyłanie…"
                    : readOnly
                      ? `Dokończ wysyłkę (${remainingToSend})`
                      : `Wyślij do klientów (${recipients})`}
                </Button>
                {!readOnly && selectedId !== "new" ? (
                  <Button variant="destructive" onClick={askRemove} disabled={busy !== null} className="ml-auto">
                    Usuń szkic
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>

      <Dialog open={confirmAction !== null} onOpenChange={(open) => (!open ? setConfirmAction(null) : undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmAction?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-300">{confirmAction?.message}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Anuluj
            </Button>
            <Button
              variant={confirmAction?.destructive ? "destructive" : "default"}
              onClick={() => {
                const action = confirmAction;
                setConfirmAction(null);
                action?.run();
              }}
            >
              {confirmAction?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Podgląd: {subject || "(bez tematu)"}</DialogTitle>
          </DialogHeader>
          <iframe
            title="Podgląd wiadomości"
            sandbox=""
            srcDoc={previewDoc(html)}
            className="h-[70vh] w-full rounded-xl border border-slate-200 bg-white"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
