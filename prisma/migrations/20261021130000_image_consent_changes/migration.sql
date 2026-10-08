CREATE TABLE "ImageConsentChange" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,

    CONSTRAINT "ImageConsentChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImageConsentChange_createdAt_idx" ON "ImageConsentChange"("createdAt");
CREATE INDEX "ImageConsentChange_appointmentId_idx" ON "ImageConsentChange"("appointmentId");

ALTER TABLE "ImageConsentChange" ADD CONSTRAINT "ImageConsentChange_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImageConsentChange" ADD CONSTRAINT "ImageConsentChange_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
