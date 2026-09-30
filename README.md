# DerClinic OS — Dedykowane oprogramowanie dla kliniki

Stack: **Next.js (App Router) + TypeScript + Tailwind + minimalistyczny UI (shadcn‑like) + Prisma + PostgreSQL + auth (JWT w httpOnly cookie)**.

## Funkcje (MVP+)
- Role i panele: **ADMIN / RECEPTION / SPECIALIST** (jasny podział widoków).
- Wizyty: tworzenie, lista, widok tygodniowy, szczegóły, status, cena końcowa.
- Pacjenci: kartoteka + historia wizyt.
- Usługi: lista + dodawanie, czas trwania, sugerowana cena.
- Magazyn: produkty (cena zakupu/sprzedaży), magazyny + podmagazyny, stany, korekty, transfery.
- Zużycia: do wizyty + wewnętrzne (audyt).
- Sprzedaż kosmetyków: dokument sprzedaży + płatności.
- Rozliczenia specjalistów: miesięczne zestawienie (przychód, koszty materiałów, kwota do wypłaty).

## Start lokalnie
```bash
docker compose up -d
cp .env.example .env
# ustaw AUTH_SECRET na losowy, długi string
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

## Pierwsze konto administratora
Seed nie tworzy konta o znanym haśle (audyt bezpieczeństwa, F-01).
Pierwszego administratora zakłada się jednorazowo:

```bash
npm run admin:bootstrap
```

Skrypt działa tylko wtedy, gdy w bazie nie ma jeszcze żadnego administratora.
Wypisuje losowe hasło tymczasowe, które trzeba zmienić przy pierwszym logowaniu.

## Deploy na Vercel (skrót)
1) Dodaj Postgresa (Neon/Supabase/Railway) i ustaw `DATABASE_URL`.
2) Ustaw `AUTH_SECRET`.
3) Build Command (ustawiony w `vercel.json`): `npm run db:deploy && next build`.
   `db:deploy` stosuje wyłącznie wersjonowane migracje z `prisma/migrations`
   (`prisma migrate deploy`), bez `db push` i bez seeda. Zmiana schematu:
   `npm run prisma:migrate` lokalnie, a wygenerowaną migrację commitujemy.
4) Na pustej bazie produkcyjnej uruchom raz `npm run admin:bootstrap`.

## Bezpieczeństwo (audyt 30.09.2026)

**Zmienne środowiskowe (Production)** — pięć niezależnych, losowych wartości
(min. 32 znaki), opis w `env.example`: `STAFF_AUTH_SECRET`, `PATIENT_AUTH_SECRET`,
`MFA_ENCRYPTION_KEY`, `DATA_ENCRYPTION_KEY`, `AUDIT_SIGNING_KEY`. Bez nich build
produkcyjny się zatrzymuje. Kluczy `MFA_ENCRYPTION_KEY` i `DATA_ENCRYPTION_KEY`
nie wolno po prostu zmienić — przy rotacji starą wartość wpisz do
`*_PREVIOUS`, inaczej zaszyfrowane dane staną się nieczytelne.

**Logowanie personelu** — hasło (min. 12 znaków) + obowiązkowe 2FA: aplikacja
uwierzytelniająca (TOTP) i opcjonalnie klucze dostępu (passkeys), 10 jednorazowych
kodów odzyskiwania. Sesje po stronie serwera: 12 h, wylogowanie po 2 h
bezczynności; zmiana hasła/roli/uprawnień i reset 2FA unieważniają sesje.
Operacje wysokiego ryzyka (konta, role, eksport, usuwanie pacjenta, operacje
masowe) wymagają ponownego potwierdzenia 2FA.

**Zgubiony telefon pracownika** — pracownik loguje się kodem odzyskiwania albo
administrator (po potwierdzeniu tożsamości) klika „Reset 2FA” w Użytkownikach.
Własnego 2FA administrator nie zresetuje — robi to drugi administrator albo
kod odzyskiwania.

**Pacjenci** — sesja do 30 dni (7 dni bezczynności). Formularze nie ujawniają,
czy dany telefon/e-mail ma konto. Konto zakłada się zawsze na nowej karcie;
wcześniejszą kartę gościa recepcja łączy w Pacjenci → Duplikaty po weryfikacji.

**Retencja danych technicznych**
- Dziennik zdarzeń (`AuditLog`): tylko dopisywanie (wyzwalacz w bazie), każdy
  wpis podpisany HMAC; przechowywany bezterminowo (min. okres przechowywania
  dokumentacji). Telefony i e-maile są maskowane, treść notatek nie jest zapisywana.
- Sesje: usuwane 30 dni po wygaśnięciu. Liczniki limitów prób: 24 h.
- Zdjęcia z wizyt i notatki: szyfrowane AES-256-GCM w bazie
  (`DATA_ENCRYPTION_KEY`); starsze dane szyfruje przycisk w „Bezpieczeństwo konta”.

**Poza kodem (infrastruktura)** — do wykonania przed danymi produkcyjnymi:
niezmienna kopia dziennika poza bazą (F-11), obiektowy magazyn zdjęć (F-09),
KMS/Secrets Manager (F-08/F-10), WAF/CAPTCHA (F-05), baza bez publicznego
endpointu, testy odtwarzania backupu, pentest.
