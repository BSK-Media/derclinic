// Zasady płatności przy rezerwacji online (patrz komentarz w schema.prisma
// przy PaymentMethod.ONLINE):
// - usługi do 2000,00 zł włącznie: klient wybiera zaliczkę 10% albo pełną
//   płatność z góry;
// - usługi od 2000,01 zł: wymagana pełna przedpłata (100%), bez wyboru.
// Próg liczony jest od CENNIKOWEJ ceny usługi (kategoryzacja usługi), a
// kwota do zapłaty — od ceny po ewentualnym rabacie za punkty lojalnościowe
// (to realna kwota, jaką klient jest winien).
//
// OBECNIE DEMO: nie ma jeszcze prawdziwej bramki płatności — kliknięcie
// "Zapłać" na froncie od razu tworzy opłaconą Payment (method: ONLINE).
// Ten moduł jest tym samym używany po stronie klienta (do wyświetlenia
// kwoty) i serwera (jako ostateczne, autorytatywne źródło prawdy — nigdy
// nie ufamy kwocie/wyborowi przysłanym z frontendu bez przeliczenia tutaj).

export const FULL_PREPAYMENT_THRESHOLD_GROSZE = 200_000; // 2000,00 zł
export const DEPOSIT_PERCENT = 0.1;

export type PaymentChoice = "DEPOSIT_10" | "FULL";

export function requiresFullPrepayment(servicePriceGrosze: number | null | undefined): boolean {
  return (servicePriceGrosze ?? 0) > FULL_PREPAYMENT_THRESHOLD_GROSZE;
}

export function depositAmountGrosze(amountOwedGrosze: number): number {
  return Math.round(Math.max(0, amountOwedGrosze) * DEPOSIT_PERCENT);
}

/**
 * Rozstrzyga, ile faktycznie trzeba zapłacić teraz. `choice` przysłany przez
 * klienta jest tylko sugestią — jeśli usługa wymaga pełnej przedpłaty,
 * wybór jest wymuszany na "FULL" niezależnie od tego, co przyszło z frontu.
 */
export function resolvePaymentDue(params: {
  servicePriceGrosze: number | null | undefined;
  amountOwedGrosze: number;
  choice: PaymentChoice;
}): { effectiveChoice: PaymentChoice; amountDueGrosze: number } {
  const owed = Math.max(0, Math.round(params.amountOwedGrosze));
  const mustPayFull = requiresFullPrepayment(params.servicePriceGrosze);
  const effectiveChoice: PaymentChoice = mustPayFull ? "FULL" : params.choice;
  const amountDueGrosze = effectiveChoice === "FULL" ? owed : depositAmountGrosze(owed);
  return { effectiveChoice, amountDueGrosze };
}
