"use client";

import * as React from "react";

// Czytnik kodów działa jak klawiatura, ale wpisuje znaki znacznie szybciej niż człowiek.
// Seria co najmniej SCAN_MIN_LENGTH znaków z odstępami poniżej SCAN_MAX_GAP_MS to skan;
// jeśli czytnik nie wysyła Entera, kończymy skan po SCAN_IDLE_MS ciszy.
export const SCAN_MAX_GAP_MS = 50;
export const SCAN_MIN_LENGTH = 8;
export const SCAN_IDLE_MS = 150;

/**
 * Obsługa pola, do którego wpisuje czytnik kodów: Enter albo krótka cisza po szybkiej
 * serii znaków wywołuje onSubmit z wpisanym tekstem. Zwraca handlery dla <Input>.
 */
export function useScannerInput(onSubmit: (value: string) => void) {
  const stateRef = React.useRef({ lastAt: 0, fastCount: 0, timer: 0 });
  const submitRef = React.useRef(onSubmit);
  React.useEffect(() => {
    submitRef.current = onSubmit;
  });
  React.useEffect(() => {
    const state = stateRef.current;
    return () => window.clearTimeout(state.timer);
  }, []);

  const trackChange = React.useCallback((value: string) => {
    const state = stateRef.current;
    const now = Date.now();
    state.fastCount = now - state.lastAt < SCAN_MAX_GAP_MS ? state.fastCount + 1 : 1;
    state.lastAt = now;
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      if (state.fastCount >= SCAN_MIN_LENGTH && value.trim()) {
        state.fastCount = 0;
        submitRef.current(value);
      }
    }, SCAN_IDLE_MS);
  }, []);

  const onKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const state = stateRef.current;
    window.clearTimeout(state.timer);
    state.fastCount = 0;
    const value = event.currentTarget.value;
    if (value.trim()) submitRef.current(value);
  }, []);

  return { trackChange, onKeyDown };
}
