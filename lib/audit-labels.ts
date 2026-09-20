// Polskie etykiety dziennika zdarzeń — współdzielone przez API (filtry, CSV)
// i stronę "Logi". Bez importów serwerowych, żeby dało się użyć w kliencie.

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: "Utworzenie",
  UPDATE: "Zmiana",
  DELETE: "Usunięcie",
  LOGIN: "Logowanie",
  LOGOUT: "Wylogowanie",
  LOGIN_FAILED: "Nieudane logowanie",
  REGISTER: "Rejestracja konta",
  PASSWORD_RESET_REQUEST: "Prośba o reset hasła",
  PASSWORD_RESET: "Reset hasła",
  APPROVE: "Akceptacja",
  REJECT: "Odrzucenie",
  MERGE: "Scalenie",
  UPSERT: "Zapis",
  STOCK_ADJUST: "Korekta stanu magazynu",
  CONSENT: "Zmiana zgody",
  BOOK: "Rezerwacja",
  EXPORT: "Eksport",
  "sale.create": "Sprzedaż",
  "sale.discount_authorize": "Autoryzacja rabatu",
  "stock.transfer": "Przesunięcie magazynowe",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  Appointment: "Wizyta",
  AppointmentApproval: "Akceptacja wizyty",
  AppointmentPhoto: "Zdjęcia z wizyty",
  AppointmentLoyaltyReconcile: "Punkty lojalnościowe wizyty",
  Payment: "Płatność",
  Consumption: "Zużycie preparatu",
  Patient: "Pacjent",
  PatientAccount: "Konto pacjenta",
  PatientConsent: "Zgoda pacjenta",
  PatientDataChangeRequest: "Prośba o zmianę danych",
  PatientPhoneFix: "Naprawa numerów telefonów",
  LoyaltyBackfill: "Synchronizacja punktów",
  User: "Konto pracownika",
  UserAvatar: "Zdjęcie profilowe",
  Specialist: "Specjalista",
  SpecialistServiceRate: "Stawka specjalisty",
  SpecialistBaseRate: "Stawka bazowa specjalisty",
  SpecialistService: "Zabiegi specjalisty",
  SpecialistWarehouse: "Magazyny specjalisty",
  SpecialistWorkDay: "Grafik tygodniowy",
  SpecialistCustomWorkDay: "Grafik na dzień",
  SpecialistTimeOff: "Dni wolne",
  Service: "Zabieg / usługa",
  ServiceSuggestedProduct: "Preparaty zabiegu",
  Product: "Produkt",
  Warehouse: "Magazyn",
  Stock: "Stan magazynowy",
  RetailSale: "Sprzedaż (POS)",
  Location: "Lokalizacja",
  ContentImport: "Import treści testowych",
  AuditLog: "Dziennik zdarzeń",
  SpecialistMessage: "Wiadomość do specjalisty",
};

export const AUDIT_PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "gotówka",
  CARD: "karta",
  VOUCHER: "bon",
  ONLINE: "online",
};

export const AUDIT_ACTOR_TYPE_LABELS: Record<string, string> = {
  STAFF: "Pracownik",
  PATIENT: "Pacjent",
  GUEST: "Gość (niezalogowany)",
  SYSTEM: "System",
};

export const AUDIT_ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrator",
  RECEPTION: "Recepcja",
  SPECIALIST: "Specjalista",
};

export function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function auditEntityLabel(entity: string) {
  return AUDIT_ENTITY_LABELS[entity] ?? entity;
}

/** Krótki opis aktora do tabeli, np. "Anna Nowak (Recepcja)". */
export function auditActorLabel(log: {
  actorType: string;
  actorName: string | null;
  actorRole: string | null;
}) {
  const role =
    log.actorType === "STAFF"
      ? (AUDIT_ROLE_LABELS[log.actorRole ?? ""] ?? null)
      : (AUDIT_ACTOR_TYPE_LABELS[log.actorType] ?? log.actorType);
  const name = log.actorName?.trim() || (log.actorType === "SYSTEM" ? "System" : "Nieznany");
  return role ? `${name} (${role})` : name;
}
