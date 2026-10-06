import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { sendPushToPatient, sendPushToPatients, type PushPayload } from "@/lib/push";
import { RATE_LIMITS, hitRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const maxDuration = 60;

const BodySchema = z
  .object({
    // patient   — jeden wskazany klient,
    // all       — wszyscy klienci z włączonymi powiadomieniami (informacje organizacyjne),
    // marketing — tylko klienci ze zgodą marketingową (promocje, nowości).
    audience: z.enum(["patient", "all", "marketing"]),
    patientId: z.string().min(1).max(100).optional(),
    title: z.string().trim().min(2, "Podaj tytuł powiadomienia").max(60, "Tytuł może mieć najwyżej 60 znaków"),
    body: z.string().trim().min(2, "Podaj treść powiadomienia").max(180, "Treść może mieć najwyżej 180 znaków"),
  })
  .refine((value) => value.audience !== "patient" || Boolean(value.patientId), {
    message: "Wybierz klienta",
    path: ["patientId"],
  });

// Ręczna wysyłka powiadomienia push do klientów — wyłącznie administrator.
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" },
      { status: 400 },
    );
  }

  const limit = await hitRateLimit(RATE_LIMITS.pushManual, user!.id);
  if (!limit.allowed) return tooManyRequests(limit, "Zbyt wiele ręcznych powiadomień. Spróbuj ponownie później.");

  const { audience, patientId, title, body } = parsed.data;
  const payload: PushPayload = { title, body, url: "/panel-klienta" };

  let result;
  let recipientLabel: string;
  if (audience === "patient") {
    const patient = await prisma.patient.findUnique({ where: { id: patientId! }, select: { id: true, name: true } });
    if (!patient) return NextResponse.json({ ok: false, message: "Nie znaleziono klienta" }, { status: 404 });
    recipientLabel = patient.name;
    result = await sendPushToPatient(patient.id, payload, { type: "MANUAL", recipientLabel });
  } else if (audience === "marketing") {
    const patients = await prisma.patient.findMany({
      where: { pushSubscriptions: { some: {} }, consents: { some: { type: "MARKETING", granted: true } } },
      select: { id: true },
    });
    recipientLabel = `Klienci ze zgodą marketingową (${patients.length})`;
    result = await sendPushToPatients(
      patients.map((patient) => patient.id),
      payload,
      { type: "MANUAL", recipientLabel },
    );
  } else {
    recipientLabel = "Wszyscy klienci z włączonymi powiadomieniami";
    result = await sendPushToPatients("all", payload, { type: "MANUAL", recipientLabel });
  }

  await logAudit({
    actorId: user!.id,
    action: "PUSH_SEND",
    entity: "Push",
    entityId: audience === "patient" ? patientId : null,
    summary: `Ręczne powiadomienie push („${title}") — odbiorca: ${recipientLabel}; urządzeń: ${result.sent}/${result.devices}`,
    data: { audience, title, sent: result.sent, devices: result.devices },
  });

  if (result.devices === 0 || result.skipped === "no-devices") {
    return NextResponse.json(
      {
        ok: false,
        message:
          audience === "patient"
            ? "Ten klient nie ma włączonych powiadomień na żadnym urządzeniu."
            : "Żaden klient z tej grupy nie ma włączonych powiadomień.",
      },
      { status: 409 },
    );
  }
  if (result.sent === 0) {
    return NextResponse.json(
      { ok: false, message: result.error || "Nie udało się dostarczyć powiadomienia." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, sent: result.sent, devices: result.devices });
}
