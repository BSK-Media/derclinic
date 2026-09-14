"use client";

import * as React from "react";

// Rejestruje public/sw.js z zasięgiem (scope) całej witryny, żeby jeden
// Service Worker obsługiwał zarówno /panel-klienta jak i /book — to
// jedyne dwa miejsca renderujące ten komponent (patrz ich layout.tsx).
// Panel admina i strona publiczna nigdy tego nie robią, więc dla nich PWA
// faktycznie nie istnieje, mimo że sam plik sw.js technicznie leży w /public.
export function PwaRegister() {
  React.useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Cicho ignorujemy — brak wsparcia przeglądarki nie może wywalić appki,
      // po prostu nie zadziała tryb PWA/offline.
    });
  }, []);

  return null;
}
