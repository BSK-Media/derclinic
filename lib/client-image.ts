// Przygotowanie zdjęcia w przeglądarce przed wysłaniem na serwer: duże zdjęcia
// z telefonu (kilka MB) zmniejszamy do rozsądnych rozmiarów do maila.
// Tylko kod kliencki (canvas) — nie importować po stronie serwera.

const MAX_SIDE = 1600;
// Poniżej tego rozmiaru wysyłamy plik bez zmian (zachowuje przezroczystość PNG i animacje GIF).
const KEEP_AS_IS_BYTES = 1.2 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nie udało się odczytać zdjęcia."));
    };
    img.src = url;
  });
}

export async function prepareImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("To nie jest plik ze zdjęciem.");
  if (file.size <= KEEP_AS_IS_BYTES) return file;

  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  // Białe tło — JPEG nie ma przezroczystości.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return file;
  const name = file.name.replace(/\.[^.]+$/, "") || "zdjecie";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
}
