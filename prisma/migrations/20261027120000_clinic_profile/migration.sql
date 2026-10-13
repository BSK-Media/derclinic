-- Dane podmiotu (kliniki): jeden wiersz „clinic”, ustawiany w Ustawieniach → Dane kliniki.
CREATE TABLE "ClinicProfile" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "legalForm" TEXT,
    "address" TEXT,
    "nip" TEXT,
    "regon" TEXT,
    "krs" TEXT,
    "rpwdl" TEXT,

    CONSTRAINT "ClinicProfile_pkey" PRIMARY KEY ("id")
);
