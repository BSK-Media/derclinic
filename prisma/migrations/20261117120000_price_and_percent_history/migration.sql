-- Historia cen i procentów: zmiana ceny produktu albo procentu specjalisty działa od momentu zmiany i nie przelicza danych historycznych.

-- 1) Ceny produktu zapisywane przy zużyciu. Dotychczasowe zużycia dostają ceny bieżące z dnia migracji
--    (prawdziwych cen z przeszłości nigdzie nie zapisywano).
ALTER TABLE "Consumption" ADD COLUMN "purchasePriceAtUse" INTEGER;
ALTER TABLE "Consumption" ADD COLUMN "salePriceAtUse" INTEGER;

UPDATE "Consumption" AS c
SET "purchasePriceAtUse" = p."purchasePrice",
    "salePriceAtUse" = p."salePrice"
FROM "Product" AS p
WHERE p."id" = c."productId";

-- 2) Historia procentu specjalisty (ogólnego i wyjątków od zabiegów).
CREATE TABLE "SpecialistPercentChange" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "specialistId" TEXT NOT NULL,
    "serviceId" TEXT,
    "percent" INTEGER,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "changedById" TEXT,

    CONSTRAINT "SpecialistPercentChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpecialistPercentChange_specialistId_serviceId_effectiveFrom_idx" ON "SpecialistPercentChange"("specialistId", "serviceId", "effectiveFrom");

-- Stan obecny jako obowiązujący od początku (dotychczasowe rozliczenia zostają takie, jakie były).
INSERT INTO "SpecialistPercentChange" ("id", "specialistId", "serviceId", "percent", "effectiveFrom")
SELECT 'pch_' || md5(random()::text || clock_timestamp()::text || u."id"), u."id", NULL, u."payoutPercent", TIMESTAMP '1970-01-01 00:00:00'
FROM "User" AS u;

INSERT INTO "SpecialistPercentChange" ("id", "specialistId", "serviceId", "percent", "effectiveFrom")
SELECT 'pch_' || md5(random()::text || clock_timestamp()::text || sp."id"), sp."specialistId", sp."serviceId", sp."percent", TIMESTAMP '1970-01-01 00:00:00'
FROM "SpecialistServicePercent" AS sp;
