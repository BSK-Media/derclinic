-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "facebookId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Patient_facebookId_key" ON "Patient"("facebookId");
