-- CreateTable
CREATE TABLE "ImageConsentRevocationRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "ImageConsentRevocationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImageConsentRevocationRequest_patientId_idx" ON "ImageConsentRevocationRequest"("patientId");

-- CreateIndex
CREATE INDEX "ImageConsentRevocationRequest_appointmentId_idx" ON "ImageConsentRevocationRequest"("appointmentId");

-- CreateIndex
CREATE INDEX "ImageConsentRevocationRequest_status_createdAt_idx" ON "ImageConsentRevocationRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ImageConsentRevocationRequest" ADD CONSTRAINT "ImageConsentRevocationRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageConsentRevocationRequest" ADD CONSTRAINT "ImageConsentRevocationRequest_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageConsentRevocationRequest" ADD CONSTRAINT "ImageConsentRevocationRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
