-- Rozliczenie niestandardowe specjalisty za miesiąc (ręczne wartości zastępujące policzone z wizyt).
CREATE TABLE "SpecialistMonthSettlement" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "specialistId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "appointments" INTEGER,
    "revenue" INTEGER,
    "materialCost" INTEGER,
    "payout" INTEGER,
    "note" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "SpecialistMonthSettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpecialistMonthSettlement_specialistId_month_key" ON "SpecialistMonthSettlement"("specialistId", "month");
CREATE INDEX "SpecialistMonthSettlement_month_idx" ON "SpecialistMonthSettlement"("month");

ALTER TABLE "SpecialistMonthSettlement" ADD CONSTRAINT "SpecialistMonthSettlement_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpecialistMonthSettlement" ADD CONSTRAINT "SpecialistMonthSettlement_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
