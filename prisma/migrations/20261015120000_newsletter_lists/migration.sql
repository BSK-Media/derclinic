-- AlterTable
ALTER TABLE "NewsletterCampaign" ADD COLUMN     "audienceListIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "audiencePatientIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "audienceType" TEXT NOT NULL DEFAULT 'ALL';

-- CreateTable
CREATE TABLE "NewsletterList" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "NewsletterList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterListMember" (
    "listId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterListMember_pkey" PRIMARY KEY ("listId","patientId")
);

-- CreateIndex
CREATE INDEX "NewsletterListMember_patientId_idx" ON "NewsletterListMember"("patientId");

-- AddForeignKey
ALTER TABLE "NewsletterList" ADD CONSTRAINT "NewsletterList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterListMember" ADD CONSTRAINT "NewsletterListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "NewsletterList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterListMember" ADD CONSTRAINT "NewsletterListMember_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
