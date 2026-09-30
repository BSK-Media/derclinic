// Wspólna polityka haseł dla personelu i pacjentów (audyt bezpieczeństwa, F-06).
//
// Zasady:
// - minimum 12 znaków, bez wymogów typu "wielka litera + cyfra + znak specjalny"
//   (utrudniają korzystanie z menedżerów haseł, a nie podnoszą realnie siły),
// - maksimum 72 bajty — bcrypt po cichu ignoruje wszystko dalej, więc dłuższe
//   hasło dawałoby fałszywe poczucie bezpieczeństwa,
// - odrzucamy hasła powszechnie znane / z wycieków oraz oczywiste warianty
//   loginu, imienia czy nazwy kliniki.
//
// Moduł nie importuje nic serwerowego, więc może być użyty także w formularzach.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_BYTES = 72;

export const PASSWORD_REQUIREMENTS_HINT = `min. ${PASSWORD_MIN_LENGTH} znaków`;

// Najczęściej spotykane hasła z publicznych list wycieków oraz hasła, które
// kiedykolwiek były domyślne w tym systemie (admin/admin, hasło startowe
// specjalistów z seeda). Porównanie jest bez rozróżniania wielkości liter.
const COMMON_PASSWORDS = new Set(
  [
    "admin",
    "administrator",
    "derclinic2026!",
    "derclinic2025!",
    "123456789012",
    "1234567890123",
    "12345678901234",
    "123456789abc",
    "1q2w3e4r5t6y",
    "1qaz2wsx3edc",
    "qwertyuiop12",
    "qwertyuiop123",
    "qwerty123456",
    "qwertyuiopasdf",
    "asdfghjkl123",
    "zaq12wsxcde3",
    "zaq1@wsx#edc",
    "password1234",
    "password12345",
    "password123!",
    "passwordpassword",
    "haslohaslo12",
    "haslo1234567",
    "haslo12345678",
    "iloveyou1234",
    "abcdefghijkl",
    "abc123abc123",
    "aaaaaaaaaaaa",
    "111111111111",
    "000000000000",
    "123123123123",
    "121212121212",
    "welcome12345",
    "letmein12345",
    "changeme1234",
    "change-me-please",
    "superhaslo123",
    "polska123456",
    "kochamcie123",
  ].map((p) => p.toLowerCase()),
);

// Słowa, które w haśle personelu/pacjenta są zbyt łatwe do odgadnięcia,
// jeśli stanowią większość hasła (np. "Derclinic2024!").
const GUESSABLE_WORDS = ["derclinic", "der clinic", "klinika", "password", "haslo", "hasło", "admin", "qwerty"];

function utf8Length(value: string) {
  return new TextEncoder().encode(value).length;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");
}

// Hasło zbudowane z jednego znaku albo prostego ciągu (1234..., abcd...).
function isTrivialSequence(value: string) {
  if (new Set(value).size <= 2) return true;
  let asc = 0;
  let desc = 0;
  for (let i = 1; i < value.length; i++) {
    const diff = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (diff === 1) asc++;
    if (diff === -1) desc++;
  }
  return asc >= value.length - 2 || desc >= value.length - 2;
}

// Usuwa "doczepione" cyfry i znaki specjalne (np. "Anna.Kowalska2024!") —
// żeby sprawdzić, czy trzon hasła nie jest po prostu loginem lub imieniem.
function core(value: string) {
  return normalize(value).replace(/[^a-z]/g, "");
}

export type PasswordContext = {
  login?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

/**
 * Zwraca komunikat błędu (po polsku) albo null, gdy hasło spełnia politykę.
 */
export function validatePassword(password: string, context: PasswordContext = {}): string | null {
  if (typeof password !== "string" || password.length === 0) return "Podaj hasło";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Hasło musi mieć co najmniej ${PASSWORD_MIN_LENGTH} znaków`;
  }
  if (utf8Length(password) > PASSWORD_MAX_BYTES) {
    return `Hasło jest za długie (maks. ${PASSWORD_MAX_BYTES} bajty — ok. ${PASSWORD_MAX_BYTES} znaków bez polskich liter)`;
  }

  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered) || isTrivialSequence(password)) {
    return "To hasło jest zbyt popularne lub łatwe do odgadnięcia. Wybierz inne.";
  }

  const passwordCore = core(password);
  const personal = [
    context.login,
    context.name,
    context.email?.split("@")[0],
    ...(context.name ? context.name.split(/\s+/) : []),
  ]
    .map((v) => (v ? core(v) : ""))
    .filter((v) => v.length >= 3);

  const digits = password.replace(/\D/g, "");
  const phoneDigits = context.phone?.replace(/\D/g, "").slice(-9) ?? "";
  if (phoneDigits.length === 9 && digits.includes(phoneDigits)) {
    return "Hasło nie może zawierać Twojego numeru telefonu.";
  }

  for (const word of [...personal, ...GUESSABLE_WORDS.map(core)]) {
    // Trzon hasła to (prawie) samo słowo — reszta to tylko cyfry/znaki.
    if (passwordCore.length > 0 && passwordCore.length <= word.length + 2 && passwordCore.includes(word)) {
      return "Hasło nie może opierać się na loginie, imieniu, nazwie kliniki ani popularnym słowie.";
    }
  }

  return null;
}
