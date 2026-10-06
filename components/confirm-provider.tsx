"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Wspólne okno potwierdzenia w aplikacji — zamiast okienka przeglądarki
// (window.confirm). Użycie:
//
//   const confirm = useConfirm();
//   if (!(await confirm({ message: "Usunąć konto?", destructive: true }))) return;
//
// Zamiast obiektu można podać samą treść (string). Znaki nowej linii w treści są zachowane.

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Czerwony przycisk potwierdzenia — dla operacji nieodwracalnych.
  destructive?: boolean;
};

type ConfirmFn = (options: string | ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

type Pending = ConfirmOptions & { resolve: (value: boolean) => void };

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null);
  // Ref, bo zamknięcie okna (Esc, kliknięcie obok) ma zawsze rozstrzygnąć obietnicę.
  const pendingRef = React.useRef<Pending | null>(null);
  pendingRef.current = pending;

  const confirm = React.useCallback<ConfirmFn>((options) => {
    const normalized: ConfirmOptions = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      // Gdyby poprzednie okno było jeszcze otwarte — uznajemy je za anulowane.
      pendingRef.current?.resolve(false);
      setPending({ ...normalized, resolve });
    });
  }, []);

  function close(result: boolean) {
    const current = pendingRef.current;
    setPending(null);
    current?.resolve(result);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(open) => (!open ? close(false) : undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pending?.title ?? "Potwierdź"}</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-300">{pending?.message}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {pending?.cancelLabel ?? "Anuluj"}
            </Button>
            <Button
              variant={pending?.destructive ? "destructive" : "default"}
              onClick={() => close(true)}
              autoFocus
            >
              {pending?.confirmLabel ?? "Potwierdź"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
