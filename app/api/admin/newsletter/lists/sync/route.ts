import { NextResponse } from "next/server";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { syncRfmLists } from "@/lib/rfm-lists";

// Ręczne przeliczenie list automatycznych (segmenty RFM) — to samo, co robi się codziennie i tuż przed wysyłką.
export async function POST() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER"]);
  if (deny) return deny;
  const results = await syncRfmLists(user!.id);
  return NextResponse.json({ ok: true, results });
}
