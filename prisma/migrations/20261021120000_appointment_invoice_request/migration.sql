ALTER TABLE "Appointment" ADD COLUMN "invoiceRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Appointment" ADD COLUMN "invoiceNip" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "invoiceCompanyName" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "invoiceAddress" TEXT;
