"use client";

import * as React from "react";
import { toast } from "sonner";

// Włączanie i wyłączanie powiadomień push NA TYM URZĄDZENIU — wspólne dla
// klienta (panel klienta, PWA) i pracownika (Ustawienia). Zgoda jest per
// urządzenie: każdy telefon/przeglądarkę włącza się osobno.
//
//  * klient:    service worker pod zakresem "/" (ten sam, co PWA),
//               API /api/patient/push,
//  * pracownik: ten sam plik sw.js, ale pod osobnym zakresem bez żadnych
//               stron — panel personelu nie ma być obsługiwany przez service
//               workera (cache, tryb offline), ma tylko odbierać powiadomienia.

type Audience = "patient" | "staff";

const CONFIG: Record<Audience, { api: string; scope: string }> = {
  patient: { api: "/api/patient/push", scope: "/" },
  staff: { api: "/api/me/push", scope: "/staff-push/" },
};

type State =
  | "loading"
  | "unsupported" // przeglądarka nie obsługuje push
  | "ios-install" // iPhone/iPad: push działa tylko w aplikacji z ekranu głównego
  | "denied" // użytkownik zablokował powiadomienia w przeglądarce
  | "off"
  | "on";

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(value: string) {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

// Rejestracja DOKŁADNIE pod tym zakresem. getRegistration(adres) zwróciłoby
// też rejestrację klienta ("/") dla zakresu personelu, a subskrypcja push jest
// jedna na rejestrację — klient i pracownik na tej samej przeglądarce
// nadpisywaliby sobie powiadomienia.
async function findRegistration(scope: string) {
  const registrations = await navigator.serviceWorker.getRegistrations();
  return registrations.find((registration) => new URL(registration.scope).pathname === scope) ?? null;
}

/** Rejestracja z aktywnym service workerem — bez niego nie da się założyć subskrypcji. */
async function activeRegistration(scope: string) {
  const registration =
    (await findRegistration(scope)) ?? (await navigator.serviceWorker.register("/sw.js", { scope }));
  if (registration.active) return registration;
  const worker = registration.installing ?? registration.waiting;
  await new Promise<void>((resolve) => {
    if (!worker) return resolve();
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") resolve();
    });
    setTimeout(resolve, 8000);
  });
  return registration;
}

/** Subskrypcja tego urządzenia (albo null) — bez pytania o zgodę. */
async function currentSubscription(scope: string) {
  const registration = await findRegistration(scope);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Wyłącza powiadomienia na tym urządzeniu (np. przy wylogowaniu klienta —
 * żeby po wylogowaniu telefon nie pokazywał już powiadomień o jego wizytach).
 * Nigdy nie rzuca wyjątku.
 */
export async function disablePushOnThisDevice(audience: Audience) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const { api, scope } = CONFIG[audience];
    const subscription = await currentSubscription(scope);
    if (!subscription) return;
    await fetch(api, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  } catch {
    /* brak wsparcia / brak uprawnień — nic do wyłączenia */
  }
}

export function usePushToggle(audience: Audience) {
  const { api, scope } = CONFIG[audience];
  const [state, setState] = React.useState<State>("loading");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: State;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // Na iPhonie w zwykłej karcie Safari tych API po prostu nie ma.
        next = isIos() && !isStandalone() ? "ios-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        next = "denied";
      } else {
        const subscription = await currentSubscription(scope).catch(() => null);
        next = subscription && Notification.permission === "granted" ? "on" : "off";
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  async function enable() {
    setBusy(true);
    try {
      // Pytanie o zgodę musi paść bezpośrednio po kliknięciu (wymóg przeglądarek).
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        if (permission === "denied") toast.error("Powiadomienia zostały zablokowane w przeglądarce.");
        return;
      }

      const status = await fetch(api, { cache: "no-store" }).then((r) => r.json());
      if (!status?.ok || !status.publicKey) throw new Error("Nie udało się pobrać konfiguracji powiadomień.");

      const registration = await activeRegistration(scope);
      // Zmiana klucza serwera unieważnia starą subskrypcję — zakładamy nową.
      const existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe().catch(() => {});
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(status.publicKey),
      });

      const saved = await fetch(api, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      }).then((r) => r.json());
      if (!saved?.ok) throw new Error(saved?.message || "Nie udało się zapisać urządzenia.");

      setState("on");
      toast.success("Powiadomienia włączone na tym urządzeniu.");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Nie udało się włączyć powiadomień.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await disablePushOnThisDevice(audience);
      setState("off");
      toast.success("Powiadomienia wyłączone na tym urządzeniu.");
    } finally {
      setBusy(false);
    }
  }

  return { state, busy, enable, disable };
}

const STATE_TEXT: Record<Exclude<State, "loading" | "on" | "off">, string> = {
  unsupported: "Ta przeglądarka nie obsługuje powiadomień push.",
  "ios-install":
    "Na iPhonie powiadomienia działają po dodaniu aplikacji do ekranu głównego: w Safari wybierz Udostępnij → „Do ekranu początkowego”, a potem otwórz aplikację z ikony.",
  denied:
    "Powiadomienia są zablokowane w ustawieniach przeglądarki lub telefonu dla tej strony. Odblokuj je tam, a potem wróć tutaj.",
};

/** Gotowa karta "Powiadomienia na tym urządzeniu". */
export function PushToggleCard({
  audience,
  description,
  className = "",
  onlyWhenOff = false,
}: {
  audience: Audience;
  description: string;
  className?: string;
  // Wariant "zachęta": karta pokazuje się tylko, dopóki powiadomienia da się
  // włączyć, a nie są włączone — po włączeniu znika.
  onlyWhenOff?: boolean;
}) {
  const { state, busy, enable, disable } = usePushToggle(audience);
  if (state === "loading") return null;
  if (onlyWhenOff && state !== "off" && state !== "ios-install") return null;

  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Powiadomienia na tym urządzeniu</div>
          <p className="mt-1 text-xs opacity-70">{description}</p>
          {state === "on" ? (
            <p className="mt-2 text-xs font-medium text-emerald-700">Włączone na tym urządzeniu.</p>
          ) : state !== "off" ? (
            <p className="mt-2 text-xs text-amber-700">{STATE_TEXT[state]}</p>
          ) : null}
        </div>
        {state === "on" || state === "off" ? (
          <button
            type="button"
            onClick={state === "on" ? disable : enable}
            disabled={busy}
            className={
              "shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:opacity-60 " +
              (state === "on"
                ? "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                : "bg-emerald-600 text-white hover:bg-emerald-700")
            }
          >
            {busy ? "Chwileczkę…" : state === "on" ? "Wyłącz" : "Włącz"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
