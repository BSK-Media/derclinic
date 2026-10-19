-- Czat wewnętrzny personelu (wiadomości między pracownikami, treść szyfrowana aplikacyjnie).
CREATE TABLE "StaffMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderId" TEXT NOT NULL,
    "senderOperatorName" TEXT,
    "recipientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "StaffMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffMessage_recipientId_readAt_idx" ON "StaffMessage"("recipientId", "readAt");
CREATE INDEX "StaffMessage_senderId_recipientId_createdAt_idx" ON "StaffMessage"("senderId", "recipientId", "createdAt");
CREATE INDEX "StaffMessage_recipientId_senderId_createdAt_idx" ON "StaffMessage"("recipientId", "senderId", "createdAt");

ALTER TABLE "StaffMessage" ADD CONSTRAINT "StaffMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffMessage" ADD CONSTRAINT "StaffMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
