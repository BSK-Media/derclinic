import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { validatePassword } from "@/lib/password-policy";
import { requireStepUp } from "@/lib/mfa";
import { STAFF_BCRYPT_COST } from "@/lib/staff-credentials";

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, login: true, name: true, role: true, email: true, payoutPercent: true, phone: true, specialistCode: true, isVisible: true, isAvailable: true, avatarUrl: true, jobTitle: true, location: true, locationId: true, assignedLocation: { select: { id: true, name: true } }, specialization: true, createdAt: true, mfaEnabledAt: true },
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
  password: z.string().min(1).max(500),
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

  // Zakładanie kont personelu = operacja wysokiego ryzyka: ponowne MFA.
  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

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

  const passwordIssue = validatePassword(password, { login, name, email });
  if (passwordIssue) return NextResponse.json({ ok: false, message: passwordIssue }, { status: 400 });

  const passwordHash = await bcrypt.hash(password, STAFF_BCRYPT_COST);

  let created;
  try {
    created = await prisma.user.create({
      data: {
        login,
        name,
        role: role as any,
        email: email ? email : null,
        passwordHash,
        // Hasło zna administrator — pracownik musi ustawić własne przy pierwszym logowaniu.
        mustChangePassword: true,
        payoutPercent: role === "SPECIALIST" ? (payoutPercent ?? 50) : 0,
        locationId: assignedLocation.id,
        location: assignedLocation.name,
        specialization: specialization || null,
        avatarUrl: avatarUrl || null,
      },
      select: { id: true, login: true, name: true, role: true, email: true, payoutPercent: true, phone: true, specialistCode: true, isVisible: true, isAvailable: true, avatarUrl: true, jobTitle: true, location: true, locationId: true, assignedLocation: { select: { id: true, name: true } }, specialization: true },
    });
  } catch (e) {
    // Login i e-mail są unikalne — zamiast ogólnego błędu mówimy, co jest zajęte.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = String((e.meta as { target?: unknown } | undefined)?.target ?? "");
      return NextResponse.json(
        {
          ok: false,
          message: target.includes("email")
            ? "Ten adres e-mail jest już przypisany do innego konta pracownika."
            : "Ten login jest już zajęty — wybierz inny.",
        },
        { status: 409 },
      );
    }
    throw e;
  }

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "User",
    entityId: created.id,
    summary: `Utworzenie konta pracownika „${login}" (${name}, rola ${role})`,
    data: { login, name, role, email: email || null, locationId: assignedLocation.id },
  });

  return NextResponse.json({ ok: true, user: created });
}
