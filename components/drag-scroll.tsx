"use client";

import * as React from "react";

// Przewijanie poziome przeciąganiem myszką: w szerokich listach i tabelach (zabiegi, wizyty, produkty…)
// wystarczy chwycić puste miejsce i przeciągnąć w lewo lub w prawo — bez zjeżdżania na dół do suwaka.
// Działa globalnie dla każdego elementu, który faktycznie ma poziome przewijanie. Dotyk ma własne,
// natywne przewijanie, więc tutaj obsługujemy tylko mysz.

// Elementy, na których przeciąganie ma robić swoje (pola, przyciski, linki, przeciąganie wizyt w kalendarzu…).
const INTERACTIVE =
  'input, textarea, select, button, a[href], label, summary, [role="button"], [role="slider"], [role="combobox"], [role="option"], [role="menuitem"], [contenteditable="true"], [draggable="true"], [data-no-drag-scroll], video, audio, canvas';

const DRAG_THRESHOLD = 5;

function horizontalScroller(start: HTMLElement | null): HTMLElement | null {
  let node = start;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflowX = window.getComputedStyle(node).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Czy wskaźnik jest dokładnie nad znakami tekstu? Wtedy przeciąganie ma zaznaczać tekst (np. EAN, nazwę),
 * a nie przewijać listę — przewijamy dopiero po chwyceniu pustego miejsca (tło, odstępy, marginesy komórek).
 */
function pointIsOverText(x: number, y: number): boolean {
  let node: Node | null = null;
  let offset = 0;
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(x, y);
    if (position) {
      node = position.offsetNode;
      offset = position.offset;
    }
  } else if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;
  const text = node.textContent ?? "";
  const length = text.length;
  if (length === 0) return false;
  const probe = document.createRange();
  // Znak tuż przed i tuż za pozycją kursora — jeden z nich leży pod wskaźnikiem, jeśli klikamy w tekst.
  const candidates: Array<[number, number]> = [
    [Math.max(0, offset - 1), Math.min(length, offset)],
    [Math.min(offset, length - 1), Math.min(length, offset + 1)],
  ];
  for (const [start, end] of candidates) {
    if (start >= end || /^\s$/.test(text.slice(start, end))) continue;
    probe.setStart(node, start);
    probe.setEnd(node, end);
    for (const rect of Array.from(probe.getClientRects())) {
      if (x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1) return true;
    }
  }
  return false;
}

export function DragScroll() {
  React.useEffect(() => {
    let state: {
      container: HTMLElement;
      startX: number;
      startScroll: number;
      dragging: boolean;
      pointerId: number;
    } | null = null;

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (!target || !(target instanceof HTMLElement)) return;
      if (target.closest(INTERACTIVE)) return;
      // Chwycenie samego tekstu = zaznaczanie tekstu (np. skopiowanie EAN), nie przewijanie.
      if (pointIsOverText(event.clientX, event.clientY)) return;
      const container = horizontalScroller(target);
      if (!container) return;
      state = {
        container,
        startX: event.clientX,
        startScroll: container.scrollLeft,
        dragging: false,
        pointerId: event.pointerId,
      };
    }

    function onPointerMove(event: PointerEvent) {
      if (!state || event.pointerId !== state.pointerId) return;
      // Przycisk puszczony poza oknem — kończymy przeciąganie.
      if ((event.buttons & 1) === 0) {
        finish();
        return;
      }
      const dx = event.clientX - state.startX;
      if (!state.dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        state.dragging = true;
        document.body.classList.add("drag-scrolling");
        window.getSelection()?.removeAllRanges();
      }
      state.container.scrollLeft = state.startScroll - dx;
      event.preventDefault();
    }

    function suppressClick(event: MouseEvent) {
      event.stopPropagation();
      event.preventDefault();
    }

    function finish() {
      if (!state) return;
      const wasDragging = state.dragging;
      state = null;
      document.body.classList.remove("drag-scrolling");
      if (wasDragging) {
        // Puszczenie przycisku po przeciągnięciu nie ma otwierać wiersza ani innych kliknięć.
        document.addEventListener("click", suppressClick, { capture: true, once: true });
        window.setTimeout(() => document.removeEventListener("click", suppressClick, true), 0);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      document.body.classList.remove("drag-scrolling");
    };
  }, []);

  return null;
}
