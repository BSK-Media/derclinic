-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "consumptionConfirmedAt" TIMESTAMP(3);

-- Wizyty zakończone przed wdrożeniem, które mają już zapisane zużycie, uznajemy za potwierdzone.
UPDATE "Appointment" a SET "consumptionConfirmedAt" = NOW()
WHERE a."status" = 'COMPLETED'
  AND EXISTS (SELECT 1 FROM "Consumption" c WHERE c."appointmentId" = a."id");
