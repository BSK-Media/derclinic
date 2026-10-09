ALTER TABLE "Product" ADD COLUMN "customUnit" TEXT;

CREATE TABLE "ProductCategoryOption" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProductCategoryOption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductCategoryOption_name_key" ON "ProductCategoryOption"("name");

CREATE TABLE "ProductUnitOption" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProductUnitOption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductUnitOption_name_key" ON "ProductUnitOption"("name");

INSERT INTO "ProductCategoryOption" ("id","name")
SELECT 'cat_' || md5("catalogCategory"), "catalogCategory" FROM "Product"
WHERE "catalogCategory" IS NOT NULL AND btrim("catalogCategory") <> '' GROUP BY "catalogCategory";
