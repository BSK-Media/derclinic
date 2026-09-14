import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa-register";

// app/book/page.tsx jest komponentem klienckim ("use client"), więc metadata
// nie może być eksportowana bezpośrednio z niego — stąd ten mały layout
// serwerowy. Ta sama PWA co panel klienta (patrz app/panel-klienta/layout.tsx
// po pełny komentarz o zasięgu) — rezerwacja jest częścią tej samej "podróży
// klienta" i ma zostać w zainstalowanej aplikacji, a nie otwierać przeglądarkę.
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DerClinic",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  viewportFit: "cover",
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PwaRegister />
      {children}
    </>
  );
}
