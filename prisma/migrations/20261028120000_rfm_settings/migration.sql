-- Ustawienia analizy RFM: jeden wiersz „rfm”, ustawiany w Ustawieniach → Segmentacja pacjentów (RFM).
CREATE TABLE "RfmSettings" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 365,
    "thresholds" JSONB,

    CONSTRAINT "RfmSettings_pkey" PRIMARY KEY ("id")
);
