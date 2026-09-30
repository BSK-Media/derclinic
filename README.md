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
