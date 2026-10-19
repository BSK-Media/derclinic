import { NextResponse } from "next/server";
import { gunzipSync } from "node:zlib";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { requireStepUp } from "@/lib/mfa";
import { logAudit } from "@/lib/audit";
import {
  applyBooksyPlan,
  loadExistingState,
  planBooksyImport,
  previewSegments,
  type ServiceDecisions,
} from "@/lib/booksy-import-runner";
import { getRfmSettings } from "@/lib/rfm-settings";
import { loadRfm } from "@/lib/rfm-data";
import { syncRfmLists } from "@/lib/rfm-lists";
import { RFM_SEGMENT_LABELS, RFM_SEGMENT_ORDER } from "@/lib/rfm";

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

    let decisions: ServiceDecisions = {};
    const rawDecisions = form.get("decisions");
    if (typeof rawDecisions === "string" && rawDecisions) {
      const parsed = JSON.parse(rawDecisions) as unknown;
      if (parsed && typeof parsed === "object") {
        decisions = Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string")) as ServiceDecisions;
      }
    }

    const state = await loadExistingState(prisma);
    const plan = planBooksyImport({ clientsCsv, appointmentsCsv }, state, new Date(), decisions);
    const rfm = await getRfmSettings();

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
      // Zaimportowani pacjenci od razu trafiają do segmentów RFM i na automatyczne listy newslettera.
      await syncRfmLists(user!.id).catch(() => undefined);
    }

    let segmentsAfter: { segment: string; label: string; count: number }[] | null = null;
    if (applied) {
      const { scored } = await loadRfm(null);
      segmentsAfter = RFM_SEGMENT_ORDER.map((segment) => ({
        segment,
        label: RFM_SEGMENT_LABELS[segment].label,
        count: scored.filter((r) => r.segment === segment).length,
      }));
    }

    return NextResponse.json({
      ok: true,
      applied,
      summary: plan.summary,
      serviceMapping: plan.serviceMapping,
      services: state.services.sort((a, b) => a.name.localeCompare(b.name, "pl")),
      staffers: plan.staffers,
      segmentsPreview: previewSegments(plan, rfm.windowDays, { thresholds: rfm.thresholds }),
      segmentsAfter,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Import nie powiódł się" }, { status: 500 });
  }
}
