-- CreateTable
CREATE TABLE "BookingHold" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "specialistId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "amount" INTEGER NOT NULL,
    "choice" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "method" TEXT,
    "appointmentId" TEXT,

    CONSTRAINT "BookingHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingHold_reference_key" ON "BookingHold"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "BookingHold_appointmentId_key" ON "BookingHold"("appointmentId");

-- CreateIndex
CREATE INDEX "BookingHold_specialistId_startsAt_idx" ON "BookingHold"("specialistId", "startsAt");

-- CreateIndex
CREATE INDEX "BookingHold_expiresAt_idx" ON "BookingHold"("expiresAt");
