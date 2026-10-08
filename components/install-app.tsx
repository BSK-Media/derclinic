"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, Copy, Download, EllipsisVertical, PlusSquare, Share, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  INSTALL_DISMISS_KEY,
  INSTALL_DONE_KEY,
  INSTALL_SNOOZE_DAYS,
  parseInstallContext,
  type InstallContext,
} from "@/lib/install-app";

// Instalacja panelu klienta jako aplikacji (PWA) na telefonie.
//  * Android: baner z przyciskiem "Zainstaluj" wywołuje natywne okno instalacji (jedno dotknięcie).
//  * iPhone: Apple nie pozwala zainstalować aplikacji ze strony, więc przycisk otwiera instrukcję
//    dopasowaną do przeglądarki (Safari / Chrome…), ze strzałką pokazującą, gdzie dotknąć.
// Baner pojawia się tylko na telefonie, poza zainstalowaną aplikacją, i wraca po "Później" dopiero
// po kilkunastu dniach. Dowolny przycisk w aplikacji może wywołać instalację zdarzeniem OPEN_EVENT.

const OPEN_EVENT = "derclinic-install-open";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* tryb prywatny / zablokowane dane witryny — baner po prostu będzie wracał */
  }
}

function isStandaloneNow() {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

/** Czy ten telefon w ogóle powinien widzieć propozycję instalacji (telefon, nie zainstalowana, nie "gotowe"). */
export function useInstallEligible() {
  const [eligible, setEligible] = React.useState(false);
  React.useEffect(() => {
    const ctx = parseInstallContext(navigator.userAgent, navigator.maxTouchPoints);
    const update = () =>
      setEligible(ctx.platform !== "other" && !isStandaloneNow() && readStorage(INSTALL_DONE_KEY) !== "1");
    update();
    window.addEventListener("appinstalled", update);
    return () => window.removeEventListener("appinstalled", update);
  }, []);
  return eligible;
}

/** Przycisk "Zainstaluj aplikację" do menu / ekranów — widoczny tylko, gdy instalacja ma sens. */
export function InstallAppButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  const eligible = useInstallEligible();
  if (!eligible) return null;
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      {children ?? "Zainstaluj aplikację"}
    </button>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-semibold text-white">
        {n}
      </span>
      <div className="pt-0.5 text-sm text-zinc-700">{children}</div>
    </li>
  );
}

function InstallInstructions({ ctx, onCopyLink }: { ctx: InstallContext; onCopyLink: () => void }) {
  // Strona otwarta w przeglądarce wbudowanej w aplikację albo w starej przeglądarce na iPhonie.
  if (ctx.inApp || !ctx.canInstallFromThisBrowser) {
    const target = ctx.platform === "ios" ? "Safari" : "Chrome";
    return (
      <div className="space-y-3 text-sm text-zinc-700">
        <p>
          {ctx.inApp
            ? "Ta strona jest otwarta w przeglądarce wbudowanej w inną aplikację (np. Instagram lub Facebook), która nie pozwala zainstalować aplikacji."
            : "Ta przeglądarka nie pozwala zainstalować aplikacji na tym telefonie."}
        </p>
        <p>
          Skopiuj link i otwórz go w <strong>{target}</strong> — tam instalacja zajmie kilka sekund.
        </p>
        <button
          type="button"
          onClick={onCopyLink}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Copy className="h-4 w-4" /> Skopiuj link
        </button>
      </div>
    );
  }

  if (ctx.platform === "android") {
    return (
      <ol className="space-y-3">
        <Step n={1}>
          Dotknij menu <EllipsisVertical className="mx-0.5 inline h-4 w-4 align-text-bottom" /> w prawym górnym rogu
          przeglądarki.
        </Step>
        <Step n={2}>
          Wybierz <strong>„Zainstaluj aplikację”</strong> (albo „Dodaj do ekranu głównego”).
        </Step>
        <Step n={3}>
          Potwierdź przyciskiem <strong>„Zainstaluj”</strong> — ikona pojawi się na ekranie głównym.
        </Step>
      </ol>
    );
  }

  const safari = ctx.iosBrowser === "safari";
  return (
    <ol className="space-y-3">
      <Step n={1}>
        {ctx.safariMenuLayout ? (
          <>
            Dotknij menu <strong>•••</strong> w prawym dolnym rogu przeglądarki.
          </>
        ) : safari ? (
          <>
            Dotknij ikony <strong>Udostępnij</strong> <Share className="mx-0.5 inline h-4 w-4 align-text-bottom" />{" "}
            na dolnym pasku przeglądarki.
          </>
        ) : (
          <>
            Dotknij ikony <strong>Udostępnij</strong> <Share className="mx-0.5 inline h-4 w-4 align-text-bottom" />{" "}
            w pasku adresu u góry (albo w menu <strong>⋯</strong>).
          </>
        )}
      </Step>
      <Step n={2}>
        {ctx.safariMenuLayout ? (
          <>
            Wybierz <strong>„Udostępnij”</strong> <Share className="mx-0.5 inline h-4 w-4 align-text-bottom" />, a na
            liście{" "}
          </>
        ) : (
          "Przewiń listę i wybierz "
        )}
        <strong>„Do ekranu początkowego”</strong>{" "}
        <PlusSquare className="mx-0.5 inline h-4 w-4 align-text-bottom" />.
      </Step>
      <Step n={3}>
        Dotknij <strong>„Dodaj”</strong> w prawym górnym rogu — ikona pojawi się na ekranie początkowym.
      </Step>
    </ol>
  );
}

