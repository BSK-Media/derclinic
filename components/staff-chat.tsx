"use client";

import * as React from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Contact = {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  jobTitle?: string | null;
  avatarUrl?: string | null;
  unread: number;
  lastAt: string | null;
};
type Message = { id: string; createdAt: string; mine: boolean; from: string | null; body: string; readAt: string | null };

const MAX_BODY = 2000;
const fetcher = (url: string) => fetch(url).then((r) => r.json());

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ contact, size = "h-10 w-10" }: { contact: Pick<Contact, "name" | "avatarUrl">; size?: string }) {
  if (contact.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={contact.avatarUrl} alt="" className={cn(size, "shrink-0 rounded-full object-cover")} />;
  }
  return (
    <span className={cn(size, "inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200")}>
      {initials(contact.name)}
    </span>
  );
}

const timeFmt = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });
const dayFmt = new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Warsaw" });
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date(iso));

function relative(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const today = dayKey(new Date().toISOString());
  if (dayKey(iso) === today) return timeFmt.format(date);
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", timeZone: "Europe/Warsaw" }).format(date);
}

export function StaffChat({ initialWith }: { initialWith?: string | null }) {
  const { mutate: globalMutate } = useSWRConfig();
  const [activeId, setActiveId] = React.useState<string | null>(initialWith ?? null);
  const [search, setSearch] = React.useState("");
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  const { data: contactsData, mutate: mutateContacts } = useSWR<{ ok: boolean; contacts: Contact[]; me: { id: string; name: string } }>(
    "/api/chat/contacts",
    fetcher,
    { refreshInterval: 10000 },
  );
  const contacts = React.useMemo(() => contactsData?.contacts ?? [], [contactsData]);
  const active = contacts.find((c) => c.id === activeId) ?? null;

  const { data: convo, mutate: mutateMessages } = useSWR<{ ok: boolean; messages: Message[] }>(
    activeId ? `/api/chat/messages?with=${encodeURIComponent(activeId)}` : null,
    fetcher,
    { refreshInterval: 4000, refreshWhenHidden: false },
  );
  const messages = React.useMemo(() => convo?.messages ?? [], [convo]);

  // Nowe wiadomości: przewiń na dół i odśwież znaczniki nieprzeczytanych.
  const lastMessageId = messages[messages.length - 1]?.id;
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lastMessageId, activeId]);
  React.useEffect(() => {
    if (!convo?.ok) return;
    void mutateContacts();
    void globalMutate("/api/chat/unread");
  }, [convo, mutateContacts, globalMutate]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pl");
    return q ? contacts.filter((c) => c.name.toLocaleLowerCase("pl").includes(q) || c.roleLabel.toLocaleLowerCase("pl").includes(q)) : contacts;
  }, [contacts, search]);

  async function send() {
    const body = draft.trim();
    if (!activeId || !body || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: activeId, body }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się wysłać wiadomości");
      setDraft("");
      await mutateMessages();
      void mutateContacts();
    } finally {
      setSending(false);
    }
  }

  // Grupowanie wiadomości po dniach.
  const withDays = messages.map((m, i) => ({ m, newDay: i === 0 || dayKey(m.createdAt) !== dayKey(messages[i - 1].createdAt) }));

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[420px] overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-950">
      {/* Lista osób */}
      <aside className={cn("w-full shrink-0 flex-col border-r md:flex md:w-80", activeId ? "hidden" : "flex")}>
        <div className="border-b p-3">
          <h1 className="mb-2 text-lg font-semibold">Czat</h1>
          <Input placeholder="Szukaj osoby…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!contactsData ? <div className="p-4 text-sm text-zinc-500">Ładowanie…</div> : null}
          {contactsData && filtered.length === 0 ? <div className="p-4 text-sm text-zinc-500">Brak osób.</div> : null}
          {filtered.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => setActiveId(contact.id)}
              className={cn(
                "flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900",
                contact.id === activeId ? "bg-emerald-50 dark:bg-emerald-500/10" : "",
              )}
            >
              <Avatar contact={contact} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={cn("truncate text-sm", contact.unread > 0 ? "font-semibold" : "font-medium")}>{contact.name}</span>
                  <span className="shrink-0 text-[11px] text-zinc-400">{relative(contact.lastAt)}</span>
                </span>
                <span className="block truncate text-xs text-zinc-500">{contact.jobTitle || contact.roleLabel}</span>
              </span>
              {contact.unread > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold text-white">
                  {contact.unread}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </aside>

      {/* Rozmowa */}
      <section className={cn("min-w-0 flex-1 flex-col md:flex", activeId ? "flex" : "hidden")}>
        {active ? (
          <>
            <header className="flex items-center gap-3 border-b px-3 py-2.5">
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="rounded-lg px-2 py-1 text-lg text-zinc-500 hover:bg-zinc-100 md:hidden dark:hover:bg-zinc-900"
                aria-label="Wróć do listy"
              >
                ‹
              </button>
              <Avatar contact={active} size="h-9 w-9" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{active.name}</div>
                <div className="truncate text-xs text-zinc-500">{active.jobTitle || active.roleLabel}</div>
              </div>
            </header>

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-zinc-50/60 px-3 py-3 dark:bg-zinc-900/30">
              {messages.length === 0 ? (
                <div className="py-10 text-center text-sm text-zinc-500">Brak wiadomości. Napisz pierwszą.</div>
              ) : null}
              {withDays.map(({ m, newDay }) => (
                <React.Fragment key={m.id}>
                  {newDay ? (
                    <div className="py-2 text-center text-[11px] capitalize text-zinc-400">{dayFmt.format(new Date(m.createdAt))}</div>
                  ) : null}
                  <div className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                        m.mine
                          ? "rounded-br-md bg-emerald-600 text-white"
                          : "rounded-bl-md border bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100",
                      )}
                    >
                      {!m.mine && m.from && m.from !== active.name ? <div className="mb-0.5 text-[11px] font-semibold opacity-70">{m.from}</div> : null}
                      {m.body}
                      <div className={cn("mt-0.5 text-right text-[10px]", m.mine ? "text-emerald-100" : "text-zinc-400")}>
                        {timeFmt.format(new Date(m.createdAt))}
                        {m.mine ? (m.readAt ? " · przeczytano" : " · wysłano") : ""}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              ))}
              <div ref={bottomRef} />
            </div>

            <form
              className="flex items-end gap-2 border-t p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                placeholder="Napisz wiadomość… (Enter wysyła, Shift+Enter nowa linia)"
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-950"
                aria-label="Treść wiadomości"
              />
              <Button type="submit" disabled={sending || draft.trim().length === 0}>
                Wyślij
              </Button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-zinc-500">
            Wybierz osobę z listy, aby zobaczyć rozmowę. Wiadomości są wewnętrzne — pacjenci ich nie widzą.
          </div>
        )}
      </section>
    </div>
  );
}
