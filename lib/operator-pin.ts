// PIN osoby pracującej na wspólnym koncie (patrz StaffOperator w schema.prisma):
// dokładnie 6 cyfr. Odrzucamy PIN-y oczywiste (000000, 123456, 654321).
// Bez importów serwerowych — używane też w formularzu.

export const OPERATOR_PIN_LENGTH = 6;

export function validateOperatorPin(pin: string): string | null {
  if (pin.length !== OPERATOR_PIN_LENGTH || !/^[0-9]+$/.test(pin)) {
    return `PIN musi mieć dokładnie ${OPERATOR_PIN_LENGTH} cyfr`;
  }
  if (new Set(pin).size === 1) return "PIN jest zbyt prosty — nie powtarzaj jednej cyfry";
  let asc = true;
  let desc = true;
  for (let i = 1; i < pin.length; i++) {
    const diff = Number(pin[i]) - Number(pin[i - 1]);
    if (diff !== 1) asc = false;
    if (diff !== -1) desc = false;
  }
  if (asc || desc) return "PIN jest zbyt prosty — nie używaj ciągu kolejnych cyfr";
  return null;
}
