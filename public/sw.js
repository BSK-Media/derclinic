// Service Worker panelu klienta DerClinic (PWA). Rejestrowany ze scope "/"
// (patrz components/pwa-register.tsx), żeby obejmować zarówno /panel-klienta
// jak i /book — to jedyne dwie części serwisu, które rzeczywiście rejestrują
// ten plik (panel admina i strona publiczna nigdy nie wywołują register()).
//
// Świadomie ostrożna strategia: dane pacjenta (wizyty, punkty, płatności)
// NIGDY nie są cache'owane na zapas — zawsze idą siecią, żeby nikt nie
// zobaczył nieaktualnych ani cudzych danych na współdzielonym urządzeniu.
// Cache'ujemy tylko: (1) statyczne, treściowo-hashowane zasoby builda
// Next.js (_next/static/...) i ikony — bezpieczne, bo nazwa pliku zmienia
// się przy każdej zmianie treści, (2) ostatnio odwiedzone strony — wyłącznie
// jako fallback, gdy telefon straci połączenie.

const CACHE_NAME = "derclinic-shell-v1";
const OFFLINE_FALLBACK_URL = "/panel-klienta";

// Strony pracowników (panel admina/specjalisty, konto, logowanie) zawierają dane pacjentów i
// kont — nie zapisujemy ich w cache i nie podstawiamy dla nich panelu klienta po utracie sieci.
function isStaffPath(pathname) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/specialist") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/login")
  );
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Statyczne zasoby builda i ikony — cache-first (bezpieczne, hashowane nazwy).
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // Nawigacje (otwarcie/odświeżenie strony) — zawsze najpierw sieć; offline
  // pokazujemy ostatnią zapisaną wersję TEJ strony, a w ostateczności powłokę
  // panelu klienta zamiast pustego błędu przeglądarki.
  if (request.mode === "navigate") {
    if (isStaffPath(url.pathname)) return; // zawsze sieć, bez cache'u
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(request)) || (await cache.match(OFFLINE_FALLBACK_URL)) || Response.error();
        }),
    );
    return;
  }

  // Wszystko inne (API, dane) — zawsze świeżo z sieci, bez cache'owania.
});

// --- Powiadomienia push ------------------------------------------------------
// Serwer (lib/push.ts) wysyła JSON { title, body, url, tag }. Ten sam plik
// obsługuje klientów (zakres "/") i personel (osobny zakres bez żadnych stron,
// patrz components/push-toggle.tsx).

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "DerClinic";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/panel-klienta" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Jeśli aplikacja jest już otwarta — przechodzimy w niej pod właściwy adres.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          if ("navigate" in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
