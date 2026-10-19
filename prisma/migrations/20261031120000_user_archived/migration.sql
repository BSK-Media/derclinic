-- Konta archiwalne (dawni specjaliści z importu historii): poza listami pracowników, widoczne w Ustawienia → Archiwum.
ALTER TABLE "User" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "isArchived" = true WHERE "id" LIKE 'bks_u_%';
