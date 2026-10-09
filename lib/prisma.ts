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
