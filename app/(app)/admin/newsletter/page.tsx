"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { RichHtmlEditor } from "@/components/rich-html-editor";
import { prepareImageForUpload } from "@/lib/client-image";
import { NewsletterClientPicker } from "@/components/newsletter-client-picker";
import { NewsletterListDialog } from "@/components/newsletter-list-dialog";
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

type Campaign = CampaignRow & {
  preheader: string | null;
  html: string;
  audienceType?: "ALL" | "LISTS" | "PATIENTS";
  audienceListIds?: string[];
  audiencePatientIds?: string[];
};

type AudienceType = "ALL" | "LISTS" | "PATIENTS";
type ListRow = { id: string; name: string; members: number; subscribed: number };

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

const SECTION =
  "rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0b1220]/55";
const INPUT =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-300 dark:border-white/10 dark:bg-[#0b1220]";

const STARTER_HTML =
  "<h2>Nowość w DerClinic</h2><p>Dzień dobry!</p><p>Napisz tutaj treść wiadomości…</p>";

// Wgranie zdjęcia z dysku do edytora — zwraca publiczny adres obrazu do wstawienia w treść.
async function uploadImage(original: File): Promise<string> {
  const file = await prepareImageForUpload(original);
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/admin/newsletter/images", { method: "POST", body: form });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out?.ok || typeof out.url !== "string") {
    throw new Error(out?.message || "Nie udało się wgrać zdjęcia.");
  }
  return out.url;
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : "—";
}

