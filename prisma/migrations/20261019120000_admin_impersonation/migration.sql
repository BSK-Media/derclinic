ALTER TABLE "StaffSession" ADD COLUMN "impersonatedById" TEXT;

CREATE INDEX "StaffSession_impersonatedById_idx" ON "StaffSession"("impersonatedById");
