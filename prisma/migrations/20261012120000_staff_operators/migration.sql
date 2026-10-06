-- AlterTable
ALTER TABLE "StaffSession" ADD COLUMN     "operatorId" TEXT;

-- CreateTable
CREATE TABLE "StaffOperator" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,

    CONSTRAINT "StaffOperator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffOperator_userId_idx" ON "StaffOperator"("userId");

-- CreateIndex
CREATE INDEX "StaffSession_operatorId_idx" ON "StaffSession"("operatorId");

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "StaffOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffOperator" ADD CONSTRAINT "StaffOperator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
