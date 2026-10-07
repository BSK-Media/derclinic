-- CreateEnum
CREATE TYPE "VatRate" AS ENUM ('VAT_23', 'VAT_8', 'VAT_5', 'VAT_0', 'ZW');

-- CreateEnum
CREATE TYPE "SaleDocumentType" AS ENUM ('RECEIPT', 'INVOICE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "vatRate" "VatRate" NOT NULL DEFAULT 'VAT_23';

-- AlterTable
ALTER TABLE "RetailSale" ADD COLUMN "buyerAddress" TEXT,
ADD COLUMN "buyerName" TEXT,
ADD COLUMN "buyerNip" TEXT,
ADD COLUMN "documentType" "SaleDocumentType" NOT NULL DEFAULT 'RECEIPT',
ADD COLUMN "vatAmount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RetailSaleItem" ADD COLUMN "vatAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "vatRate" "VatRate" NOT NULL DEFAULT 'VAT_23';

-- Dotychczasowe sprzedaże: wszystkie produkty miały domyślnie 23%, więc VAT
-- wyliczamy z kwot brutto (pozycje — przed zniżką, sprzedaż — po zniżce).
UPDATE "RetailSaleItem" SET "vatAmount" = ROUND(COALESCE("total", 0) * 23.0 / 123.0);
UPDATE "RetailSale" SET "vatAmount" = ROUND("total" * 23.0 / 123.0);
