import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { verifyNewsletterUnsubscribeToken } from "@/lib/newsletter";
import { RATE_LIMITS, clientIp, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

const BodySchema = z.object({ token: z.string().min(3).max(300) });

// Wypisanie z newslettera jednym kliknięciem z linku w stopce wiadomości
// (bez logowania). Wycofuje zgodę marketingową klienta — tak samo, jak
// przełącznik w panelu klienta, z wpisem w historii zgód i w dzienniku.
export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawny link" }, { status: 400 });

  const ipLimit = await hitRateLimit(RATE_LIMITS.resetPasswordIp, await clientIp());
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);

  // Wiadomość próbna ma token "podglad" — nic nie wypisujemy.
  if (parsed.data.token === "podglad") return NextResponse.json({ ok: true, preview: true });

  const patientId = verifyNewsletterUnsubscribeToken(parsed.data.token);
  if (!patientId) return NextResponse.json({ ok: false, message: "Niepoprawny lub uszkodzony link" }, { status: 400 });

  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, name: true, phone: true } });
  if (!patient) return NextResponse.json({ ok: false, message: "Nie znaleziono konta" }, { status: 404 });

  const existing = await prisma.patientConsent.findUnique({
    where: { patientId_type: { patientId, type: "MARKETING" } },
    select: { granted: true },
  });
  if (existing?.granted) {
    const now = new Date();
    await prisma.$transaction([
      prisma.patientConsent.update({
        where: { patientId_type: { patientId, type: "MARKETING" } },
        data: { granted: false, revokedAt: now },
      }),
      prisma.patientConsentEvent.create({ data: { patientId, type: "MARKETING", granted: false } }),
    ]);
    await logAudit({
      actor: { type: "PATIENT", id: patient.id, name: patient.name, contact: patient.phone },
      action: "CONSENT",
      entity: "PatientConsent",
      entityId: patient.id,
      summary: "Zgoda marketingowa: wycofana (link Wypisz się w newsletterze)",
      data: { type: "MARKETING", granted: false, previouslyGranted: true, via: "newsletter_unsubscribe" },
    });
  }

  return NextResponse.json({ ok: true });
}
