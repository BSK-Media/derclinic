import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";

// Pobranie pliku z podpisaną zgodą (?submissionId=…) — dokumentacja medyczna,
// tylko dla personelu, bez cache'owania.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION"]);
  if (deny) return deny;

  const submissionId = new URL(req.url).searchParams.get("submissionId");
  if (!submissionId) return NextResponse.json({ ok: false, message: "Brak pliku" }, { status: 400 });

  const submission = await prisma.procedureConsentSubmission.findFirst({
    where: {
      id: submissionId,
      appointmentId: params.id,
      appointment: user!.locationScopeId ? { locationId: user!.locationScopeId } : undefined,
    },
    select: { data: true, mimeType: true, fileName: true },
  });
  if (!submission) return NextResponse.json({ ok: false, message: "Nie znaleziono pliku" }, { status: 404 });

  const safeName = submission.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 100) || "zgoda.pdf";
  return new NextResponse(new Uint8Array(submission.data), {
    headers: {
      "Content-Type": submission.mimeType === "application/pdf" ? "application/pdf" : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
