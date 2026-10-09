# Dziennik zmian — DerClinic OS

Format: najnowsze na górze, zmiany pogrupowane według daty wdrożenia. Szczegóły techniczne: historia commitów
i migracje w `prisma/migrations`.

## 2026-10-09
### Dodano
- Kategorie produktów i jednostki miary wybierane z list; zarządzanie nimi w Ustawienia → Produkty (admin, manager, recepcja). Migracja `20261023120000_product_category_unit_options`.
- Okno „Dodaj produkty do magazynu”: wszystkie pola widoczne od razu, pola nowego produktu wyszarzone do wyboru „Nowy produkt”.
- Kotwica dziennika zdarzeń (L-07): codzienny e-mail do administratorów ze skrótem dziennika, `/api/cron/audit-anchor`.
- Ochrona formularzy publicznych przed botami (L-17): pole-pułapka, minimalny czas wypełnienia, limity na endpointach dostępności terminów.
- Lista kart do brakowania po 20 latach (L-12): Pacjenci → „Do brakowania” (tylko administrator).
- Szyfrowanie aplikacyjne imienia, telefonu i e-maila pacjenta (pkt 5.2 dokumentacji) z indeksami ślepymi do wyszukiwania po dokładnej wartości; wyszukiwanie „zawiera” w pamięci. Migracja `20261024120000_patient_blind_index`.
- Szyfrowanie danych do faktury (NIP, nazwa firmy, adres nabywcy) w wizytach i sprzedaży.
- Monitoring dostępności (L-15): workflow GitHub Actions sprawdzający /api/health co 5 minut (wymaga zmiennej APP_URL).
- Ten dziennik zmian (L-26).

## Wcześniej
- v1.1 dokumentacji technicznej: zamknięcie luk L-09, L-10, L-13, L-14, L-20, L-22 oraz części L-08, L-12, L-15, L-21 (migracja `20261022120000_compliance_gaps`).
