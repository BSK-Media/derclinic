import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa-register";

// PWA (patrz public/manifest.webmanifest, public/sw.js) obejmuje wyłącznie
// panel klienta i rezerwację online (ten layout + app/book/layout.tsx) —
// panel admina i strona publiczna go nie dziedziczą, bo nie eksportują
// manifest/appleWebApp i nigdy nie renderują <PwaRegister />.
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

export default function PanelKlientaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PwaRegister />
      {children}
    </>
  );
}
