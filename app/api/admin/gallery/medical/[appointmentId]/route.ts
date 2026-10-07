import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";
import { dataUrlToImageResponse } from "@/lib/data-url-response";

// Podgląd zdjęcia przed/po (?slot=before|after) w galerii — tylko administrator,
// tylko odczyt. Zdjęcia to dokumentacja medyczna: celowo NIE MA tu metody usuwania.
export async function GET(req: Request, props: { params: Promise<{ appointmentId: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const slot = new URL(req.url).searchParams.get("slot");
  if (slot !== "before" && slot !== "after") {
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
  }

  const where = { id: params.appointmentId, deletedAt: null };
  const photo =
    slot === "before"
      ? (await prisma.appointment.findFirst({ where, select: { photoBefore: true } }))?.photoBefore
      : (await prisma.appointment.findFirst({ where, select: { photoAfter: true } }))?.photoAfter;

  const response = dataUrlToImageResponse(photo);
  // Dane medyczne: bez cache'owania po stronie przeglądarki i proxy.
  response.headers.set("cache-control", "private, no-store");
  return response;
}
