import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { decryptBytes } from "@/lib/data-encryption";

export const dynamic = "force-dynamic";

// Pobranie skanu zgody pacjenta. Plik jest zaszyfrowany w bazie, a odpowiedź nie trafia do współdzielonych
// pamięci podręcznych. Otwarcie skanu trafia do dziennika zdarzeń (dokument zawiera dane osobowe).
export async function GET(_req: Request, props: { params: Promise<{ id: string; docId: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const doc = await prisma.patientConsentDocument.findFirst({
    where: { id: params.docId, patientId: params.id, patient: scopedLocationWhere(user!) },
    select: { id: true, fileName: true, mimeType: true, data: true },
  });
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const bytes = decryptBytes(doc.data);
  if (!bytes) return new NextResponse("Not found", { status: 404 });

  await logAudit({
    actorId: user!.id,
    action: "READ",
    entity: "PatientConsentDocument",
    entityId: doc.id,
    summary: `Otwarcie skanu zgody pacjenta (${doc.fileName})`,
  });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src data:; object-src 'self'; sandbox",
    },
  });
}
