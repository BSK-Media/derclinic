import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendTrackedEmail } from "@/lib/email-notifications";
import { paymentDecisionEmail } from "@/lib/email-templates";
import { pushContent, sendPushToPatient, sendPushToStaff } from "@/lib/push";
import { formatPLNFromGrosze } from "@/lib/money";
import {
  PAYMENT_METHOD_LABELS,
  appointmentIdFromPaymentToken,
  generatePaymentReference,
  isValidPolishAccount,
  normalizeAccount,
  paymentPageUrl,
  type PaymentMethodKey,
} from "@/lib/payment-request";

const SETTINGS_ID = "default";

export type PaymentSettingsValue = {
  recipientName: string | null;
  bankName: string | null;
  bankAccount: string | null;
  blikPhone: string | null;
  note: string | null;
};

export async function getPaymentSettings(): Promise<PaymentSettingsValue> {
  const row = await prisma.paymentSettings.findUnique({ where: { id: SETTINGS_ID } });
  return {
    recipientName: row?.recipientName ?? null,
    bankName: row?.bankName ?? null,
    bankAccount: row?.bankAccount ?? null,
    blikPhone: row?.blikPhone ?? null,
    note: row?.note ?? null,
  };
}

/** Które metody klient może wybrać (zależnie od uzupełnionych danych w Ustawieniach). */
export function availableMethods(settings: PaymentSettingsValue): Record<PaymentMethodKey, boolean> {
  return {
    P24: false, // integracja z Przelewy24 — w przygotowaniu
    BLIK: Boolean(settings.blikPhone),
    TRANSFER: Boolean(settings.bankAccount && settings.recipientName && isValidPolishAccount(settings.bankAccount)),
  };
}

export async function savePaymentSettings(value: PaymentSettingsValue) {
  const data = {
    ...value,
    bankAccount: value.bankAccount ? normalizeAccount(value.bankAccount) : null,
  };
  await prisma.paymentSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
}

/** Tworzy zamówioną płatność przy rezerwacji (w transakcji rezerwacji). */
export async function createPaymentRequest(
  tx: Prisma.TransactionClient,
  input: { appointmentId: string; amount: number; choice: string },
) {
  let reference = generatePaymentReference();
  // 32^6 kombinacji — kolizja praktycznie niemożliwa, ale sprawdzamy.
  for (let i = 0; i < 5 && (await tx.paymentRequest.findUnique({ where: { reference }, select: { id: true } })); i++) {
    reference = generatePaymentReference();
  }
  return tx.paymentRequest.create({
    data: { appointmentId: input.appointmentId, amount: input.amount, choice: input.choice, reference },
    select: { id: true, reference: true, amount: true },
  });
}

const paymentAppointmentSelect = {
  id: true,
  startsAt: true,
  status: true,
  locationId: true,
  customServiceName: true,
  patient: { select: { id: true, name: true, email: true } },
  specialist: { select: { name: true } },
  service: { select: { name: true } },
  location: { select: { name: true } },
  paymentRequests: { orderBy: { createdAt: "desc" as const }, take: 1 },
} as const;

/** Wizyta wskazana tokenem z linku do płatności wraz z jej bieżącą płatnością. */
export async function appointmentForPaymentToken(token: string) {
  const id = appointmentIdFromPaymentToken(token);
  if (!id) return null;
  const appointment = await prisma.appointment.findFirst({ where: { id, deletedAt: null }, select: paymentAppointmentSelect });
  if (!appointment) return null;
  const { paymentRequests, ...rest } = appointment;
  return { ...rest, request: paymentRequests[0] ?? null };
}

export type PaymentAppointment = NonNullable<Awaited<ReturnType<typeof appointmentForPaymentToken>>>;

/** Klient kliknął „Dokonałem płatności”: wniosek czeka na potwierdzenie administratora. */
export async function claimPayment(appointment: PaymentAppointment) {
  const request = appointment.request;
  if (!request || !request.method) return { ok: false as const, message: "Najpierw wybierz metodę płatności." };
  if (request.status === "CLAIMED") return { ok: true as const, alreadyClaimed: true };
  if (request.status !== "AWAITING" && request.status !== "REJECTED") {
    return { ok: false as const, message: "Ta płatność została już rozliczona." };
  }

  await prisma.paymentRequest.update({
    where: { id: request.id },
    data: { status: "CLAIMED", claimedAt: new Date(), rejectionReason: null },
  });

  const amountText = formatPLNFromGrosze(request.amount);
  await logAudit({
    actor: { type: "PATIENT", id: appointment.patient.id, name: appointment.patient.name },
    action: "UPDATE",
    entity: "PaymentRequest",
    entityId: request.id,
    summary: `Klient zgłosił płatność ${amountText} (${PAYMENT_METHOD_LABELS[request.method as PaymentMethodKey] ?? request.method}), tytuł ${request.reference} — czeka na potwierdzenie`,
    data: { appointmentId: appointment.id, amount: request.amount, method: request.method, reference: request.reference },
  });

  // Powiadomienie dla administratora i managera tej lokalizacji (potwierdzają wpłaty).
  const staff = await prisma.user.findMany({
    where: { OR: [{ role: "ADMIN" }, { role: "MANAGER", locationId: appointment.locationId ?? undefined }] },
    select: { id: true },
  });
  await sendPushToStaff(
    staff.map((member) => member.id),
    pushContent.staffPaymentClaimed(appointment.patient.name, amountText, request.reference),
    { type: "STAFF_PAYMENT_CLAIMED", recipientLabel: "Personel", appointmentId: appointment.id, patientId: appointment.patient.id },
  );
  return { ok: true as const, alreadyClaimed: false };
}

