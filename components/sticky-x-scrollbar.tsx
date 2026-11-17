"use client";

import * as React from "react";
import { horizontalScroller } from "@/components/drag-scroll";

// Poziomy suwak przyklejony do dołu okna dla szerokich tabel. Natywny suwak leży pod całą tabelą, więc w długiej liście
// trzeba zjechać na sam dół, żeby go zobaczyć. Gdy tabela jest szersza niż ekran, a jej dolna krawędź jest poza oknem,
// pokazujemy dodatkowy suwak na dole ekranu, zsynchronizowany z tabelą. Przeciąganie myszką po tabeli dalej działa.

type Target = { el: HTMLElement; left: number; width: number; scrollWidth: number };

function findTarget(): Target | null {
  // Pod otwartym oknem dialogowym suwak nie jest potrzebny.
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return null;
  const viewportHeight = window.innerHeight;
  for (const table of Array.from(document.querySelectorAll("table"))) {
    const el = horizontalScroller(table);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 80) continue;
    // Dolna krawędź (z natywnym suwakiem) poza oknem, a góra tabeli jeszcze widoczna.
    if (rect.bottom > viewportHeight - 2 && rect.top < viewportHeight - 120) {
      return { el, left: rect.left, width: rect.width, scrollWidth: el.scrollWidth };
    }
  }
  return null;
}

export function StickyXScrollbar() {
  const [target, setTarget] = React.useState<Target | null>(null);
  const barRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    // Tylko na urządzeniach z myszką — dotyk ma własne, natywne przewijanie.
    if (!window.matchMedia("(hover: hover)").matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = findTarget();
      setTarget((current) => {
        if (!next || !current) return next ?? null;
        return current.el === next.el &&
          Math.abs(current.left - next.left) < 1 &&
          Math.abs(current.width - next.width) < 1 &&
          current.scrollWidth === next.scrollWidth
          ? current
          : next;
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      observer.disconnect();
    };
  }, []);

  // Synchronizacja położenia: tabela → suwak (przeciąganie myszką, kółko, klawiatura).
  const el = target?.el ?? null;
  React.useEffect(() => {
    if (!el) return;
    const bar = barRef.current;
    if (bar) bar.scrollLeft = el.scrollLeft;
    const onScroll = () => {
      const current = barRef.current;
      if (current && Math.abs(current.scrollLeft - el.scrollLeft) > 1) current.scrollLeft = el.scrollLeft;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [el]);

  if (!target) return null;

  return (
    <div
      ref={barRef}
      onScroll={(event) => {
        const bar = event.currentTarget;
        if (Math.abs(target.el.scrollLeft - bar.scrollLeft) > 1) target.el.scrollLeft = bar.scrollLeft;
      }}
      className="fixed bottom-0 z-40 overflow-x-scroll overflow-y-hidden border-t border-slate-200 bg-white/95 shadow-[0_-4px_10px_-6px_rgba(0,0,0,0.25)] dark:border-white/10 dark:bg-zinc-950/95"
      style={{ left: target.left, width: target.width, height: 18 }}
      aria-hidden
      data-no-drag-scroll
    >
      <div style={{ width: target.scrollWidth, height: 1 }} />
    </div>
  );
}
