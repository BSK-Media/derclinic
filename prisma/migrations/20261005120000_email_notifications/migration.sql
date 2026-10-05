-- CreateTable
CREATE TABLE "EmailSettings" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disabledTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "staffRecipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifySpecialist" BOOLEAN NOT NULL DEFAULT true,
    "replyTo" TEXT,

    CONSTRAINT "EmailSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "providerId" TEXT,
    "dedupeKey" TEXT,
    "appointmentId" TEXT,
    "patientId" TEXT,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_dedupeKey_key" ON "EmailLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_type_createdAt_idx" ON "EmailLog"("type", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_appointmentId_idx" ON "EmailLog"("appointmentId");
