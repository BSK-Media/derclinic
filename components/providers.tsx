"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/components/auth-provider";
import { SecurityFetchProvider } from "@/components/security-fetch";

export function Providers({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <SecurityFetchProvider>
      <AuthProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
          {children}
        </ThemeProvider>
      </AuthProvider>
    </SecurityFetchProvider>
  );
}
