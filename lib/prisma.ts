// lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { decryptDeep, encryptWriteArgs, isEncryptedModel } from "@/lib/data-encryption";
import { addBlindIndexes, rewritePatientWhere } from "@/lib/blind-index";

// Jeden klient Prisma dla całej aplikacji (lib/db.ts reeksportuje ten sam).
// Rozszerzenie szyfruje przy zapisie i odszyfrowuje przy odczycie dane medyczne
// (zdjęcia z wizyt, notatki — lib/data-encryption.ts), więc reszta kodu widzi
// je jak zwykle, a w bazie i jej kopiach zapasowych są zaszyfrowane (audyt F-09/F-10).
// Skróty (indeksy ślepe) liczymy z jawnych wartości, zanim pola zostaną zaszyfrowane.
function withPatientBlindIndexes(operation: string, args: any) {
  if (!args || typeof args !== "object") return args;
  const next = { ...args };
  if (["create", "update", "createMany", "updateMany", "createManyAndReturn", "updateManyAndReturn"].includes(operation)) {
    next.data = addBlindIndexes(next.data);
  }
  if (operation === "upsert") {
    next.create = addBlindIndexes(next.create);
    next.update = addBlindIndexes(next.update);
  }
  return next;
}

// Ceny produktu z chwili zużycia (Consumption.purchasePriceAtUse / salePriceAtUse): zapisujemy je przy każdym utworzeniu zużycia,
// żeby późniejsza zmiana ceny w katalogu nie zmieniała rozliczeń ani analityki z przeszłości.
async function withConsumptionPrices(base: PrismaClient, operation: string, args: any) {
  if (!args || typeof args !== "object" || !args.data) return args;
  if (!["create", "createMany", "createManyAndReturn"].includes(operation)) return args;
  const rows: any[] = Array.isArray(args.data) ? args.data : [args.data];
  const idOf = (row: any): string | undefined => row?.productId ?? row?.product?.connect?.id;
  const needed = Array.from(new Set(rows.filter((row) => row && row.purchasePriceAtUse === undefined && row.salePriceAtUse === undefined).map(idOf).filter(Boolean) as string[]));
  if (needed.length === 0) return args;
  const products = await base.product.findMany({ where: { id: { in: needed } }, select: { id: true, purchasePrice: true, salePrice: true } });
  const byId = new Map(products.map((product) => [product.id, product] as const));
  const fill = (row: any) => {
    const product = byId.get(idOf(row) ?? "");
    if (!product || row.purchasePriceAtUse !== undefined || row.salePriceAtUse !== undefined) return row;
    return { ...row, purchasePriceAtUse: product.purchasePrice, salePriceAtUse: product.salePrice };
  };
  return { ...args, data: Array.isArray(args.data) ? args.data.map(fill) : fill(args.data) };
}

function createClient(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  // Rozszerzenie typu "query" nie zmienia kształtu wyników, więc zwracamy go jako
  // zwykły PrismaClient — dzięki temu Prisma.TransactionClient w kodzie pasuje dalej.
  const extended = base.$extends({
    name: "medical-data-encryption",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
          let prepared: any = args;
          if (prepared && typeof prepared === "object" && "where" in prepared) {
            prepared = { ...prepared, where: rewritePatientWhere(prepared.where, modelKey === "patient") };
          }
          if (modelKey === "patient") prepared = withPatientBlindIndexes(operation, prepared);
          if (modelKey === "consumption") prepared = await withConsumptionPrices(base, operation, prepared);
          const nextArgs = isEncryptedModel(modelKey) ? encryptWriteArgs(modelKey, operation, prepared) : prepared;
          return decryptDeep(await query(nextArgs));
        },
      },
    },
  });
  return extended as unknown as PrismaClient;
}

type ExtendedPrismaClient = PrismaClient;

// Prevent multiple Prisma Client instances in development (Next.js HMR)
const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
