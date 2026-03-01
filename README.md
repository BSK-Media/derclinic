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

## Konto seed
- **ADMIN**: login `admin` / hasło `admin`

## Deploy na Vercel (skrót)
1) Dodaj Postgresa (Neon/Supabase/Railway) i ustaw `DATABASE_URL`.
2) Ustaw `AUTH_SECRET`.
3) Pierwsze uruchomienie bazy:
   - lokalnie / CI: `npm run db:setup` (generate + db push + seed)
   - na Vercel: ustaw Build Command na `npm run db:setup && npm run build`.
