
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit, diffFields } from "@/lib/audit";
import { SIDEBAR_PERMISSION_KEYS } from "@/lib/sidebar-permissions";

const PatchSchema = z.object({
  isVisible: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).optional(),
  sidebarPermissions: z.array(z.enum(SIDEBAR_PERMISSION_KEYS)).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const data: any = {};
  if (parsed.data.isVisible !== undefined) data.isVisible = parsed.data.isVisible;
  if (parsed.data.isAvailable !== undefined) data.isAvailable = parsed.data.isAvailable;
  if (parsed.data.phone !== undefined) data.phone = parsed.data.phone || null;
  if (parsed.data.email !== undefined) data.email = parsed.data.email ? parsed.data.email : null;
  if (parsed.data.sidebarPermissions !== undefined) data.sidebarPermissions = parsed.data.sidebarPermissions;

  const before = await prisma.user.findUnique({
    where: { id: params.id },
    select: { isVisible: true, isAvailable: true, phone: true, email: true, sidebarPermissions: true },
  });

  const updated = await prisma.user.update({
    where: { id: params.id },
    data,
    select: {
      id: true,
      specialistCode: true,
      name: true,
      login: true,
      role: true,
      email: true,
      phone: true,
      isVisible: true,
      isAvailable: true,
      avatarUrl: true,
      jobTitle: true,
      sourceProfileUrl: true,
      sidebarPermissions: true,
    },
  });

  const changes = before ? diffFields(before, data) : undefined;
  const labels: Record<string, string> = {
    isVisible: "widoczność publiczna",
    isAvailable: "dostępność",
    phone: "telefon",
    email: "e-mail",
    sidebarPermissions: "uprawnienia menu",
  };
  const show = (key: string, value: unknown) =>
    typeof value === "boolean"
      ? value
        ? "Tak"
        : "Nie"
      : Array.isArray(value)
        ? `[${value.join(", ")}]`
        : value === null || value === undefined
          ? "domyślne/brak"
          : String(value);
  const parts = Object.entries(changes ?? {}).map(
    ([key, change]) => `${labels[key] ?? key}: ${show(key, change.from)} → ${show(key, change.to)}`,
  );
  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "Specialist",
    entityId: updated.id,
    summary: `Zmiana ustawień konta „${updated.name}": ${parts.length ? parts.join("; ") : "bez zmian wartości"}`,
    data: { ...data, changes },
  });
  return NextResponse.json({ ok: true, specialist: updated });
}
