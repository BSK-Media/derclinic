import { NextResponse } from "next/server";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { appBaseUrl, sendDueReminders } from "@/lib/email-notifications";

export const maxDuration = 60;

// Ręczne uruchomienie przypomnień o jutrzejszych wizytach — to samo, co robi
// codzienny harmonogram (/api/cron/email-reminders). Bezpieczne do powtarzania:
// przypomnienie o danej wizycie nie pójdzie dwa razy.
export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const summary = await sendDueReminders({ baseUrl: appBaseUrl(req), budgetMs: 50_000 });

  await logAudit({
    actorId: user!.id,
    action: "EMAIL_REMINDERS",
    entity: "Email",
    summary: `Ręczna wysyłka przypomnień o jutrzejszych wizytach: wysłano ${summary.sent}, błędów ${summary.failed} (wizyt z adresem e-mail: ${summary.due})`,
    data: summary,
  });

  return NextResponse.json({ ok: true, ...summary });
}
