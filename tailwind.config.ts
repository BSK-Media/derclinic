import type { Config } from "tailwindcss";

// Barwy marki DerClinic: fiolet #7C3AED (kolor główny), #6669AC (dodatkowy,
// przygaszony fiolet — hover i teksty) oraz #F6F4F5 (jasne tło).
//
// Cały interfejs był zbudowany na klasach "emerald-*" (zielony akcent), więc
// zamiast przepisywać tysiąc użyć paleta "emerald" (i "teal") jest tu
// podmieniona na skalę fioletu marki — akcenty, przyciski, ramki i plakietki
// zmieniają kolor w całej aplikacji naraz. Znaczenia statusów (np. "zakończona"
// na kalendarzu) używają jawnie "green-*" i zostają zielone.
const brandScale = {
  50: "#F5F3FF",
  100: "#EDE9FE",
  200: "#DDD6FE",
  300: "#C4B5FD",
  400: "#A78BFA",
  500: "#8B5CF6",
  600: "#7C3AED",
  700: "#6669AC",
  800: "#4C4E8A",
  900: "#3B3D6E",
  950: "#26274A",
};

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        emerald: brandScale,
        teal: brandScale,
        brand: { DEFAULT: "#7C3AED", secondary: "#6669AC", surface: "#F6F4F5" },
        // Jasne tło marki zamiast neutralnego szarego (zinc-50 to najczęstsze tło paneli i kart).
        zinc: { 50: "#F6F4F5" },
      },
    },
  },
  plugins: [],
};

export default config;
