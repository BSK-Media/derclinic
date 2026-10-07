import { Prisma, type PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

// FEFO (first expired, first out): z magazynu schodzą najpierw partie o najkrótszym
// terminie ważności; partie bez terminu na końcu, a przy równych terminach — starsza dostawa.
const FEFO_ORDER: Prisma.ProductLotOrderByWithRelationInput[] = [{ expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }];

/**
 * Dopasowuje partie (ProductLot) do zmiany stanu magazynowego produktu.
 *  * consumed > 0 — ilość zeszła ze stanu (wizyta, sprzedaż): odejmujemy ją od partii FEFO.
 *    Partie zostają w bazie z ilością 0 (niewidoczne na listach), żeby zwrot mógł do nich wrócić.
 *  * consumed < 0 — zwrot na stan: dopisujemy do partii, z której ostatnio schodziło.
 * Stan produktu (Stock) może być większy niż suma partii (dane sprzed partii) — wtedy
 * brakująca część po prostu nie ma partii; ilość partii nigdy nie schodzi poniżej zera.
 */
export async function applyLotChange(
  db: Db,
  productId: string,
  warehouseId: string,
  consumed: Prisma.Decimal | number,
) {
  let remaining = new Prisma.Decimal(consumed);
  if (remaining.isZero()) return;

  if (remaining.gt(0)) {
    const lots = await db.productLot.findMany({
      where: { productId, warehouseId, quantity: { gt: 0 } },
      orderBy: FEFO_ORDER,
    });
    for (const lot of lots) {
      if (remaining.lte(0)) break;
      const take = Prisma.Decimal.min(lot.quantity, remaining);
      await db.productLot.update({ where: { id: lot.id }, data: { quantity: { decrement: take } } });
      remaining = remaining.minus(take);
    }
    return;
  }

  // Zwrot: do ostatnio ruszanej partii tego produktu w magazynie (jeśli żadnej nie ma, nic nie robimy —
  // stan produktu wzrósł, ale nie ma partii, do której można by go przypisać).
  const lastTouched = await db.productLot.findFirst({
    where: { productId, warehouseId },
    orderBy: { updatedAt: "desc" },
  });
  if (lastTouched) {
    await db.productLot.update({ where: { id: lastTouched.id }, data: { quantity: { increment: remaining.abs() } } });
  }
}

export type LotSuggestion = {
  id: string;
  batchNumber: string;
  serialNumber: string | null;
  expiryDate: Date | null;
  quantity: number;
  warehouseName: string;
};

/**
 * Dla każdego produktu: partie dostępne w magazynach lokalizacji, w kolejności użycia
 * (najkrótszy termin pierwszy). Pierwsza na liście to partia, której należy użyć.
 */
export async function suggestLotsByProduct(db: Db, productIds: string[], locationId: string) {
  const result = new Map<string, LotSuggestion[]>();
  if (productIds.length === 0) return result;

  const lots = await db.productLot.findMany({
    where: { productId: { in: productIds }, quantity: { gt: 0 }, warehouse: { locationId } },
    orderBy: FEFO_ORDER,
    include: { warehouse: { select: { name: true } } },
  });
  for (const lot of lots) {
    const list = result.get(lot.productId) ?? [];
    list.push({
      id: lot.id,
      batchNumber: lot.batchNumber,
      serialNumber: lot.serialNumber,
      expiryDate: lot.expiryDate,
      quantity: Number(lot.quantity),
      warehouseName: lot.warehouse.name,
    });
    result.set(lot.productId, list);
  }
  return result;
}
