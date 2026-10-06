import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { endPatientSession, getPatientAuth } from "@/lib/patient-auth";
import { revokeAllPatientSessions } from "@/lib/session-core";
import { logAudit } from "@/lib/audit";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

const BodySchema = z.object({
  // Wymagane, gdy konto ma hasło; konto tylko z Google/Facebookiem potwierdza sesja.
  password: z.string().max(500).optional(),
});

// Usunięcie konta przez klienta. Odbieramy dostęp, ale NIE kasujemy karty
// pacjenta: historia wizyt, zgody i punkty zostają w bazie (obowiązki
// dokumentacyjne kliniki). Po usunięciu ten sam numer/e-mail może założyć
// nowe konto — powstanie na nowej karcie (patrz /api/patient/register).
export async function DELETE(req: Request) {
  const auth = await getPatientAuth();
  if (!auth) return NextResponse.json({ ok: false, message: "Zaloguj się, aby usunąć konto." }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const limit = await hitRateLimit(RATE_LIMITS.patientLoginIp, await clientIp());
  if (!limit.allowed) return tooManyRequests(limit);

  const patient = await prisma.patient.findUnique({
    where: { id: auth.id },
    select: { id: true, name: true, phone: true, passwordHash: true, googleSub: true, facebookId: true },
  });
  if (!patient) return NextResponse.json({ ok: false, message: "Nie znaleziono konta." }, { status: 404 });

  if (patient.passwordHash) {
    const password = parsed.data.password ?? "";
    if (!password || !(await bcrypt.compare(password, patient.passwordHash))) {
      return NextResponse.json({ ok: false, message: "Błędne hasło" }, { status: 403 });
    }
  }

  await prisma.$transaction([
    prisma.patient.update({
      where: { id: patient.id },
      data: {
        passwordHash: null,
        googleSub: null,
        facebookId: null,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        accountDeletedAt: new Date(),
      },
    }),
    prisma.pushSubscription.deleteMany({ where: { patientId: patient.id } }),
  ]);
  await revokeAllPatientSessions(patient.id, "account_deleted");
  await endPatientSession("account_deleted");

  await logAudit({
    actor: { type: "PATIENT", id: patient.id, name: patient.name, contact: patient.phone },
    action: "DELETE",
    entity: "PatientAccount",
    entityId: patient.id,
    summary: `Klient usunął konto w panelu klienta (${patient.name}) — dostęp odebrany, karta i historia wizyt zostają w bazie`,
    data: {
      hadPassword: Boolean(patient.passwordHash),
      hadGoogle: Boolean(patient.googleSub),
      hadFacebook: Boolean(patient.facebookId),
    },
  });

  return NextResponse.json({ ok: true });
}
