import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/app-shell";
import { PwaRegister } from "@/components/pwa-register";

// Panel pracowników jako aplikacja na telefonie (PWA): własny manifest (nazwa, adres startowy
// "/" — a ten kieruje do właściwego ekranu roli), tryb pełnoekranowy na iPhonie i
// viewport-fit=cover, żeby layout mógł uwzględnić wcięcie ekranu i "kreskę" home.
export const metadata: Metadata = {
  manifest: "/manifest-staff.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DerClinic Panel",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png" }],
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef3f7" },
    { media: "(prefers-color-scheme: dark)", color: "#070b13" },
  ],
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PwaRegister />
      <AppShell>{children}</AppShell>
    </>
  );
}
