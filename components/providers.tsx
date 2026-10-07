"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/components/auth-provider";
import { SecurityFetchProvider } from "@/components/security-fetch";
import { ConfirmProvider } from "@/components/confirm-provider";

// Panel klienta i rezerwacja online mają tylko jasny wygląd (nie używają klas
// "dark:"). Bez wymuszenia jasnego motywu u osoby z ciemnym motywem systemu
// lub przeglądarki <html> dostawał klasę "dark" i ciemny color-scheme, przez
// co np. rozwijane listy miały biały tekst na białym tle.
const LIGHT_ONLY_PREFIXES = ["/panel-klienta", "/book", "/zgoda", "/platnosc", "/newsletter"];

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  const pathname = usePathname() ?? "";
  const lightOnly = LIGHT_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  return (
    <SecurityFetchProvider>
      <AuthProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          forcedTheme={lightOnly ? "light" : undefined}
          nonce={nonce}
        >
          <ConfirmProvider>{children}</ConfirmProvider>
        </ThemeProvider>
      </AuthProvider>
    </SecurityFetchProvider>
  );
}
