"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Slot = "BEFORE" | "AFTER";

type Props = {
  appointmentId: string;
  photoBefore?: string | null;
  photoAfter?: string | null;
  onChanged?: () => void;
  readOnly?: boolean;
};

const MAX_DATA_URL_LENGTH = 2_500_000; // ~1.8 MB obrazu po base64

/** Kompresja zdjęcia w przeglądarce: skalowanie do max 1600px i JPEG. */
async function compressImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Nie udało się odczytać pliku"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Nie udało się wczytać zdjęcia"));
    el.src = dataUrl;
  });

  const MAX_DIM = 1600;
  let { width, height } = img;
  if (width > MAX_DIM || height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Brak wsparcia canvas");
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.85;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > MAX_DATA_URL_LENGTH && quality > 0.4) {
    quality -= 0.1;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  if (out.length > MAX_DATA_URL_LENGTH) {
    throw new Error("Zdjęcie jest zbyt duże — spróbuj mniejszego pliku");
  }
  return out;
}

function CameraDialog({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => setError("Brak dostępu do aparatu. Sprawdź uprawnienia przeglądarki."));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    const MAX_DIM = 1600;
    let { videoWidth: w, videoHeight: h } = video;
    if (w > MAX_DIM || h > MAX_DIM) {
      const scale = MAX_DIM / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    onCapture(canvas.toDataURL("image/jpeg", 0.85));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b p-3 dark:border-zinc-800">
          <div className="text-sm font-medium">Zrób zdjęcie</div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="bg-black">
          {error ? (
            <div className="p-6 text-center text-sm text-red-400">{error}</div>
          ) : (
            <video ref={videoRef} playsInline muted className="max-h-[60vh] w-full object-contain" />
          )}
        </div>
        <div className="flex justify-center gap-2 p-3">
          <Button onClick={takePhoto} disabled={!!error}>
            <Camera className="mr-2 h-4 w-4" />
            Zrób zdjęcie
          </Button>
        </div>
      </div>
    </div>
  );
}

function PhotoSlot({
  appointmentId,
  slot,
  label,
  photo,
  onChanged,
  readOnly,
}: {
  appointmentId: string;
  slot: Slot;
  label: string;
  photo?: string | null;
  onChanged?: () => void;
  readOnly?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [preview, setPreview] = useState(false);

  async function saveImage(image: string | null) {
    setBusy(true);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/photos`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slot, image }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) {
        toast.error(out?.message || "Nie udało się zapisać zdjęcia");
        return;
      }
      toast.success(image ? "Zdjęcie zapisane" : "Zdjęcie usunięte");
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Wybierz plik graficzny (JPG, PNG, WEBP)");
      return;
    }
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      await saveImage(compressed);
    } catch (e: any) {
      toast.error(e?.message || "Nie udało się przetworzyć zdjęcia");
      setBusy(false);
    }
  }

  function openCamera() {
    // Na urządzeniach mobilnych natywny aparat (input capture) działa najlepiej;
    // na desktopie otwieramy podgląd z kamery (getUserMedia).
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && captureInputRef.current) {
      captureInputRef.current.click();
      return;
    }
    if (navigator.mediaDevices?.getUserMedia) {
      setCameraOpen(true);
    } else if (captureInputRef.current) {
      captureInputRef.current.click();
    } else {
      toast.error("Aparat nie jest dostępny w tej przeglądarce");
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">{label}</div>
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-dashed bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
        {photo ? (
          <button
            type="button"
            className="h-full w-full cursor-zoom-in"
            onClick={() => setPreview(true)}
            title="Kliknij, aby powiększyć"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt={label} className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="flex flex-col items-center gap-1 text-zinc-400">
            <ImagePlus className="h-8 w-8" />
            <span className="text-xs">Brak zdjęcia</span>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-sm dark:bg-black/50">
            Zapisywanie…
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            Wgraj zdjęcie
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={openCamera}>
            <Camera className="mr-2 h-4 w-4" />
            Zrób zdjęcie
          </Button>
          {photo && (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600"
              disabled={busy}
              onClick={() => saveImage(null)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Usuń
            </Button>
          )}
        </div>
      )}

      {/* Wybór z galerii / dysku */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {/* Natywny aparat na telefonie */}
      <input
        ref={captureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <CameraDialog
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl) => saveImage(dataUrl)}
      />

      {preview && photo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt={label} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}

export function AppointmentPhotos({
  appointmentId,
  photoBefore,
  photoAfter,
  onChanged,
  readOnly,
}: Props) {
  return (
    <Card className="space-y-4 p-4">
      <div>
        <div className="font-medium">Zdjęcia przed i po</div>
        <div className="text-sm text-zinc-500">
          Dokumentacja zabiegu — zdjęcie przed i po wykonaniu procedury.
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <PhotoSlot
          appointmentId={appointmentId}
          slot="BEFORE"
          label="Zdjęcie przed zabiegiem"
          photo={photoBefore}
          onChanged={onChanged}
          readOnly={readOnly}
        />
        <PhotoSlot
          appointmentId={appointmentId}
          slot="AFTER"
          label="Zdjęcie po zabiegu"
          photo={photoAfter}
          onChanged={onChanged}
          readOnly={readOnly}
        />
      </div>
    </Card>
  );
}
