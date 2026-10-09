// Strona kliencka ochrony z lib/bot-guard.ts: moment otwarcia strony i wartość pola-pułapki.
const openedAt = typeof window === "undefined" ? 0 : Date.now();

export const HONEYPOT_ID = "contact-website";

export function botGuardFields() {
  const field = typeof document === "undefined" ? null : (document.getElementById(HONEYPOT_ID) as HTMLInputElement | null);
  return { website: field?.value ?? "", formOpenedAt: openedAt };
}
