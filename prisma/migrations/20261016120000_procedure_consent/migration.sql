-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "consentForfeitedAt" TIMESTAMP(3),
ADD COLUMN     "consentRejectionReason" TEXT,
ADD COLUMN     "consentSignedAt" TIMESTAMP(3),
ADD COLUMN     "consentStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';

-- CreateTable
CREATE TABLE "ProcedureConsentSubmission" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appointmentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "details" JSONB,
    "decidedById" TEXT,

    CONSTRAINT "ProcedureConsentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcedureConsentSubmission_appointmentId_createdAt_idx" ON "ProcedureConsentSubmission"("appointmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProcedureConsentSubmission" ADD CONSTRAINT "ProcedureConsentSubmission_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureConsentSubmission" ADD CONSTRAINT "ProcedureConsentSubmission_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