/** Decyzja administratora: potwierdzenie wpłaty (powstaje Payment) albo odrzucenie. */
export async function decidePaymentRequest(
  requestId: string,
  decision: {
    action: "APPROVE" | "REJECT";
    reason?: string | null;
    actorId: string;
    baseUrl: string;
    // Manager: tylko płatności z własnej lokalizacji (null = administrator, bez ograniczenia).
    actorLocationId?: string | null;
  },
) {
  const request = await prisma.paymentRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      amount: true,
      method: true,
      reference: true,
      status: true,
      appointmentId: true,
      appointment: { select: paymentAppointmentSelect },
    },
  });
  if (!request) return { ok: false as const, status: 404, message: "Nie znaleziono płatności" };
  if (decision.actorLocationId && request.appointment.locationId !== decision.actorLocationId) {
    return { ok: false as const, status: 403, message: "Ta płatność dotyczy innej lokalizacji." };
  }
  if (request.status === "CONFIRMED") return { ok: false as const, status: 409, message: "Ta płatność jest już potwierdzona." };
  if (request.status === "REJECTED" && decision.action === "REJECT") {
    return { ok: false as const, status: 409, message: "Ta płatność jest już odrzucona." };
  }
  const approve = decision.action === "APPROVE";
  if (approve && request.method !== "BLIK" && request.method !== "TRANSFER") {
    return { ok: false as const, status: 400, message: "Klient nie wybrał metody płatności." };
  }

  const amountText = formatPLNFromGrosze(request.amount);
  await prisma.$transaction(async (tx) => {
    let paymentId: string | null = null;
    if (approve) {
      const payment = await tx.payment.create({
        data: { method: request.method as "BLIK" | "TRANSFER", amount: request.amount, appointmentId: request.appointmentId },
        select: { id: true },
      });
      paymentId = payment.id;
    }
    await tx.paymentRequest.update({
      where: { id: request.id },
      data: {
        status: approve ? "CONFIRMED" : "REJECTED",
        decidedAt: new Date(),
        decidedById: decision.actorId,
        rejectionReason: approve ? null : decision.reason || null,
        paymentId,
      },
    });
    await logAudit({
      tx,
      actorId: decision.actorId,
      action: "UPDATE",
      entity: "PaymentRequest",
      entityId: request.id,
      summary: approve
        ? `Potwierdzono wpłatę ${amountText} (${PAYMENT_METHOD_LABELS[request.method as PaymentMethodKey]}), tytuł ${request.reference}`
        : `Odrzucono zgłoszoną płatność ${amountText}, tytuł ${request.reference}; powód: ${decision.reason}`,
      data: { appointmentId: request.appointmentId, approve, reason: decision.reason ?? null, paymentId },
    });
  });

  // Powiadomienie klienta (push + e-mail).
  const appointment = request.appointment;
  const payUrl = paymentPageUrl(decision.baseUrl, appointment.id);
  await sendPushToPatient(
    appointment.patient.id,
    pushContent.paymentDecision(approve, approve ? "/panel-klienta" : payUrl.replace(decision.baseUrl.replace(/\/+$/, ""), ""), decision.reason ?? null),
    { type: "PATIENT_PAYMENT_DECISION", recipientLabel: appointment.patient.name, appointmentId: appointment.id },
  );
  if (appointment.patient.email) {
    await sendTrackedEmail({
      ...paymentDecisionEmail(
        {
          patientName: appointment.patient.name,
          serviceName: appointment.customServiceName || appointment.service.name,
          specialistName: appointment.specialist.name,
          locationName: appointment.location?.name ?? null,
          startsAt: appointment.startsAt,
          amountText,
          reference: request.reference,
        },
        approve,
        decision.reason ?? null,
        payUrl,
        decision.baseUrl,
      ),
      type: "PATIENT_PAYMENT_DECISION",
      to: appointment.patient.email,
      appointmentId: appointment.id,
      patientId: appointment.patient.id,
    });
  }
  return { ok: true as const };
}

/** Powiadomienie dla administratora i managera o zgłoszonej płatności (po utworzeniu wizyty z płatnością). */
export async function notifyPaymentClaimedById(requestId: string) {
  const request = await prisma.paymentRequest.findUnique({
    where: { id: requestId },
    select: {
      amount: true,
      reference: true,
      appointmentId: true,
      appointment: { select: { locationId: true, patient: { select: { id: true, name: true } } } },
    },
  });
  if (!request) return;
  const staff = await prisma.user.findMany({
    where: { OR: [{ role: "ADMIN" }, { role: "MANAGER", locationId: request.appointment.locationId ?? undefined }] },
    select: { id: true },
  });
  await sendPushToStaff(
    staff.map((member) => member.id),
    pushContent.staffPaymentClaimed(request.appointment.patient.name, formatPLNFromGrosze(request.amount), request.reference),
    {
      type: "STAFF_PAYMENT_CLAIMED",
      recipientLabel: "Personel",
      appointmentId: request.appointmentId,
      patientId: request.appointment.patient.id,
    },
  );
}
