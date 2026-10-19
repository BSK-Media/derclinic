-- Reguły przydziału pacjentów do segmentów RFM ustawiane przez administratora (null = domyślne).
ALTER TABLE "RfmSettings" ADD COLUMN "segmentRules" JSONB;
