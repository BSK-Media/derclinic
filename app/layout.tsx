import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = { title: "DerClinic OS" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce z Content-Security-Policy (proxy.ts). Odczyt nagłówków sprawia, że
  // strony renderują się dynamicznie — to wymóg CSP opartej o nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="pl" suppressHydrationWarning>
      <body>
        <Providers nonce={nonce}>
          {children}
          <Toaster richColors />
        </Providers>
      </body>
    </html>
  );
}
