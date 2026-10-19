-- Zdjęcia w wiadomościach czatu personelu (bajty szyfrowane aplikacyjnie).
CREATE TABLE "StaffMessageImage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "StaffMessageImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffMessageImage_messageId_key" ON "StaffMessageImage"("messageId");

ALTER TABLE "StaffMessageImage" ADD CONSTRAINT "StaffMessageImage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "StaffMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
