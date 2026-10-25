-- Vouchery, katalog pakietów i pakiety sprzedane pacjentom + nowe metody rozliczenia wizyt.
ALTER TYPE "PaymentMethod" ADD VALUE 'PACKAGE';

CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "saleMethod" "PaymentMethod" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PackageTemplate" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serviceId" TEXT,
    "sessions" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "validityDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PackageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientPackage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "serviceId" TEXT,
    "sessionsTotal" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "saleMethod" "PaymentMethod" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "PatientPackage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Payment" ADD COLUMN "voucherId" TEXT,
ADD COLUMN "patientPackageId" TEXT,
ADD COLUMN "packageSessions" INTEGER;

CREATE UNIQUE INDEX "Voucher_code_key" ON "Voucher"("code");
CREATE INDEX "Voucher_patientId_idx" ON "Voucher"("patientId");
CREATE INDEX "Voucher_createdAt_idx" ON "Voucher"("createdAt");
CREATE UNIQUE INDEX "PatientPackage_code_key" ON "PatientPackage"("code");
CREATE INDEX "PatientPackage_patientId_idx" ON "PatientPackage"("patientId");
CREATE INDEX "PatientPackage_createdAt_idx" ON "PatientPackage"("createdAt");
CREATE INDEX "Payment_voucherId_idx" ON "Payment"("voucherId");
CREATE INDEX "Payment_patientPackageId_idx" ON "Payment"("patientPackageId");

ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PackageTemplate" ADD CONSTRAINT "PackageTemplate_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PackageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_patientPackageId_fkey" FOREIGN KEY ("patientPackageId") REFERENCES "PatientPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