// Podgląd w ramce z sandboxem bez skryptów — wiadomość w ramce DerClinic jak u klienta.
function previewDoc(html: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;">
<div style="background:#7C3AED;padding:14px 28px;color:#fff;font-size:18px;font-weight:700;display:flex;align-items:center;gap:12px;"><img src="${typeof window === "undefined" ? "" : window.location.origin}/icons/icon-192.png" width="44" height="44" alt="" style="width:44px;height:44px;border-radius:22px;background:#fff;">DerClinic</div>
<div style="padding:28px;color:#3f3f46;font-size:15px;line-height:1.6;">${html}</div>
<div style="padding:16px 28px;background:#fafafa;color:#a1a1aa;font-size:12px;">Otrzymujesz tę wiadomość, bo wyraziłaś/eś zgodę na informacje marketingowe od DerClinic. Wypisz się z newslettera · Ustawienia zgód w panelu klienta</div>
</div></body></html>`;
}

export default function NewsletterPage() {
  const { data, mutate, isLoading } = useSWR("/api/admin/newsletter", fetcher);
  const campaigns: CampaignRow[] = data?.campaigns ?? [];
  const recipients: number = data?.recipients ?? 0;
  const mailConfigured: boolean = data?.mailConfigured ?? true;

  // Własne listy odbiorców oraz wybór odbiorców bieżącej wiadomości.
  const { data: listsData, mutate: mutateLists } = useSWR("/api/admin/newsletter/lists", fetcher);
  const lists: ListRow[] = listsData?.lists ?? [];
  const [audienceType, setAudienceType] = React.useState<AudienceType>("ALL");
  const [audienceListIds, setAudienceListIds] = React.useState<string[]>([]);
  const [audiencePatientIds, setAudiencePatientIds] = React.useState<string[]>([]);
  // Ilu klientów faktycznie dostanie wysyłkę (po zgodzie marketingowej i e-mailu).
  const [audienceCount, setAudienceCount] = React.useState<number | null>(null);
  const [listDialogId, setListDialogId] = React.useState<string | null>(null);
  const [newListName, setNewListName] = React.useState("");
  const [creatingList, setCreatingList] = React.useState(false);

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

  const audience = React.useMemo(
    () => ({ type: audienceType, listIds: audienceListIds, patientIds: audiencePatientIds }),
    [audienceType, audienceListIds, audiencePatientIds],
  );

  // Aktualna liczba odbiorców dla wybranego grona (z krótkim opóźnieniem przy klikaniu).
  React.useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      const res = await fetch("/api/admin/newsletter/audience", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(audience),
      });
      const out = await res.json().catch(() => ({}));
      if (!cancelled && res.ok && out?.ok) setAudienceCount(out.count);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [audience, selectedId]);

  function applyAudience(source?: Pick<Campaign, "audienceType" | "audienceListIds" | "audiencePatientIds">) {
    setAudienceType(source?.audienceType ?? "ALL");
    setAudienceListIds(source?.audienceListIds ?? []);
    setAudiencePatientIds(source?.audiencePatientIds ?? []);
  }

  async function createList() {
    const name = newListName.trim();
    if (name.length < 2) return toast.error("Podaj nazwę listy (min. 2 znaki)");
    setCreatingList(true);
    try {
      const res = await fetch("/api/admin/newsletter/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się utworzyć listy.");
      setNewListName("");
      await mutateLists();
      // Od razu otwieramy listę, żeby dodać do niej klientów.
      setListDialogId(out.list.id);
    } finally {
      setCreatingList(false);
    }
  }

  function startNew(initial?: Partial<Campaign> & { subject: string; preheader: string | null; html: string }) {
    setSelectedId("new");
    setLoaded(null);
    setSubject(initial?.subject ?? "");
    setPreheader(initial?.preheader ?? "");
    setHtml(initial?.html ?? STARTER_HTML);
    applyAudience(initial);
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
    applyAudience(campaign);
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
        body: JSON.stringify({ subject, preheader, html, audience }),
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
    const remaining = remainingToSend;
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

  const targetCount = audienceCount ?? 0;
  const remainingToSend = loaded?.status === "SENT" ? Math.max(0, targetCount - loaded.sentCount) : targetCount;

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

          {/* Własne listy odbiorców — do nich dodajemy konkretnych klientów. */}
          <div className="mt-6 border-t border-slate-200 pt-4 dark:border-white/10">
            <h2 className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">Listy odbiorców</h2>
            <p className="mb-3 text-xs text-slate-500">
              Np. „Klientki botoksu” albo „VIP”. Przy wysyłce wybierasz jedną lub kilka list.
            </p>
            <ul className="space-y-2">
              {lists.map((list) => (
                <li key={list.id}>
                  <button
                    type="button"
                    onClick={() => setListDialogId(list.id)}
                    className="w-full rounded-2xl border border-slate-200 p-3 text-left transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                  >
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{list.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {list.members} {list.members === 1 ? "klient" : "klientów"} · {list.subscribed} ze zgodą
                    </div>
                  </button>
                </li>
              ))}
              {lists.length === 0 ? <li className="text-xs text-slate-400">Brak list.</li> : null}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void createList();
              }}
            >
              <input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                maxLength={80}
                placeholder="Nazwa nowej listy"
                className={INPUT}
              />
              <Button type="submit" variant="outline" disabled={creatingList || newListName.trim().length < 2}>
                Dodaj
              </Button>
            </form>
          </div>
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
                <RichHtmlEditor key={editorKey} value={html} onChange={setHtml} uploadImage={uploadImage} />
              )}

              {/* Odbiorcy: wszyscy ze zgodą, wybrane listy albo ręcznie wybrani klienci. */}
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Odbiorcy</div>
                  <div className="text-xs text-slate-500">
                    Wiadomość dostanie:{" "}
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                      {audienceCount === null ? "…" : audienceCount}
                    </span>{" "}
                    {audienceCount === 1 ? "klient" : "klientów"} (ze zgodą marketingową i adresem e-mail)
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  {(
                    [
                      { value: "ALL", label: `Wszyscy klienci ze zgodą marketingową (${recipients})` },
                      { value: "LISTS", label: "Wybrane listy odbiorców" },
                      { value: "PATIENTS", label: "Wybrani klienci" },
                    ] as { value: AudienceType; label: string }[]
                  ).map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="audience-type"
                        checked={audienceType === option.value}
                        disabled={readOnly}
                        onChange={() => setAudienceType(option.value)}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      <span className="text-slate-800 dark:text-slate-200">{option.label}</span>
                    </label>
                  ))}
                </div>

                {audienceType === "LISTS" ? (
                  <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                    {lists.length === 0 ? (
                      <div className="text-xs text-slate-500">
                        Nie masz jeszcze żadnej listy — utwórz ją w panelu „Listy odbiorców” po lewej.
                      </div>
                    ) : null}
                    {lists.map((list) => (
                      <label key={list.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={audienceListIds.includes(list.id)}
                          disabled={readOnly}
                          onChange={(e) =>
                            setAudienceListIds((prev) =>
                              e.target.checked ? [...prev, list.id] : prev.filter((id) => id !== list.id),
                            )
                          }
                          className="h-4 w-4 accent-emerald-600"
                        />
                        <span className="flex-1 truncate">{list.name}</span>
                        <span className="text-xs text-slate-500">
                          {list.subscribed} z {list.members} ze zgodą
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}

                {audienceType === "PATIENTS" ? (
                  <div className="mt-3">
                    <NewsletterClientPicker
                      selectedIds={audiencePatientIds}
                      onChange={setAudiencePatientIds}
                      disabled={readOnly}
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!readOnly ? (
                  <Button variant="outline" onClick={saveClicked} disabled={busy !== null}>
                    {busy === "save" ? "Zapisywanie…" : "Zapisz szkic"}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() =>
                      startNew({
                        subject,
                        preheader,
                        html,
                        audienceType,
                        audienceListIds,
                        audiencePatientIds,
                      })
                    }
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
                      : `Wyślij do klientów (${targetCount})`}
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

      <NewsletterListDialog
        listId={listDialogId}
        onOpenChange={(open) => {
          if (!open) setListDialogId(null);
        }}
        onChanged={() => {
          void mutateLists();
          // Skład listy zmienia liczbę odbiorców bieżącej wiadomości.
          setAudienceListIds((ids) => [...ids]);
        }}
      />

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
