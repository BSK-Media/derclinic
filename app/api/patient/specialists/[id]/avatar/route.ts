import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPatientAuth } from "@/lib/patient-auth";
import { dataUrlToImageResponse } from "@/lib/data-url-response";

// Zdjęcie profilowe specjalisty dla panelu klienta (strona zabiegu i profil
// specjalisty). Tylko specjaliści widoczni dla pacjentów.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getPatientAuth();
  if (!auth) return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });

  const specialist = await prisma.user.findFirst({
    where: { id: params.id, role: "SPECIALIST", isVisible: true },
    select: { avatarUrl: true },
  });

  return dataUrlToImageResponse(specialist?.avatarUrl);
}
