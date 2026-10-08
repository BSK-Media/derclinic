// Pobieranie pliku z aplikacji (także zainstalowanej jako PWA na iPhonie).
// Zwykły link do PDF-a w trybie standalone otwiera dokument w podglądzie bez
// możliwości powrotu, zamiast go pobrać. Dlatego plik pobieramy przez fetch i:
//  * na telefonie z obsługą udostępniania plików — otwieramy arkusz udostępniania
//    ("Zapisz w Plikach", AirDrop, Poczta…),
//  * w pozostałych przypadkach — wymuszamy pobranie linkiem z atrybutem download.
export async function downloadFile(url: string, fallbackName: string): Promise<{ ok: boolean; message?: string }> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    return { ok: false, message: "Nie udało się połączyć z serwerem." };
  }
  if (!response.ok) {
    const out = await response.json().catch(() => null);
    return { ok: false, message: out?.message || "Nie udało się pobrać pliku." };
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const name = /filename="?([^";]+)"?/i.exec(disposition)?.[1] || fallbackName;
  const blob = await response.blob();
  const file = new File([blob], name, { type: blob.type || "application/pdf" });

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const isTouchDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isTouchDevice && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return { ok: true };
    } catch (error) {
      // Zamknięcie arkusza przez użytkownika nie jest błędem.
      if (error instanceof DOMException && error.name === "AbortError") return { ok: true };
      // Inny błąd udostępniania: próbujemy zwykłego pobrania poniżej.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return { ok: true };
}
