import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { CHAT_ACTIVE_USER, CHAT_ROLE_LABELS } from "@/lib/chat";

export const dynamic = "force-dynamic";

// Lista osób, do których można napisać (każdy pracownik z każdym), z liczbą nieprzeczytanych wiadomości
// i czasem ostatniej wymiany — rozmowy z ostatnią aktywnością na górze.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const [users, unread, lastSent, lastReceived] = await Promise.all([
    prisma.user.findMany({
      where: { id: { not: user!.id }, ...CHAT_ACTIVE_USER },
      select: { id: true, name: true, role: true, avatarUrl: true, jobTitle: true },
    }),
    prisma.staffMessage.groupBy({
      by: ["senderId"],
      where: { recipientId: user!.id, readAt: null },
      _count: { _all: true },
    }),
    prisma.staffMessage.groupBy({ by: ["recipientId"], where: { senderId: user!.id }, _max: { createdAt: true } }),
    prisma.staffMessage.groupBy({ by: ["senderId"], where: { recipientId: user!.id }, _max: { createdAt: true } }),
  ]);

  const unreadBy = new Map(unread.map((row) => [row.senderId, row._count._all]));
  const lastAt = new Map<string, Date>();
  for (const row of lastSent) if (row._max.createdAt) lastAt.set(row.recipientId, row._max.createdAt);
  for (const row of lastReceived) {
    const at = row._max.createdAt;
    const cur = lastAt.get(row.senderId);
    if (at && (!cur || at > cur)) lastAt.set(row.senderId, at);
  }

  const contacts = users
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      roleLabel: CHAT_ROLE_LABELS[u.role] ?? u.role,
      jobTitle: u.jobTitle,
      avatarUrl: u.avatarUrl,
      unread: unreadBy.get(u.id) ?? 0,
      lastAt: lastAt.get(u.id)?.toISOString() ?? null,
    }))
    .sort((a, b) => {
      if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt);
      if (a.lastAt) return -1;
      if (b.lastAt) return 1;
      return a.name.localeCompare(b.name, "pl", { sensitivity: "base" });
    });

  return NextResponse.json({ ok: true, me: { id: user!.id, name: user!.name }, contacts });
}
