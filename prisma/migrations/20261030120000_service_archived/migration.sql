-- Usługi archiwalne (np. z importu historii): widoczne w historii wizyt, niedostępne do nowych rezerwacji.
ALTER TABLE "Service" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
