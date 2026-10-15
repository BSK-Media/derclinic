import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncRfmLists } from "@/lib/rfm-lists";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Codzienne przeliczenie automatycznych list newslettera (segmenty RFM): pacjent, który zmienił segment,
// znika z poprzedniej listy i pojawia się w nowej. Zmiany trafiają do dziennika zdarzeń.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Brak zmiennej CRON_SECRET" }, { status: 503 });
  }
  if (!authorized(req)) return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });
  const results = await syncRfmLists();
  return NextResponse.json({ ok: true, results });
}
