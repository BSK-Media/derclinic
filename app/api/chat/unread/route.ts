import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// Liczba nieprzeczytanych wiadomości (znaczek przy „Czat” w menu).
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const unread = await prisma.staffMessage.count({ where: { recipientId: user!.id, readAt: null } });
  return NextResponse.json({ ok: true, unread });
}
