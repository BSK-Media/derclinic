-- Zgody marketingowe wyrażane na recepcji (papierowy dokument) i skany podpisanych zgód.
ALTER TABLE "PatientConsentEvent" ADD COLUMN "channel" TEXT;
ALTER TABLE "PatientConsentEvent" ADD COLUMN "recordedById" TEXT;

CREATE TABLE "PatientConsentDocument" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" TEXT NOT NULL,
    "type" "PatientConsentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT,

    CONSTRAINT "PatientConsentDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PatientConsentDocument_patientId_createdAt_idx" ON "PatientConsentDocument"("patientId", "createdAt");

ALTER TABLE "PatientConsentDocument" ADD CONSTRAINT "PatientConsentDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
