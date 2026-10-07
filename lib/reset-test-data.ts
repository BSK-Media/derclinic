import type { Prisma, PrismaClient } from "@prisma/client";

// TYMCZASOWE — jednorazowe czyszczenie danych testowych przed oddaniem aplikacji
// (przycisk w Ustawieniach administratora). Po użyciu usunąć razem z endpointem
// app/api/admin/dev/reset-test-data i kartą components/reset-test-data-card.tsx.
//
// USUWA: wizyty (z płatnościami, zgodami na zabieg, zdjęciami), pacjentów (z kontami,
// sesjami, zgodami, punktami, członkostwem w listach newslettera), produkty (ze
// stanami i partiami), sprzedaż POS, ruchy magazynowe, przypisania preparatów do
// zabiegów, zatrzymane terminy, dziennik e-maili i znaczniki przeczytanych powiadomień.
// ZOSTAWIA: konta pracowników, zabiegi/usługi, lokalizacje, magazyny (puste), grafiki
// i urlopy, ustawienia, kampanie newslettera oraz dziennik zdarzeń (chroniony
// wyzwalaczem bazy przed usuwaniem).

export const RESET_TEST_DATA_PHRASE = "USUŃ DANE TESTOWE";

export async function countTestData(db: PrismaClient | Prisma.TransactionClient) {
  const [
    appointments,
    patients,
    products,
    stocks,
    lots,
    consumptions,
    retailSales,
    payments,
    paymentRequests,
    consentSubmissions,
    bookingHolds,
    emailLogs,
    suggestions,
    loyalty,
    users,
    services,
    locations,
    warehouses,
    auditLogs,
  ] = await Promise.all([
    db.appointment.count(),
    db.patient.count(),
    db.product.count(),
    db.stock.count(),
    db.productLot.count(),
    db.consumption.count(),
    db.retailSale.count(),
    db.payment.count(),
    db.paymentRequest.count(),
    db.procedureConsentSubmission.count(),
    db.bookingHold.count(),
    db.emailLog.count(),
    db.serviceSuggestedProduct.count(),
    db.loyaltyPointsTransaction.count(),
    db.user.count(),
    db.service.count(),
    db.location.count(),
    db.warehouse.count(),
    db.auditLog.count(),
  ]);
  return {
    toDelete: [
      { label: "Wizyty", count: appointments },
      { label: "Pacjenci", count: patients },
      { label: "Produkty", count: products },
      { label: "Stany magazynowe", count: stocks },
      { label: "Partie produktów", count: lots },
      { label: "Ruchy magazynowe i zużycia", count: consumptions },
      { label: "Sprzedaże POS", count: retailSales },
      { label: "Płatności", count: payments },
      { label: "Prośby o płatność", count: paymentRequests },
      { label: "Zgody na zabieg (pliki)", count: consentSubmissions },
      { label: "Zatrzymane terminy rezerwacji", count: bookingHolds },
      { label: "Dziennik wysłanych e-maili", count: emailLogs },
      { label: "Preparaty przypisane do zabiegów", count: suggestions },
      { label: "Księga punktów lojalnościowych", count: loyalty },
    ],
    kept: [
      { label: "Konta pracowników", count: users },
      { label: "Zabiegi / usługi", count: services },
      { label: "Lokalizacje", count: locations },
      { label: "Magazyny", count: warehouses },
      { label: "Wpisy dziennika zdarzeń", count: auditLogs },
    ],
  };
}

/** Kolejność uwzględnia relacje z blokadą usuwania (Restrict): zużycia, sprzedaż i
 *  przypisania preparatów przed produktami, wizyty przed pacjentami. */
export async function deleteTestData(tx: Prisma.TransactionClient) {
  await tx.payment.deleteMany();
  await tx.retailSaleItem.deleteMany();
  await tx.retailSale.deleteMany();
  await tx.consumption.deleteMany();
  await tx.serviceSuggestedProduct.deleteMany();
  await tx.paymentRequest.deleteMany();
  await tx.procedureConsentSubmission.deleteMany();
  await tx.bookingHold.deleteMany();
  await tx.emailLog.deleteMany();
  await tx.notificationRead.deleteMany();
  await tx.appointment.deleteMany();
  await tx.patient.deleteMany();
  await tx.product.deleteMany();
}
