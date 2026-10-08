"use client";

import * as React from "react";

// Akcja wybrana w globalnym oknie skanera (sprzedaż albo jedna z akcji magazynowych),
// przekazywana do strony, która ją wykona. Gdy ta strona jest już otwarta, dostaje
// zdarzenie; gdy dopiero się otwiera, odbiera akcję z sessionStorage po załadowaniu danych.

export type ScanAction = "sell" | "receive" | "remove" | "transfer" | "removeAll";
export type ScanIntent = { action: ScanAction; productId: string; code: string; at: number };

const STORAGE_KEY = "derclinic:scan-intent";
const EVENT_NAME = "derclinic:scan-intent";
// Akcja starsza niż minuta (np. przerwane przejście między stronami) przepada.
const MAX_AGE_MS = 60_000;

function readPending(): ScanIntent | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScanIntent) : null;
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // brak dostępu do sessionStorage — akcja i tak przepadnie po minucie
  }
}

export function publishScanIntent(action: ScanAction, productId: string, code: string) {
  const intent: ScanIntent = { action, productId, code, at: Date.now() };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // bez sessionStorage zadziała tylko zdarzenie na już otwartej stronie
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

/** Odbiera akcje podanych typów, gdy strona jest gotowa (ready) je wykonać. */
export function useScanIntent(actions: ScanAction[], ready: boolean, handler: (intent: ScanIntent) => void) {
  const handlerRef = React.useRef(handler);
  React.useEffect(() => {
    handlerRef.current = handler;
  });
  const actionsKey = actions.join(",");

  React.useEffect(() => {
    if (!ready) return;
    const accepted = actionsKey.split(",");
    const consume = () => {
      const intent = readPending();
      if (!intent || !accepted.includes(intent.action)) return;
      clearPending();
      if (Date.now() - intent.at > MAX_AGE_MS) return;
      handlerRef.current(intent);
    };
    consume();
    window.addEventListener(EVENT_NAME, consume);
    return () => window.removeEventListener(EVENT_NAME, consume);
  }, [actionsKey, ready]);
}
