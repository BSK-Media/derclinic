import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa-register";

// Strona zgody na zabieg jest częścią "podróży klienta" (otwierana z panelu klienta w
// zainstalowanej PWA), więc ma te same ustawienia ekranu co panel klienta i rezerwacja
// (app/panel-klienta/layout.tsx): viewport-fit=cover, bez niego dolna nawigacja na iPhonie
// ma inne marginesy bezpieczne i "zjeżdża" niżej niż na pozostałych ekranach.
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
  themeColor: "#7C3AED",
  viewportFit: "cover",
  colorScheme: "only light",
};

export default function ZgodaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PwaRegister />
      <div data-light-only className="contents">
        {children}
      </div>
    </>
  );
}
