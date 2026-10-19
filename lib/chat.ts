// Czat wewnętrzny personelu: stałe i pomocnicze funkcje wspólne dla endpointów.

export const CHAT_MAX_BODY = 2000;
export const CHAT_PAGE_SIZE = 200;

export const CHAT_ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  RECEPTION: "Recepcja",
  SPECIALIST: "Specjalista",
};

/** Podpis nadawcy: dla konta wspólnego (recepcja) dopisujemy imię osoby wybranej PIN-em. */
export function chatSenderLabel(name: string, operatorName?: string | null) {
  return operatorName ? `${name} (${operatorName})` : name;
}

/** Konto, do którego można pisać: aktywne, nie archiwalne. */
export const CHAT_ACTIVE_USER = { disabledAt: null, isArchived: false } as const;

/** Maksymalny rozmiar zdjęcia po stronie serwera (przeglądarka zmniejsza zdjęcia przed wysyłką). */
export const CHAT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
