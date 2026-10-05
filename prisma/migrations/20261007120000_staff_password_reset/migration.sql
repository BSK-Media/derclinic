-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenHash" TEXT;

-- CreateIndex
CREATE INDEX "User_passwordResetTokenHash_idx" ON "User"("passwordResetTokenHash");