export function InstallAppBanner({ autoShow = true }: { autoShow?: boolean }) {
  const [ctx, setCtx] = React.useState<InstallContext | null>(null);
  const [visible, setVisible] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const deferred = React.useRef<BeforeInstallPromptEvent | null>(null);

  const eligibleNow = React.useCallback((context: InstallContext) => {
    if (context.platform === "other" || isStandaloneNow()) return false;
    return readStorage(INSTALL_DONE_KEY) !== "1";
  }, []);

  // Kontekst urządzenia + natywne zdarzenia instalacji.
  React.useEffect(() => {
    const context = parseInstallContext(navigator.userAgent, navigator.maxTouchPoints);
    setCtx(context);

    function onBeforeInstall(event: Event) {
      event.preventDefault(); // własny baner zamiast domyślnego paska przeglądarki
      deferred.current = event as BeforeInstallPromptEvent;
    }
    function onInstalled() {
      writeStorage(INSTALL_DONE_KEY, "1");
      deferred.current = null;
      setVisible(false);
      setDialogOpen(false);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Automatyczne pojawienie się banera po chwili (nie od razu, żeby nie zasłaniał pierwszego ekranu).
  React.useEffect(() => {
    if (!autoShow || !ctx || !eligibleNow(ctx)) return;
    const until = Number(readStorage(INSTALL_DISMISS_KEY) ?? 0);
    if (until > Date.now()) return;
    const timer = window.setTimeout(() => setVisible(true), 4000);
    return () => window.clearTimeout(timer);
  }, [autoShow, ctx, eligibleNow]);

  const snooze = React.useCallback((days: number) => {
    writeStorage(INSTALL_DISMISS_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
    setVisible(false);
  }, []);

  const startInstall = React.useCallback(async () => {
    const prompt = deferred.current;
    if (prompt) {
      // Android: natywne okno instalacji.
      deferred.current = null;
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === "accepted") {
          writeStorage(INSTALL_DONE_KEY, "1");
          setVisible(false);
        } else {
          snooze(3);
        }
      } catch {
        setDialogOpen(true);
      }
      return;
    }
    setVisible(false);
    setDialogOpen(true);
  }, [snooze]);

  // Przyciski w menu / na ekranach uruchamiają ten sam proces.
  React.useEffect(() => {
    const onOpen = () => void startInstall();
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [startInstall]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* brak dostępu do schowka — użytkownik skopiuje adres ręcznie */
    }
  }

  if (!ctx) return null;
  const showArrowBottom = dialogOpen && ctx.platform === "ios" && ctx.canInstallFromThisBrowser && ctx.iosBrowser === "safari";
  const showArrowTop = dialogOpen && ctx.platform === "ios" && ctx.canInstallFromThisBrowser && ctx.iosBrowser !== "safari";

  return (
    <>
      {visible && !dialogOpen ? (
        <div
          role="dialog"
          aria-label="Zainstaluj aplikację"
          className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden"
        >
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-violet-200 bg-white p-3 shadow-xl">
            <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
              <Image src="/derclinic-logo.webp" alt="" fill className="object-contain p-1" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-zinc-900">Zainstaluj aplikację DerClinic</div>
              <div className="text-xs leading-snug text-zinc-500">
                Wizyty, zgody i powiadomienia zawsze pod ręką — bez wpisywania adresu.
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void startInstall()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-1.5 text-sm font-semibold text-white transition active:scale-95"
                >
                  <Download className="h-4 w-4" /> Zainstaluj
                </button>
                <button
                  type="button"
                  onClick={() => snooze(INSTALL_SNOOZE_DAYS)}
                  className="rounded-xl px-2.5 py-1.5 text-sm font-medium text-zinc-500"
                >
                  Później
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => snooze(INSTALL_SNOOZE_DAYS)}
              aria-label="Zamknij"
              className="self-start rounded-lg p-1 text-zinc-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Zainstaluj aplikację DerClinic</DialogTitle>
          </DialogHeader>
          <InstallInstructions ctx={ctx} onCopyLink={() => void copyLink()} />
          {copied ? <p className="text-xs font-medium text-emerald-700">Link skopiowany.</p> : null}
        </DialogContent>
      </Dialog>

      {/* Strzałka pokazująca, gdzie na iPhonie dotknąć "Udostępnij". */}
      {showArrowBottom ? (
        <div
          className={
            "pointer-events-none fixed bottom-[calc(0.25rem+env(safe-area-inset-bottom))] z-[300] flex " +
            // iOS 26: menu "•••" jest przy prawej krawędzi dolnego paska; wcześniej "Udostępnij" był na środku.
            (ctx.safariMenuLayout ? "right-[2.2rem]" : "inset-x-0 justify-center")
          }
        >
          <ArrowDown className="h-10 w-10 animate-bounce text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
        </div>
      ) : null}
      {showArrowTop ? (
        <div className="pointer-events-none fixed right-3 top-[calc(0.25rem+env(safe-area-inset-top))] z-[300]">
          <ArrowUp className="h-10 w-10 animate-bounce text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" />
        </div>
      ) : null}
    </>
  );
}
