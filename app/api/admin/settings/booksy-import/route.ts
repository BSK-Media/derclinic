import { NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { requireStepUp } from "@/lib/mfa";
import { logAudit } from "@/lib/audit";
import { applyBooksyPlan, loadExistingState, planBooksyImport } from "@/lib/booksy-import-runner";

// TYMCZASOWE: jednorazowy import historii z Booksy (klienci i wizyty). Tylko administrator.
// Pliki CSV przychodzą spakowane (gzip) z przeglądarki, żeby zmieściły się w limicie żądania.
// Bez pola apply=1 to jest PRÓBA — nic nie zapisuje; zapis wymaga ponownego potwierdzenia MFA.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const LOCATION_ID = "grodzisk-mazowiecki";

async function readCsv(file: FormDataEntryValue | null): Promise<string> {
  if (!(file instanceof Blob)) throw new Error("Brak pliku CSV");
  const buffer = Buffer.from(await file.arrayBuffer());
  const raw = buffer[0] === 0x1f && buffer[1] === 0x8b ? gunzipSync(buffer) : buffer;
  return raw.toString("utf8");
}

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, message: "Niepoprawne żądanie" }, { status: 400 });
  const apply = form.get("apply") === "1";
  if (apply) {
    const stepUp = requireStepUp(user!);
    if (stepUp) return stepUp;
  }

  try {
    const clientsCsv = await readCsv(form.get("clients"));
    const appointmentsCsv = await readCsv(form.get("appointments"));
    if (!clientsCsv.includes("client_card_id") || !appointmentsCsv.includes("booking_id")) {
      return NextResponse.json({ ok: false, message: "To nie wyglądają na pliki clients.csv i appointments.csv z Booksy" }, { status: 400 });
    }

    const location = await prisma.location.findUnique({ where: { id: LOCATION_ID }, select: { id: true } });
    if (!location) return NextResponse.json({ ok: false, message: `Brak lokalizacji „${LOCATION_ID}”` }, { status: 409 });

    const state = await loadExistingState(prisma);
    const plan = planBooksyImport({ clientsCsv, appointmentsCsv }, state);

    let applied: Awaited<ReturnType<typeof applyBooksyPlan>> | null = null;
    if (apply) {
      applied = await applyBooksyPlan(prisma, plan, LOCATION_ID);
      await logAudit({
        actorId: user!.id,
        action: "CREATE",
        entity: "BooksyImport",
        entityId: "booksy",
        summary: `Import z Booksy: pacjenci ${applied.patientsDone}, wizyty ${applied.appointmentsDone}, płatności ${applied.paymentsDone}, konta archiwalne ${applied.archivalUsers}`,
        data: { ...applied, summary: plan.summary },
      });
    }

    return NextResponse.json({
      ok: true,
      applied,
      summary: plan.summary,
      serviceMapping: plan.serviceMapping.slice(0, 80),
      staffers: plan.staffers,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Import nie powiódł się" }, { status: 500 });
  }
}
