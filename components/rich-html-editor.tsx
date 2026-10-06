"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Edytor treści wiadomości w stylu WordPressa: przełącznik „Wizualny / Kod".
//  * Wizualny — edycja w ramce iframe (designMode) z paskiem narzędzi,
//  * Kod — zwykłe pole z surowym HTML.
// Ramka ma sandbox bez skryptów (tylko allow-same-origin, żeby panel mógł
// sterować edycją), więc wklejony HTML nie wykona kodu w panelu admina.

const FRAME_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
         font-size: 15px; line-height: 1.6; color: #3f3f46; margin: 0; padding: 16px; min-height: 240px; }
  img { max-width: 100%; height: auto; }
  a { color: #059669; }
  blockquote { border-left: 3px solid #d4d4d8; margin: 12px 0; padding: 2px 14px; color: #52525b; }
  h1, h2, h3 { color: #18181b; line-height: 1.3; }
  table { border-collapse: collapse; } td, th { border: 1px solid #e4e4e7; padding: 6px 10px; }
`;

type Mode = "visual" | "code";

type ToolbarButton = {
  label: string;
  title: string;
  run: (doc: Document) => void;
  className?: string;
};

const exec = (doc: Document, command: string, value?: string) => {
  doc.execCommand(command, false, value);
};

export function RichHtmlEditor({
  value,
  onChange,
  minHeight = 320,
}: {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
}) {
  const [mode, setMode] = React.useState<Mode>("visual");
  const frameRef = React.useRef<HTMLIFrameElement | null>(null);
  // Najnowsza wartość dla zdarzeń ramki, które powstają poza cyklem renderowania.
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const getDoc = () => frameRef.current?.contentDocument ?? null;

  // Okno „Wstaw link / obraz" w aplikacji (zamiast okienka przeglądarki).
  // Zaznaczenie z edytora zapamiętujemy przed otwarciem okna, bo fokus je gubi.
  const [insertDialog, setInsertDialog] = React.useState<null | "link" | "image">(null);
  const [insertUrl, setInsertUrl] = React.useState("");
  const [insertText, setInsertText] = React.useState("");
  const savedRange = React.useRef<Range | null>(null);

  function openInsertDialog(kind: "link" | "image") {
    const doc = getDoc();
    const selection = doc?.getSelection();
    savedRange.current = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    setInsertUrl("");
    setInsertText(kind === "link" ? (selection?.toString() ?? "") : "");
    setInsertDialog(kind);
  }

  function confirmInsert() {
    const doc = getDoc();
    const url = insertUrl.trim();
    if (!doc || !url || !insertDialog) return;
    const safeUrl = /^(https?:\/\/|mailto:|tel:|\/)/i.test(url) ? url : `https://${url}`;
    const esc = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    frameRef.current?.contentWindow?.focus();
    const selection = doc.getSelection();
    if (selection && savedRange.current) {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
    if (insertDialog === "image") {
      exec(doc, "insertHTML", `<img src="${esc(safeUrl)}" alt="${esc(insertText.trim())}" style="max-width:100%;height:auto;">`);
    } else if (selection && !selection.isCollapsed && !insertText.trim()) {
      exec(doc, "createLink", safeUrl);
    } else {
      const label = insertText.trim() || safeUrl;
      exec(doc, "insertHTML", `<a href="${esc(safeUrl)}">${esc(label)}</a>`);
    }
    onChange(doc.body.innerHTML);
    setInsertDialog(null);
  }

  // Ramka (po załadowaniu) dostaje aktualną treść i włącza edycję.
  const initFrame = React.useCallback(() => {
    const doc = getDoc();
    if (!doc) return;
    doc.designMode = "on";
    doc.body.innerHTML = valueRef.current;
    const emit = () => onChangeRef.current(doc.body.innerHTML);
    doc.addEventListener("input", emit);
    doc.addEventListener("keyup", emit);
  }, []);

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (mode === "visual") {
      const doc = getDoc();
      if (doc) onChange(doc.body.innerHTML);
    }
    setMode(next);
  }

  const buttons: (ToolbarButton | "sep")[] = [
    { label: "B", title: "Pogrubienie", run: (d) => exec(d, "bold"), className: "font-bold" },
    { label: "I", title: "Kursywa", run: (d) => exec(d, "italic"), className: "italic" },
    { label: "U", title: "Podkreślenie", run: (d) => exec(d, "underline"), className: "underline" },
    { label: "S", title: "Przekreślenie", run: (d) => exec(d, "strikeThrough"), className: "line-through" },
    "sep",
    { label: "• Lista", title: "Lista punktowana", run: (d) => exec(d, "insertUnorderedList") },
    { label: "1. Lista", title: "Lista numerowana", run: (d) => exec(d, "insertOrderedList") },
    { label: "❝", title: "Cytat", run: (d) => exec(d, "formatBlock", "blockquote") },
    "sep",
    { label: "⬅", title: "Do lewej", run: (d) => exec(d, "justifyLeft") },
    { label: "⬌", title: "Wyśrodkuj", run: (d) => exec(d, "justifyCenter") },
    { label: "➡", title: "Do prawej", run: (d) => exec(d, "justifyRight") },
    "sep",
    { label: "Link", title: "Wstaw link", run: () => openInsertDialog("link") },
    { label: "Bez linku", title: "Usuń link", run: (d) => exec(d, "unlink") },
    { label: "Obraz", title: "Wstaw obraz z adresu URL", run: () => openInsertDialog("image") },
    { label: "―", title: "Linia pozioma", run: (d) => exec(d, "insertHorizontalRule") },
    "sep",
    { label: "↶", title: "Cofnij", run: (d) => exec(d, "undo") },
    { label: "↷", title: "Ponów", run: (d) => exec(d, "redo") },
    { label: "Tx", title: "Wyczyść formatowanie", run: (d) => exec(d, "removeFormat") },
  ];

  function run(action: (doc: Document) => void) {
    const doc = getDoc();
    if (!doc) return;
    frameRef.current?.contentWindow?.focus();
    action(doc);
    onChange(doc.body.innerHTML);
  }

  function setBlock(tag: string) {
    run((doc) => exec(doc, "formatBlock", tag));
  }

  const tabClass = (active: boolean) =>
    "px-4 py-2 text-sm font-medium transition " +
    (active
      ? "border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-300"
      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200");

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#0b1220]">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10">
        <div className="flex">
          <button type="button" className={tabClass(mode === "visual")} onClick={() => switchMode("visual")}>
            Wizualny
          </button>
          <button type="button" className={tabClass(mode === "code")} onClick={() => switchMode("code")}>
            Kod
          </button>
        </div>
        <div className="pr-4 text-xs text-slate-400">{mode === "visual" ? "Edytor wizualny" : "Edytor HTML"}</div>
      </div>

      {mode === "visual" ? (
        <>
          <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2 dark:border-white/10 dark:bg-white/5">
            <select
              aria-label="Styl akapitu"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) setBlock(e.target.value);
                e.target.value = "";
              }}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-[#0b1220]"
            >
              <option value="">Akapit…</option>
              <option value="p">Akapit</option>
              <option value="h1">Nagłówek 1</option>
              <option value="h2">Nagłówek 2</option>
              <option value="h3">Nagłówek 3</option>
            </select>
            {buttons.map((button, index) =>
              button === "sep" ? (
                <span key={`sep-${index}`} className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/10" />
              ) : (
                <button
                  key={button.title}
                  type="button"
                  title={button.title}
                  aria-label={button.title}
                  // mouseDown + preventDefault: kliknięcie nie odbiera fokusu edytorowi, więc zaznaczenie zostaje.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    run(button.run);
                  }}
                  className={
                    "h-8 min-w-8 rounded-lg border border-transparent px-2 text-xs text-slate-700 transition hover:border-slate-200 hover:bg-white dark:text-slate-200 dark:hover:border-white/10 dark:hover:bg-white/10 " +
                    (button.className ?? "")
                  }
                >
                  {button.label}
                </button>
              ),
            )}
            <label className="ml-1 flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-slate-700 dark:text-slate-200">
              Kolor
              <input
                type="color"
                defaultValue="#059669"
                onChange={(e) => run((doc) => exec(doc, "foreColor", e.target.value))}
                className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                aria-label="Kolor tekstu"
              />
            </label>
          </div>
          <iframe
            ref={frameRef}
            title="Edytor wiadomości"
            sandbox="allow-same-origin"
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>${FRAME_CSS}</style></head><body></body></html>`}
            onLoad={initFrame}
            style={{ height: minHeight }}
            className="block w-full bg-white"
          />
        </>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          style={{ height: minHeight + 44 }}
          className="block w-full resize-y bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100 outline-none"
          placeholder="<p>Treść wiadomości w HTML…</p>"
        />
      )}

      <Dialog open={insertDialog !== null} onOpenChange={(open) => (!open ? setInsertDialog(null) : undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{insertDialog === "image" ? "Wstaw obraz" : "Wstaw link"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              confirmInsert();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="insert-url">{insertDialog === "image" ? "Adres obrazu (URL)" : "Adres linku"}</Label>
              <Input
                id="insert-url"
                value={insertUrl}
                onChange={(e) => setInsertUrl(e.target.value)}
                placeholder="https://…"
                autoFocus
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="insert-text">
                {insertDialog === "image" ? "Opis obrazu (opcjonalnie)" : "Tekst linku (opcjonalnie)"}
              </Label>
              <Input
                id="insert-text"
                value={insertText}
                onChange={(e) => setInsertText(e.target.value)}
                placeholder={insertDialog === "image" ? "np. Zdjęcie zabiegu" : "np. Umów wizytę"}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInsertDialog(null)}>
                Anuluj
              </Button>
              <Button type="submit" disabled={!insertUrl.trim()}>
                Wstaw
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
