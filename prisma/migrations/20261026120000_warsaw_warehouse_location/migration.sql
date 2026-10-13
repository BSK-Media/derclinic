-- „Magazyn Warszawa” był założony przy lokalizacji Grodzisk Mazowiecki (błąd danych początkowych), przez co
-- widziała go recepcja z Grodziska. Przenosimy go do lokalizacji Warszawa — tylko gdy magazyn jest pusty
-- (bez niezerowych stanów, partii i przypisań specjalistów), żeby nic nie zmienić w już używanym magazynie.
UPDATE "Warehouse"
SET "locationId" = 'warszawa', "updatedAt" = NOW()
WHERE "id" = 'warsaw-warehouse'
  AND "locationId" = 'grodzisk-mazowiecki'
  AND EXISTS (SELECT 1 FROM "Location" WHERE "id" = 'warszawa')
  AND NOT EXISTS (SELECT 1 FROM "Stock" WHERE "warehouseId" = 'warsaw-warehouse' AND "quantity" <> 0)
  AND NOT EXISTS (SELECT 1 FROM "ProductLot" WHERE "warehouseId" = 'warsaw-warehouse' AND "quantity" <> 0)
  AND NOT EXISTS (SELECT 1 FROM "SpecialistWarehouse" WHERE "warehouseId" = 'warsaw-warehouse');
