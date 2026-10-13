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
