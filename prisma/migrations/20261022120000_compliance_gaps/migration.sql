-- Konto pracownika wyłączone (offboarding bez usuwania konta)
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);

-- Ograniczenie przetwarzania danych pacjenta (art. 18 RODO)
ALTER TABLE "Patient" ADD COLUMN "processingRestrictedAt" TIMESTAMP(3);

-- Wersje regulaminu i polityki prywatności zaakceptowane przy rezerwacji
ALTER TABLE "Appointment" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "privacyVersion" TEXT;

-- Z których partii zeszło zużycie (identyfikowalność preparatów)
ALTER TABLE "Consumption" ADD COLUMN "lotAllocations" JSONB;

-- Historia treści notatek (poprzednie wersje, zaszyfrowane aplikacyjnie)
CREATE TABLE "NoteVersion" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "NoteVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NoteVersion_entity_entityId_createdAt_idx" ON "NoteVersion"("entity", "entityId", "createdAt");
