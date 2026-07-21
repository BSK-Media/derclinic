import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, login: true, name: true, role: true, email: true, payoutPercent: true, phone: true, specialistCode: true, isVisible: true, isAvailable: true, avatarUrl: true, jobTitle: true, location: true, locationId: true, assignedLocation: { select: { id: true, name: true } }, specialization: true, createdAt: true },
  });
  return NextResponse.json({
    ok: true,
    users: users.map((item) => ({ ...item, location: item.assignedLocation.name })),
  });
}

const CreateSchema = z.object({
  login: z.string().min(2),
  name: z.string().min(2),
  role: z.enum(["ADMIN", "RECEPTION", "SPECIALIST"]),
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(4),
  payoutPercent: z.number().int().min(0).max(100).optional(),
  locationId: z.string().min(1),
  specialization: z.string().optional().or(z.literal("")),
  avatarUrl: z
    .string()
    .refine((v) => v === "" || v.startsWith("data:image/") || /^https?:\/\//.test(v), "Niepoprawne zdjęcie")
    .optional()
    .or(z.literal("")),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const { login, name, role, email, password, payoutPercent, locationId, specialization, avatarUrl } = parsed.data;

  const assignedLocation = await prisma.location.findFirst({
    where: { id: locationId, isActive: true },
    select: { id: true, name: true },
  });
  if (!assignedLocation) {
    return NextResponse.json({ ok: false, message: "Wybierz prawidłową lokalizację" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const created = await prisma.user.create({
    data: {
      login,
      name,
      role: role as any,
      email: email ? email : null,
      passwordHash,
      payoutPercent: role === "SPECIALIST" ? (payoutPercent ?? 50) : 0,
      locationId: assignedLocation.id,
      location: assignedLocation.name,
      specialization: specialization || null,
      avatarUrl: avatarUrl || null,
    },
    select: { id: true, login: true, name: true, role: true, email: true, payoutPercent: true, phone: true, specialistCode: true, isVisible: true, isAvailable: true, avatarUrl: true, jobTitle: true, location: true, locationId: true, assignedLocation: { select: { id: true, name: true } }, specialization: true },
  });

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "User", entityId: created.id, data: { login, role } });

  return NextResponse.json({ ok: true, user: created });
}
