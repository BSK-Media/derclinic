"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      // W tej wersji Button (shadcn) nie ma rozmiaru "icon",
      // więc wymuszamy go klasami.
      size="sm"
      className="h-9 w-9 p-0"
      aria-label={isDark ? "Przełącz na jasny motyw" : "Przełącz na ciemny motyw"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
