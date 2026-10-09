-- Szyfrowanie aplikacyjne imienia, telefonu i e-maila pacjenta: skróty HMAC do wyszukiwania po dokładnej wartości.
ALTER TABLE "Patient" ADD COLUMN "nameHash" TEXT;
ALTER TABLE "Patient" ADD COLUMN "emailHash" TEXT;
ALTER TABLE "Patient" ADD COLUMN "phoneHash" TEXT;

DROP INDEX IF EXISTS "Patient_name_idx";
DROP INDEX IF EXISTS "Patient_phone_idx";
CREATE INDEX "Patient_nameHash_idx" ON "Patient"("nameHash");
CREATE INDEX "Patient_emailHash_idx" ON "Patient"("emailHash");
CREATE INDEX "Patient_phoneHash_idx" ON "Patient"("phoneHash");
