import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/** Czy PIN jest już użyty przez inną osobę na tym koncie (PIN musi jednoznacznie wskazywać osobę). */
export async function pinTakenOnAccount(userId: string, pin: string, exceptOperatorId?: string) {
  const operators = await prisma.staffOperator.findMany({
    where: { userId, ...(exceptOperatorId ? { id: { not: exceptOperatorId } } : {}) },
    select: { pinHash: true },
  });
  for (const operator of operators) {
    if (await bcrypt.compare(pin, operator.pinHash)) return true;
  }
  return false;
}
