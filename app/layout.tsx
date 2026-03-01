import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = { title: "DerClinic OS" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body>
        <Providers>
          {children}
          <Toaster richColors />
        </Providers>
      </body>
    </html>
  );
}
