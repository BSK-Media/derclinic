import { prisma } from "@/lib/prisma";

export type LogAuditInput = {
  actorId: string;
  action: string; // e.g. LOGIN, CREATE, UPDATE, DELETE
  entity: string; // e.g. User, Appointment, Product
  entityId?: string | null;
  data?: any;
};

export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        data: input.data ?? undefined,
      },
    });
  } catch (e) {
    // audit must never break API
    console.error("[audit] failed", e);
  }
}
