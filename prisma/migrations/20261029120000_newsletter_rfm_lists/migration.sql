-- Listy newslettera automatyczne: skład wyznacza segment RFM i jest przeliczany automatycznie.
ALTER TABLE "NewsletterList" ADD COLUMN "rfmSegment" TEXT;
CREATE UNIQUE INDEX "NewsletterList_rfmSegment_key" ON "NewsletterList"("rfmSegment");
