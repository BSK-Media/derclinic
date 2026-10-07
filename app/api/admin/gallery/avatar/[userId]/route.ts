import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { requireStepUp } from "@/lib/mfa";
import { dataUrlToImageResponse } from "@/lib/data-url-response";

// Zdjęcie profilowe pracownika w galerii: podgląd (GET) i usunięcie (DELETE) —
// usunięcie czyści pole zdjęcia, konto zostaje.
export async function GET(_req: Request, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const target = await prisma.user.findUnique({ where: { id: params.userId }, select: { avatarUrl: true } });
  const response = dataUrlToImageResponse(target?.avatarUrl);
  response.headers.set("cache-control", "private, no-store");
  return response;
}

export async function DELETE(_req: Request, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;
  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

  const target = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, name: true, login: true, avatarUrl: true },
  });
  if (!target || !target.avatarUrl) {
    return NextResponse.json({ ok: false, message: "Nie znaleziono zdjęcia" }, { status: 404 });
  }

  await prisma.user.update({ where: { id: target.id }, data: { avatarUrl: null } });
  await logAudit({
    actorId: user!.id,
    action: "DELETE",
    entity: "User",
    entityId: target.id,
    summary: `Usunięto zdjęcie profilowe pracownika „${target.name}" (${target.login}) z galerii`,
  });
  return NextResponse.json({ ok: true });
}
