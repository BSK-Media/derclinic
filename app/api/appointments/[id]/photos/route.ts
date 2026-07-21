import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

const PhotoSchema = z.object({
  slot: z.enum(["BEFORE", "AFTER"]),
  image: z
    .string()
    .max(2_600_000, "Zdjęcie jest zbyt duże")
    .refine(
      (value) => /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value),
      "Niepoprawny format zdjęcia",
    )
    .nullable(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION", "SPECIALIST"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PhotoSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" },
      { status: 400 },
    );
  }

  const existing = await prisma.appointment.findFirst({
    where: {
      id: params.id,
      ...(user!.role === "SPECIALIST"
        ? { specialistId: user!.id, locationId: user!.locationId }
        : user!.locationScopeId
          ? { locationId: user!.locationScopeId }
          : {}),
    },
    select: { id: true, specialistId: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });
  }

  // Specjalista może dodawać zdjęcia tylko do własnych wizyt
  if (user!.role === "SPECIALIST" && existing.specialistId !== user!.id) {
    return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
  }

  const field = parsed.data.slot === "BEFORE" ? "photoBefore" : "photoAfter";

  const appointment = await prisma.appointment.update({
    where: { id: params.id },
    data: { [field]: parsed.data.image },
    select: { id: true, photoBefore: true, photoAfter: true },
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "AppointmentPhoto",
    entityId: params.id,
    data: { slot: parsed.data.slot, image: parsed.data.image ? "[image]" : null },
  });

  return NextResponse.json({ ok: true, appointment });
}
