// Treści wiadomości e-mail. Czyste funkcje (bez bazy i bez next/headers):
// dostają gotowe dane i zwracają temat, HTML oraz wersję tekstową.
// Każda wartość pochodząca od użytkownika przechodzi przez escapeHtml.

export type EmailContent = { subject: string; html: string; text: string };

export type AppointmentEmailData = {
  patientName: string;
  serviceName: string;
  specialistName: string;
  locationName: string | null;
  startsAt: Date;
};

const BRAND = "DerClinic";
const ACCENT = "#059669";

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Np. "wtorek, 6 października 2026, godz. 14:30" (czas warszawski). */
export function formatAppointmentDate(date: Date) {
  const day = date.toLocaleDateString("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${day}, godz. ${time}`;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "";
}

function greeting(name: string) {
  const first = firstName(name);
  return first ? `Dzień dobry, ${first}!` : "Dzień dobry!";
}

type Row = [label: string, value: string];

function layout(input: {
  heading: string;
  paragraphs: string[];
  rows?: Row[];
  button?: { label: string; url: string };
  footnote?: string;
}): { html: string; text: string } {
  const rowsHtml = input.rows?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;border-collapse:collapse;">${input.rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#71717a;font-size:14px;width:38%;">${escapeHtml(label)}</td><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#18181b;font-size:14px;font-weight:600;">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const buttonHtml = input.button
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(input.button.url)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px;">${escapeHtml(input.button.label)}</a></p>`
    : "";
  const footnoteHtml = input.footnote
    ? `<p style="margin:16px 0 0;color:#71717a;font-size:13px;line-height:1.5;">${escapeHtml(input.footnote)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="pl">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f4f4f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:${ACCENT};padding:18px 28px;color:#ffffff;font-size:18px;font-weight:700;">${BRAND}</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 16px;color:#18181b;font-size:20px;line-height:1.3;">${escapeHtml(input.heading)}</h1>
${input.paragraphs.map((p) => `<p style="margin:0 0 12px;color:#3f3f46;font-size:15px;line-height:1.6;">${escapeHtml(p)}</p>`).join("\n")}
${rowsHtml}
${buttonHtml}
${footnoteHtml}
</td></tr>
<tr><td style="padding:16px 28px;background:#fafafa;color:#a1a1aa;font-size:12px;line-height:1.5;">Wiadomość wysłana automatycznie przez system ${BRAND}.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    input.heading,
    "",
    ...input.paragraphs,
    ...(input.rows?.length ? ["", ...input.rows.map(([label, value]) => `${label}: ${value}`)] : []),
    ...(input.button ? ["", `${input.button.label}: ${input.button.url}`] : []),
    ...(input.footnote ? ["", input.footnote] : []),
    "",
    `Wiadomość wysłana automatycznie przez system ${BRAND}.`,
  ].join("\n");

  return { html, text };
}

function appointmentRows(data: AppointmentEmailData): Row[] {
  return [
    ["Zabieg", data.serviceName],
    ["Termin", formatAppointmentDate(data.startsAt)],
    ["Specjalista", data.specialistName],
    ...(data.locationName ? ([["Lokalizacja", data.locationName]] as Row[]) : []),
  ];
}

function panelButton(baseUrl: string) {
  return { label: "Otwórz panel klienta", url: `${baseUrl}/panel-klienta` };
}

export function bookingConfirmationEmail(data: AppointmentEmailData, baseUrl: string): EmailContent {
  return {
    subject: `Potwierdzenie wizyty — ${BRAND}`,
    ...layout({
      heading: "Twoja wizyta jest umówiona",
      paragraphs: [greeting(data.patientName), "Potwierdzamy rezerwację wizyty. Poniżej szczegóły:"],
      rows: appointmentRows(data),
      button: panelButton(baseUrl),
      footnote: "Jeśli nie możesz przyjść w tym terminie, skontaktuj się z nami jak najwcześniej.",
    }),
  };
}

export function appointmentChangedEmail(
  data: AppointmentEmailData,
  previousStartsAt: Date,
  baseUrl: string,
): EmailContent {
  const moved = previousStartsAt.getTime() !== data.startsAt.getTime();
  return {
    subject: `Zmiana w Twojej wizycie — ${BRAND}`,
    ...layout({
      heading: moved ? "Zmienił się termin Twojej wizyty" : "Zmieniły się szczegóły Twojej wizyty",
      paragraphs: [greeting(data.patientName), "Wprowadziliśmy zmianę w Twojej wizycie. Aktualne szczegóły:"],
      rows: [
        ...appointmentRows(data),
        ...(moved ? ([["Poprzedni termin", formatAppointmentDate(previousStartsAt)]] as Row[]) : []),
      ],
      button: panelButton(baseUrl),
      footnote: "Jeśli nowy termin Ci nie odpowiada, skontaktuj się z nami.",
    }),
  };
}

export function appointmentCanceledEmail(data: AppointmentEmailData, baseUrl: string): EmailContent {
  return {
    subject: `Wizyta odwołana — ${BRAND}`,
    ...layout({
      heading: "Twoja wizyta została odwołana",
      paragraphs: [greeting(data.patientName), "Informujemy, że poniższa wizyta została odwołana:"],
      rows: appointmentRows(data),
      button: { label: "Umów nowy termin", url: `${baseUrl}/book` },
      footnote: "Jeśli to pomyłka albo chcesz ustalić inny termin, skontaktuj się z nami.",
    }),
  };
}

export function appointmentReminderEmail(data: AppointmentEmailData, baseUrl: string): EmailContent {
  return {
    subject: `Przypomnienie o jutrzejszej wizycie — ${BRAND}`,
    ...layout({
      heading: "Przypominamy o jutrzejszej wizycie",
      paragraphs: [greeting(data.patientName), "Jutro masz u nas umówioną wizytę:"],
      rows: appointmentRows(data),
      button: panelButton(baseUrl),
      footnote: "Jeśli nie możesz przyjść, daj nam znać jak najwcześniej.",
    }),
  };
}

export function staffNewBookingEmail(data: AppointmentEmailData, baseUrl: string): EmailContent {
  return {
    subject: `Nowa rezerwacja online: ${data.patientName} — ${formatAppointmentDate(data.startsAt)}`,
    ...layout({
      heading: "Nowa rezerwacja online",
      paragraphs: ["Klient umówił wizytę przez stronę rezerwacji."],
      rows: [["Klient", data.patientName], ...appointmentRows(data)],
      button: { label: "Otwórz listę wizyt", url: `${baseUrl}/admin/visits` },
    }),
  };
}

export function staffDataChangeRequestEmail(
  data: { patientName: string; fieldLabel: string },
  baseUrl: string,
): EmailContent {
  return {
    subject: `Prośba o zmianę danych: ${data.patientName}`,
    ...layout({
      heading: "Klient prosi o zmianę danych",
      paragraphs: [
        "W panelu klienta złożono prośbę o zmianę danych. Szczegóły i decyzja (akceptacja albo odrzucenie) są w panelu.",
      ],
      rows: [
        ["Klient", data.patientName],
        ["Zmieniane pole", data.fieldLabel],
      ],
      button: { label: "Otwórz pacjentów", url: `${baseUrl}/admin/patients` },
    }),
  };
}

export function staffImageConsentRevocationEmail(
  data: { patientName: string; serviceName: string; startsAt: Date },
  baseUrl: string,
): EmailContent {
  return {
    subject: `Prośba o cofnięcie zgody na wizerunek: ${data.patientName}`,
    ...layout({
      heading: "Klient prosi o cofnięcie zgody na wizerunek",
      paragraphs: [
        "W panelu klienta złożono prośbę o cofnięcie zgody na wykorzystanie wizerunku. Zaakceptuj albo odrzuć ją w panelu.",
      ],
      rows: [
        ["Klient", data.patientName],
        ["Zabieg", data.serviceName],
        ["Termin", formatAppointmentDate(data.startsAt)],
      ],
      button: { label: "Otwórz prośby", url: `${baseUrl}/admin/patients/image-consent-requests` },
    }),
  };
}

export function imageConsentDecisionEmail(
  data: {
    patientName: string;
    serviceName: string;
    startsAt: Date;
    approved: boolean;
    rejectionReason?: string | null;
  },
  baseUrl: string,
): EmailContent {
  return {
    subject: data.approved
      ? `Cofnięto zgodę na wizerunek — ${BRAND}`
      : `Prośba o cofnięcie zgody na wizerunek — ${BRAND}`,
    ...layout({
      heading: data.approved ? "Zgoda na wizerunek została cofnięta" : "Prośba o cofnięcie zgody została odrzucona",
      paragraphs: [
        greeting(data.patientName),
        data.approved
          ? "Zaakceptowaliśmy Twoją prośbę — zgoda na wykorzystanie wizerunku przy poniższym zabiegu została cofnięta."
          : "Nie mogliśmy zrealizować Twojej prośby o cofnięcie zgody na wykorzystanie wizerunku przy poniższym zabiegu.",
        ...(!data.approved && data.rejectionReason ? [`Powód: ${data.rejectionReason}`] : []),
      ],
      rows: [
        ["Zabieg", data.serviceName],
        ["Termin", formatAppointmentDate(data.startsAt)],
      ],
      button: { label: "Otwórz panel klienta", url: `${baseUrl}/panel-klienta?tab=consents` },
      footnote: data.approved ? undefined : "W razie pytań skontaktuj się z nami.",
    }),
  };
}

export function passwordResetEmail(data: { patientName: string; resetUrl: string }): EmailContent {
  return {
    subject: `Reset hasła — ${BRAND}`,
    ...layout({
      heading: "Ustaw nowe hasło",
      paragraphs: [
        greeting(data.patientName),
        "Otrzymaliśmy prośbę o zresetowanie hasła do panelu klienta. Link poniżej jest ważny przez godzinę.",
      ],
      button: { label: "Ustaw nowe hasło", url: data.resetUrl },
      footnote: "Jeśli to nie Ty prosiłaś/eś o reset hasła, zignoruj tę wiadomość — hasło się nie zmieni.",
    }),
  };
}

export function staffPasswordResetEmail(data: { name: string; login: string; resetUrl: string }): EmailContent {
  return {
    subject: `Reset hasła do panelu — ${BRAND}`,
    ...layout({
      heading: "Ustaw nowe hasło do panelu",
      paragraphs: [
        greeting(data.name),
        "Otrzymaliśmy prośbę o zresetowanie hasła do panelu DerClinic OS. Link poniżej jest ważny przez godzinę.",
      ],
      rows: [["Login", data.login]],
      button: { label: "Ustaw nowe hasło", url: data.resetUrl },
      footnote:
        "Po ustawieniu hasła zalogujesz się jak zwykle, z kodem z aplikacji uwierzytelniającej. Jeśli to nie Ty prosiłaś/eś o reset, zignoruj tę wiadomość i powiadom administratora.",
    }),
  };
}

export function staffAccountCreatedEmail(data: {
  name: string;
  login: string;
  roleLabel: string;
  setPasswordUrl: string;
}): EmailContent {
  return {
    subject: `Twoje konto w panelu — ${BRAND}`,
    ...layout({
      heading: "Założono Ci konto w panelu",
      paragraphs: [
        greeting(data.name),
        "Administrator założył Ci konto w panelu DerClinic OS. Kliknij przycisk poniżej, żeby od razu ustawić własne hasło — link jest ważny przez 3 dni.",
      ],
      rows: [
        ["Login", data.login],
        ["Rola", data.roleLabel],
      ],
      button: { label: "Ustaw hasło", url: data.setPasswordUrl },
      footnote:
        "Po ustawieniu hasła zalogujesz się swoim loginem i skonfigurujesz logowanie dwuskładnikowe (aplikacja uwierzytelniająca w telefonie). Jeśli link wygaśnie, użyj opcji „Nie pamiętam hasła” na ekranie logowania albo poproś administratora o reset hasła.",
    }),
  };
}

export function testEmail(data: { sentBy: string; from: string | null }): EmailContent {
  return {
    subject: `Wiadomość testowa — ${BRAND}`,
    ...layout({
      heading: "Wysyłka e-mail działa",
      paragraphs: [
        "To wiadomość testowa wysłana z panelu administratora. Skoro ją czytasz, konfiguracja poczty jest poprawna.",
      ],
      rows: [
        ["Wysłał(a)", data.sentBy],
        ...(data.from ? ([["Adres nadawcy", data.from]] as Row[]) : []),
      ],
    }),
  };
}
