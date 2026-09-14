// Jednorazowy (ale bezpieczny do ponownego uruchomienia) generator ikon PWA
// panelu klienta z logo DerClinic. Uruchom po podmianie public/derclinic-logo.webp
// na nowy branding: `node scripts/generate-pwa-icons.mjs`.
//
// Logo (public/derclinic-logo.webp) wypełnia swój kanwas krawędź-do-krawędzi
// (bez marginesu) i jest zaprojektowane pod białe tło — tak samo prezentuje
// się już wszędzie indziej w aplikacji (sidebar panelu klienta, ekrany
// logowania). Trzymamy się tego samego, sprawdzonego zestawienia kolorów
// zamiast wymyślać nowe tło.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "public/derclinic-logo.webp";
const OUT_DIR = "public/icons";
const BACKGROUND = "#ffffff";

mkdirSync(OUT_DIR, { recursive: true });

async function squareIcon({ size, paddingRatio, outFile }) {
  const contentSize = Math.round(size * (1 - paddingRatio * 2));
  const pad = Math.round((size - contentSize) / 2);

  // WAŻNE: dwa .resize() w jednym, niematerializowanym łańcuchu sharp dają
  // błędny (za duży) wynik — sharp najwyraźniej nie obsługuje poprawnie
  // drugiego resize() dopóki pierwszy pipeline nie zostanie faktycznie
  // wykonany. Stąd materializacja przez .toBuffer() między krokami: to
  // faktycznie zmieniało deklarowany rozmiar ikon (np. 192x192 w manifeście
  // vs 216x216 w pliku), co samo w sobie wystarczyło, żeby Chrome uznał
  // stronę za niemożliwą do zainstalowania — bez żadnego komunikatu.
  const { data: padded } = await sharp(SRC)
    .resize(contentSize, contentSize, { fit: "contain", background: BACKGROUND })
    .flatten({ background: BACKGROUND })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: BACKGROUND })
    .toBuffer({ resolveWithObject: true });

  await sharp(padded).resize(size, size, { fit: "cover" }).png().toFile(`${OUT_DIR}/${outFile}`);

  console.log(`✓ ${OUT_DIR}/${outFile} (${size}x${size}, padding ${Math.round(paddingRatio * 100)}%)`);
}

async function main() {
  // "any" — pełny kanwas, minimalny margines (logo już ma swój oddech).
  await squareIcon({ size: 192, paddingRatio: 0.06, outFile: "icon-192.png" });
  await squareIcon({ size: 512, paddingRatio: 0.06, outFile: "icon-512.png" });

  // "maskable" — Android może przyciąć zewnętrzne ~20% pod okrągłą/zaokrągloną
  // maskę, więc treść musi zmieścić się w wewnętrznym "safe zone".
  await squareIcon({ size: 192, paddingRatio: 0.19, outFile: "icon-maskable-192.png" });
  await squareIcon({ size: 512, paddingRatio: 0.19, outFile: "icon-maskable-512.png" });

  // iOS "Dodaj do ekranu głównego" — wymaga nieprzezroczystego tła (Safari samo
  // dokleja zaokrąglone rogi).
  await squareIcon({ size: 180, paddingRatio: 0.1, outFile: "apple-touch-icon.png" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
