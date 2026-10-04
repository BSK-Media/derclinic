-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "googleSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Patient_googleSub_key" ON "Patient"("googleSub");
