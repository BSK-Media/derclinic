import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { requireStepUp } from "@/lib/mfa";
import { appBaseUrl } from "@/lib/email-notifications";
import { decidePaymentRequest } from "@/lib/payment-request-server";

const BodySchema = z
  .object({
    action: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().max(300).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.action === "REJECT" && (!value.reason || value.reason.length < 3)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Podaj powód odrzucenia płatności" });
    }
  });

// Potwierdzenie wpłaty (administrator dostał pieniądze) albo odrzucenie
// zgłoszenia. Potwierdzenie tworzy zwykłą płatność przy wizycie.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;
  // Uznanie wpłaty = ruch pieniędzy w systemie: ponowne potwierdzenie MFA.
  const stepUp = requireStepUp(user!);
  if (stepUp) return stepUp;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Niepoprawne dane" }, { status: 400 });
  }

  const result = await decidePaymentRequest(params.id, {
    action: parsed.data.action,
    reason: parsed.data.reason || null,
    actorId: user!.id,
    baseUrl: appBaseUrl(req),
    actorLocationId: user!.role === "ADMIN" ? null : user!.locationId,
  });
  if (!result.ok) return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  return NextResponse.json({ ok: true });
}
