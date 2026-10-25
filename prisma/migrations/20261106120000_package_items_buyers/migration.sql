-- Pakiety: wiele usług w jednym pakiecie (pozycje), kupujący + posiadacz (pakiet imienny lub anonimowy), wartość
-- w cenach standardowych. Vouchery: imię i nazwisko obdarowanego (voucher imienny) lub brak (anonimowy).

CREATE TABLE "PatientPackageItem" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "serviceId" TEXT,
    "sessions" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PatientPackageItem_pkey" PRIMARY KEY ("id")
);

-- Dotychczasowe pakiety: jedna pozycja z usługą i liczbą zabiegów pakietu.
INSERT INTO "PatientPackageItem" ("id", "packageId", "serviceId", "sessions", "position")
SELECT 'ppi_' || "id", "id", "serviceId", "sessionsTotal", 0 FROM "PatientPackage";

ALTER TABLE "PatientPackage" DROP CONSTRAINT "PatientPackage_serviceId_fkey";
ALTER TABLE "PatientPackage" DROP COLUMN "serviceId",
ADD COLUMN     "holderPatientId" TEXT,
ADD COLUMN     "standardValue" INTEGER;

-- Dotychczasowe pakiety były imienne: posiadacz = pacjent, któremu je sprzedano.
UPDATE "PatientPackage" SET "holderPatientId" = "patientId";

ALTER TABLE "Payment" ADD COLUMN     "patientPackageItemId" TEXT;
UPDATE "Payment" SET "patientPackageItemId" = 'ppi_' || "patientPackageId" WHERE "patientPackageId" IS NOT NULL;

ALTER TABLE "Voucher" ADD COLUMN     "recipientName" TEXT;

CREATE INDEX "PatientPackageItem_packageId_idx" ON "PatientPackageItem"("packageId");
CREATE INDEX "PatientPackage_holderPatientId_idx" ON "PatientPackage"("holderPatientId");
CREATE INDEX "Payment_patientPackageItemId_idx" ON "Payment"("patientPackageItemId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_patientPackageItemId_fkey" FOREIGN KEY ("patientPackageItemId") REFERENCES "PatientPackageItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_holderPatientId_fkey" FOREIGN KEY ("holderPatientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPackageItem" ADD CONSTRAINT "PatientPackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PatientPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPackageItem" ADD CONSTRAINT "PatientPackageItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
