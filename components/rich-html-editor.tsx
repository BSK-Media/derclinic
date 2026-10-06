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
  a { color: #7C3AED; }
  blockquote { border-left: 3px solid #d4d4d8; margin: 12px 0; padding: 2px 14px; color: #52525b; }
  h1, h2, h3 { color: #18181b; line-height: 1.3; }
  table { border-collapse: collapse; } td, th { border: 1px solid #e4e4e7; padding: 6px 10px; }
`;

type Mode = "visual" | "code";

// Szerokość treści w wiadomości e-mail (kontener 600 px minus marginesy) —
// obraz nie powinien być szerszy, bo w poczcie i tak zostałby przycięty.
const EMAIL_CONTENT_WIDTH = 544;
const MIN_IMAGE_WIDTH = 24;

type Rect = { left: number; top: number; width: number; height: number };

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
  uploadImage,
}: {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
  // Wgrywa plik i zwraca publiczny adres obrazu. Gdy podany, okno „Wstaw obraz”
  // pozwala wybrać zdjęcie z dysku zamiast wpisywać adres.
  uploadImage?: (file: File) => Promise<string>;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState("");
  const [uploadedPreview, setUploadedPreview] = React.useState<string | null>(null);
  const [showUrlField, setShowUrlField] = React.useState(false);

  async function onPickFile(file: File | null) {
    if (!file || !uploadImage) return;
    setUploadError("");
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setInsertUrl(url);
      setUploadedPreview(url);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Nie udało się wgrać zdjęcia.");
    } finally {
      setUploading(false);
    }
  }
  const [mode, setMode] = React.useState<Mode>("visual");
  const frameRef = React.useRef<HTMLIFrameElement | null>(null);

  // Zaznaczony obraz: ramka z uchwytami do zmiany rozmiaru przeciąganiem (jak w
  // Outlooku) i małe menu z gotowymi rozmiarami. Nakładka jest elementem panelu,
  // nie treści wiadomości — nie trafia do wysyłanego HTML-a.
  const selectedImgRef = React.useRef<HTMLImageElement | null>(null);
  const [imgRect, setImgRect] = React.useState<Rect | null>(null);
  const dragRef = React.useRef<{ startX: number; startW: number; dir: 1 | -1 } | null>(null);

  const refreshRect = React.useCallback(() => {
    const img = selectedImgRef.current;
    if (!img || !img.isConnected) {
      selectedImgRef.current = null;
      setImgRect(null);
      return;
    }
    const r = img.getBoundingClientRect();
    setImgRect({ left: r.left, top: r.top, width: r.width, height: r.height });
  }, []);

  function selectImage(img: HTMLImageElement | null) {
    selectedImgRef.current = img;
    refreshRect();
  }

  function applyImageWidth(img: HTMLImageElement, width: number) {
    const w = Math.max(MIN_IMAGE_WIDTH, Math.min(EMAIL_CONTENT_WIDTH, Math.round(width)));
    img.style.width = `${w}px`;
    img.style.height = "auto";
    img.style.maxWidth = "100%";
    // Atrybut width, bo Outlook (desktop) ignoruje szerokość z CSS przy obrazach.
    img.setAttribute("width", String(w));
    img.removeAttribute("height");
    refreshRect();
  }

  function commitImageChange() {
    const doc = frameRef.current?.contentDocument;
    if (doc) onChangeRef.current(doc.body.innerHTML);
  }

  function startResize(e: React.PointerEvent<HTMLDivElement>, dir: 1 | -1) {
    const img = selectedImgRef.current;
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startW: img.getBoundingClientRect().width, dir };
  }

  function moveResize(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const img = selectedImgRef.current;
    if (!drag || !img) return;
    applyImageWidth(img, drag.startW + drag.dir * (e.clientX - drag.startX));
  }

  function endResize() {
    if (!dragRef.current) return;
    dragRef.current = null;
    commitImageChange();
  }

  function setImagePercent(percent: number) {
    const img = selectedImgRef.current;
    if (!img) return;
    applyImageWidth(img, (EMAIL_CONTENT_WIDTH * percent) / 100);
    commitImageChange();
  }

  function setImageOriginal() {
    const img = selectedImgRef.current;
    if (!img) return;
    applyImageWidth(img, img.naturalWidth || EMAIL_CONTENT_WIDTH);
    commitImageChange();
  }

  function removeSelectedImage() {
    const img = selectedImgRef.current;
    if (!img) return;
    img.remove();
    selectImage(null);
    commitImageChange();
  }
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
    setUploadedPreview(null);
    setUploadError("");
    setShowUrlField(false);
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
    selectedImgRef.current = null;
    setImgRect(null);
    const emit = () => {
      onChangeRef.current(doc.body.innerHTML);
      refreshRect();
    };
    doc.addEventListener("input", emit);
    doc.addEventListener("keyup", emit);
    // Kliknięcie w obraz zaznacza go (ramka + uchwyty), kliknięcie obok zdejmuje zaznaczenie.
    doc.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      selectImage(target && target.tagName === "IMG" ? (target as HTMLImageElement) : null);
    });
    doc.defaultView?.addEventListener("scroll", refreshRect);
    doc.defaultView?.addEventListener("resize", refreshRect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshRect]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (mode === "visual") {
      const doc = getDoc();
      if (doc) onChange(doc.body.innerHTML);
    }
    selectedImgRef.current = null;
    setImgRect(null);
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
                defaultValue="#7C3AED"
                onChange={(e) => run((doc) => exec(doc, "foreColor", e.target.value))}
                className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                aria-label="Kolor tekstu"
              />
            </label>
          </div>
          <div className="relative">
            <iframe
              ref={frameRef}
              title="Edytor wiadomości"
              sandbox="allow-same-origin"
              srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>${FRAME_CSS}</style></head><body></body></html>`}
              onLoad={initFrame}
              style={{ height: minHeight }}
              className="block w-full bg-white"
            />
            {imgRect ? (
              <div
                className="pointer-events-none absolute z-10 outline outline-2 outline-emerald-500"
                style={{ left: imgRect.left, top: imgRect.top, width: imgRect.width, height: imgRect.height }}
              >
                {(
                  [
                    { pos: "-left-1.5 -top-1.5 cursor-nwse-resize", dir: -1 },
                    { pos: "-right-1.5 -top-1.5 cursor-nesw-resize", dir: 1 },
                    { pos: "-bottom-1.5 -left-1.5 cursor-nesw-resize", dir: -1 },
                    { pos: "-bottom-1.5 -right-1.5 cursor-nwse-resize", dir: 1 },
                  ] as const
                ).map((handle) => (
                  <div
                    key={handle.pos}
                    onPointerDown={(e) => startResize(e, handle.dir)}
                    onPointerMove={moveResize}
                    onPointerUp={endResize}
                    onPointerCancel={endResize}
                    style={{ touchAction: "none" }}
                    className={`pointer-events-auto absolute h-3 w-3 rounded-sm border border-white bg-emerald-600 ${handle.pos}`}
                  />
                ))}
                <div
                  className="pointer-events-auto absolute left-0 flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-md dark:border-white/10 dark:bg-[#0b1220]"
                  style={imgRect.top < 44 ? { top: "100%", marginTop: 8 } : { bottom: "100%", marginBottom: 8 }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <span className="px-1 tabular-nums text-slate-500">{Math.round(imgRect.width)} px</span>
                  {[25, 50, 75, 100].map((percent) => (
                    <button
                      key={percent}
                      type="button"
                      onClick={() => setImagePercent(percent)}
                      className="rounded-md px-2 py-1 hover:bg-slate-100 dark:hover:bg-white/10"
                    >
                      {percent}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={setImageOriginal}
                    className="rounded-md px-2 py-1 hover:bg-slate-100 dark:hover:bg-white/10"
                  >
                    Oryginał
                  </button>
                  <button
                    type="button"
                    onClick={removeSelectedImage}
                    className="rounded-md px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    Usuń
                  </button>
                </div>
              </div>
            ) : null}
          </div>
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
            {insertDialog === "image" && uploadImage ? (
              <div className="space-y-2">
                <Label htmlFor="insert-file">Zdjęcie z dysku</Label>
                <label
                  htmlFor="insert-file"
                  className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-600 transition hover:bg-slate-100 dark:border-white/20 dark:bg-white/5 dark:text-slate-300"
                >
                  {uploadedPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={uploadedPreview} alt="Wgrane zdjęcie" className="max-h-40 rounded-lg object-contain" />
                  ) : null}
                  <span className="font-medium">
                    {uploading ? "Wgrywanie…" : uploadedPreview ? "Zmień zdjęcie" : "Kliknij, aby wybrać zdjęcie"}
                  </span>
                  <span className="text-xs text-slate-400">JPG, PNG, GIF lub WebP</span>
                </label>
                <input
                  id="insert-file"
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    void onPickFile(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
                {uploadError ? (
                  <p role="alert" className="text-xs text-red-600">
                    {uploadError}
                  </p>
                ) : null}
                {!showUrlField ? (
                  <button
                    type="button"
                    onClick={() => setShowUrlField(true)}
                    className="text-xs text-slate-500 underline underline-offset-2"
                  >
                    albo wpisz adres obrazu
                  </button>
                ) : null}
              </div>
            ) : null}
            {insertDialog !== "image" || !uploadImage || showUrlField ? (
              <div className="space-y-1">
                <Label htmlFor="insert-url">{insertDialog === "image" ? "Adres obrazu (URL)" : "Adres linku"}</Label>
                <Input
                  id="insert-url"
                  value={insertUrl}
                  onChange={(e) => setInsertUrl(e.target.value)}
                  placeholder="https://…"
                  autoFocus={insertDialog !== "image" || !uploadImage}
                  autoComplete="off"
                />
              </div>
            ) : null}
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
              <Button type="submit" disabled={!insertUrl.trim() || uploading}>
                Wstaw
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
