import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { validatePassword } from "@/lib/password-policy";
import { requireStepUp } from "@/lib/mfa";
import { STAFF_BCRYPT_COST } from "@/lib/staff-credentials";
import { generatePasswordResetToken } from "@/lib/patient-auth";
import { appBaseUrl, sendTrackedEmail } from "@/lib/email-notifications";
import { staffAccountCreatedEmail } from "@/lib/email-templates";

// Link z wiadomości powitalnej żyje dłużej niż zwykły reset hasła (1 godz.) —
// nowy pracownik rzadko otwiera pocztę od razu.
const WELCOME_LINK_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const ROLE_LABELS = { ADMIN: "Administrator", RECEPTION: "Recepcja", SPECIALIST: "Specjalista" } as const;

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
  // Puste = bez hasła startowego: pracownik ustawia hasło linkiem z e-maila.
  password: z.string().max(500).optional().or(z.literal("")),
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

  if (!password && !email) {
    return NextResponse.json(
      { ok: false, message: "Podaj adres e-mail (pracownik dostanie link do ustawienia hasła) albo hasło startowe." },
      { status: 400 },
    );
  }
  if (password) {
    const passwordIssue = validatePassword(password, { login, name, email });
    if (passwordIssue) return NextResponse.json({ ok: false, message: passwordIssue }, { status: 400 });
  }

  // Bez hasła startowego konto dostaje losowe hasło, którego nikt nie zna —
  // zalogować się da dopiero po ustawieniu własnego linkiem z e-maila.
  const passwordHash = await bcrypt.hash(password || randomBytes(32).toString("base64url"), STAFF_BCRYPT_COST);
  const welcome = email ? generatePasswordResetToken() : null;

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
        passwordResetTokenHash: welcome?.tokenHash ?? null,
        passwordResetExpiresAt: welcome ? new Date(Date.now() + WELCOME_LINK_TTL_MS) : null,
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

  // Wiadomość powitalna: login i link do ustawienia własnego hasła.
  let emailSent = false;
  if (welcome && email) {
    const baseUrl = appBaseUrl(req);
    const result = await sendTrackedEmail({
      ...staffAccountCreatedEmail({
        name,
        login,
        roleLabel: ROLE_LABELS[role],
        setPasswordUrl: `${baseUrl}/login/reset-hasla?token=${welcome.token}`,
      }),
      type: "STAFF_ACCOUNT_CREATED",
      to: email,
    });
    emailSent = result.ok;
  }
  const startPasswordSet = Boolean(password);

  await logAudit({
    actorId: user!.id,
    action: "CREATE",
    entity: "User",
    entityId: created.id,
    summary: `Utworzenie konta pracownika „${login}" (${name}, rola ${role})${
      !email ? "" : emailSent ? " — wysłano e-mail z linkiem do ustawienia hasła" : " — e-mail powitalny nie został wysłany"
    }`,
    data: { login, name, role, email: email || null, locationId: assignedLocation.id, welcomeEmailSent: emailSent, startPasswordSet },
  });

  return NextResponse.json({ ok: true, user: created, emailSent, startPasswordSet });
}
