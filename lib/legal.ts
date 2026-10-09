// Adresy dokumentów prawnych pokazywanych przy rezerwacji. Dopóki adres jest
// pusty (null), słowo w zgodzie jest zwykłym tekstem; po wpisaniu adresu
// automatycznie staje się linkiem otwieranym w nowej karcie.
export const TERMS_URL: string | null = null; // regulamin rezerwacji wizyt
export const PRIVACY_URL: string | null = null; // polityka prywatności

// Wersje dokumentów zapisywane przy każdej rezerwacji (dowód, co klient zaakceptował). Przy wpisaniu
// adresu dokumentu wpisz też jego wersję (np. datę obowiązywania "2026-11-01") i zmieniaj ją
// przy każdej zmianie treści dokumentu.
export const TERMS_VERSION: string | null = null;
export const PRIVACY_VERSION: string | null = null;
