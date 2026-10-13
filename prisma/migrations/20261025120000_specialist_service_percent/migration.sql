-- Wyjątki od ogólnego procentu pracownika: inny procent dla konkretnego zabiegu.
CREATE TABLE "SpecialistServicePercent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "specialistId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,

    CONSTRAINT "SpecialistServicePercent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpecialistServicePercent_specialistId_serviceId_key" ON "SpecialistServicePercent"("specialistId", "serviceId");
CREATE INDEX "SpecialistServicePercent_specialistId_idx" ON "SpecialistServicePercent"("specialistId");
CREATE INDEX "SpecialistServicePercent_serviceId_idx" ON "SpecialistServicePercent"("serviceId");

ALTER TABLE "SpecialistServicePercent" ADD CONSTRAINT "SpecialistServicePercent_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpecialistServicePercent" ADD CONSTRAINT "SpecialistServicePercent_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
