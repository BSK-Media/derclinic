import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { requireStepUp } from "@/lib/mfa";
import { availableMethods, getPaymentSettings, savePaymentSettings } from "@/lib/payment-request-server";
import { isValidPolishAccount, normalizeAccount } from "@/lib/payment-request";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

const BodySchema = z.object({
  recipientName: optional(120),
  bankName: optional(120),
  bankAccount: optional(60),
  blikPhone: optional(30),
  note: optional(500),
});

// Dane do płatności ręczne (konto do przelewu, telefon BLIK) — tylko administrator.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const settings = await getPaymentSettings();
  return NextResponse.json({ ok: true, settings, available: availableMethods(settings) });
}

export async function PUT(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;
  // Numer konta, na który klienci wpłacają pieniądze = operacja wysokiego ryzyka: ponowne MFA.
  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }
  const value = parsed.data;

  if (value.bankAccount && !isValidPolishAccount(value.bankAccount)) {
    return NextResponse.json(
      { ok: false, message: "Niepoprawny numer konta — podaj 26 cyfr polskiego rachunku (z poprawną sumą kontrolną)." },
      { status: 400 },
    );
  }
  if (value.bankAccount && !value.recipientName) {
    return NextResponse.json({ ok: false, message: "Podaj nazwę odbiorcy przelewu." }, { status: 400 });
  }
  if (value.blikPhone && value.blikPhone.replace(/\D/g, "").replace(/^48(?=\d{9}$)/, "").length !== 9) {
    return NextResponse.json({ ok: false, message: "Numer telefonu BLIK musi mieć 9 cyfr." }, { status: 400 });
  }

  const before = await getPaymentSettings();
  await savePaymentSettings({
    recipientName: value.recipientName ?? null,
    bankName: value.bankName ?? null,
    bankAccount: value.bankAccount ? normalizeAccount(value.bankAccount) : null,
    blikPhone: value.blikPhone ? value.blikPhone.replace(/\D/g, "").replace(/^48(?=\d{9}$)/, "") : null,
    note: value.note ?? null,
  });

  await logAudit({
    actorId: user!.id,
    action: "UPDATE",
    entity: "PaymentSettings",
    entityId: "default",
    summary: "Zmieniono dane do płatności (konto do przelewu / telefon BLIK)",
    data: {
      accountChanged: (before.bankAccount ?? "") !== (value.bankAccount ? normalizeAccount(value.bankAccount) : ""),
      blikChanged: (before.blikPhone ?? "") !== (value.blikPhone ?? ""),
    },
  });

  const settings = await getPaymentSettings();
  return NextResponse.json({ ok: true, settings, available: availableMethods(settings) });
}
