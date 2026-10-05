// Rodzaje wiadomości e-mail wysyłanych przez aplikację — współdzielone przez
// serwer (wysyłka, ustawienia) i panel admina (przełączniki, dziennik wysyłek).
// Bez importów serwerowych, żeby dało się użyć w kliencie.

export const EMAIL_TYPES = [
  "PATIENT_BOOKING_CONFIRMATION",
  "PATIENT_APPOINTMENT_CHANGED",
  "PATIENT_APPOINTMENT_CANCELED",
  "PATIENT_REMINDER",
  "STAFF_NEW_ONLINE_BOOKING",
  "STAFF_DATA_CHANGE_REQUEST",
  "PASSWORD_RESET",
  "TEST",
  "MANUAL",
] as const;

export type EmailType = (typeof EMAIL_TYPES)[number];

export type EmailTypeInfo = {
  type: EmailType;
  label: string;
  description: string;
  audience: "PATIENT" | "STAFF" | "SYSTEM";
  // false = wiadomość techniczna, której nie da się wyłączyć w ustawieniach.
  toggleable: boolean;
};

export const EMAIL_TYPE_INFO: readonly EmailTypeInfo[] = [
  {
    type: "PATIENT_BOOKING_CONFIRMATION",
    label: "Potwierdzenie rezerwacji",
    description: "Po umówieniu wizyty — online przez klienta albo przez recepcję.",
    audience: "PATIENT",
    toggleable: true,
  },
  {
    type: "PATIENT_APPOINTMENT_CHANGED",
    label: "Zmiana terminu wizyty",
    description: "Gdy recepcja lub specjalista zmieni termin albo specjalistę zaplanowanej wizyty.",
    audience: "PATIENT",
    toggleable: true,
  },
  {
    type: "PATIENT_APPOINTMENT_CANCELED",
    label: "Odwołanie wizyty",
    description: "Gdy zaplanowana wizyta dostanie status „Odwołana”.",
    audience: "PATIENT",
    toggleable: true,
  },
  {
    type: "PATIENT_REMINDER",
    label: "Przypomnienie dzień przed wizytą",
    description: "Wysyłane raz dziennie rano do klientów, którzy mają wizytę następnego dnia.",
    audience: "PATIENT",
    toggleable: true,
  },
  {
    type: "STAFF_NEW_ONLINE_BOOKING",
    label: "Nowa rezerwacja online",
    description: "Gdy klient sam umówi wizytę przez stronę rezerwacji.",
    audience: "STAFF",
    toggleable: true,
  },
  {
    type: "STAFF_DATA_CHANGE_REQUEST",
    label: "Prośba o zmianę danych",
    description: "Gdy klient poprosi w panelu o zmianę imienia, telefonu lub adresu e-mail.",
    audience: "STAFF",
    toggleable: true,
  },
  {
    type: "PASSWORD_RESET",
    label: "Reset hasła",
    description: "Link do ustawienia nowego hasła — dla klienta (panel klienta) albo pracownika (panel).",
    audience: "SYSTEM",
    toggleable: false,
  },
  {
    type: "TEST",
    label: "Wiadomość testowa",
    description: "Wysyłana ręcznie z panelu admina.",
    audience: "SYSTEM",
    toggleable: false,
  },
  {
    type: "MANUAL",
    label: "Powiadomienie ręczne",
    description: "Powiadomienie push napisane i wysłane przez administratora.",
    audience: "SYSTEM",
    toggleable: false,
  },
];

export function emailTypeLabel(type: string) {
  return EMAIL_TYPE_INFO.find((info) => info.type === type)?.label ?? type;
}

export const EMAIL_STATUS_LABELS: Record<string, string> = {
  SENT: "Wysłano",
  FAILED: "Błąd",
  SKIPPED: "Pominięto",
};
