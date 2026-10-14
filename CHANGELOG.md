# Dziennik zmian — DerClinic CRM

Format: najnowsze na górze, zmiany pogrupowane według daty wdrożenia. Szczegóły techniczne: historia commitów
i migracje w `prisma/migrations`.

## 2026-10-14
### Zmieniono
- Kotwica dziennika zdarzeń (L-07): kontrola nadal codziennie (skróty i weryfikacja podpisów z ostatniej doby), ale e-mail do administratorów wychodzi raz w miesiącu jako zbiorcze zestawienie wszystkich dni; natychmiastowe ostrzeżenie tylko przy anomalii.

## 2026-10-13
### Dodano
- Ustawienia → Dane kliniki (administrator): nazwa, adres, NIP, REGON, KRS i numer w rejestrze podmiotów leczniczych; dane trafiają do dokumentu zgody na zabieg. Migracja `20261027120000_clinic_profile`.

### Naprawiono
- „Magazyn Warszawa” był przypisany do lokalizacji Grodzisk Mazowiecki, więc widziała go recepcja z Grodziska. Migracja `20261026120000_warsaw_warehouse_location` przenosi go do lokalizacji Warszawa (tylko jeśli jest pusty).

### Dodano
- Szczegóły specjalisty: lista przypisanych zabiegów z procentem i wyjątki procentowe od ogólnego procentu (nadpisują go dla danego zabiegu). Wyjątki uwzględniają rozliczenia miesięczne, podsumowanie finansowe, szczegóły specjalisty i pulpit specjalisty. Migracja `20261025120000_specialist_service_percent`.
- Kalendarz wizyt (widok dnia): filtr „Pracujący tego dnia”.

## 2026-10-12
### Dodano
- Nocna kopia zapasowa poza platformą (L-05): workflow `backup.yml` — `pg_dump` całej bazy, szyfrowanie age, zapis do S3 `derclinic-backups-eu-north` (eu-north-1) z Object Lock COMPLIANCE (dzienne 35 dni, miesięczne 400 dni).
- Kotwica dziennika zdarzeń w magazynie WORM (L-07): codzienny zapis liczby wpisów i skrótów do `anchors/` w S3 (400 dni), obok e-maila z `/api/cron/audit-anchor`.
- Vercel Firewall (L-17): limit 30 żądań POST/min na IP dla logowania, rejestracji, resetu hasła, MFA i rezerwacji; Bot Protection (tryb Log), AI Bots: Deny; wyjątek dla `/api/cron/` i `/api/health`.

### Zmieniono
- Produkcja: ustawione jawnie klucze `DATA_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY`, `AUDIT_SIGNING_KEY`, `STAFF_AUTH_SECRET`, `PATIENT_AUTH_SECRET` oraz `CRON_SECRET` (L-06, L-07). Sekrety 2FA przeniesione na nowy klucz skryptem jednorazowym; kody odzyskiwania do ponownego wygenerowania. Wpisy dziennika sprzed 12.10.2026 były podpisane kluczem wyprowadzonym z `AUTH_SECRET` i nie przechodzą weryfikacji nowym kluczem.
- Gałąź `production` w Neon chroniona przed usunięciem i resetem (L-05).
- Workflow zgód (`consent-cron.yml`) i monitoring dostępności (`uptime.yml`) aktywne po ustawieniu `APP_URL` i `CRON_SECRET` w GitHub Actions.

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
