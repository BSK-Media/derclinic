import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const AvatarSchema = z.object({
  avatarUrl: z
    .string()
    .max(1_500_000)
    .refine(
      (value) => /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value),
      "Niepoprawny format zdjęcia",
    ),
});

export async function PATCH(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const json = await req.json().catch(() => null);
  const parsed = AvatarSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne zdjęcie" },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: user!.id },
    data: { avatarUrl: parsed.data.avatarUrl },
    select: { id: true, avatarUrl: true },
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "UserAvatar",
    entityId: user!.id,
    data: { avatarUrl: "[image]" },
  });

  return NextResponse.json({ ok: true, user: updated });
}
