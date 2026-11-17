import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole, scopedLocationWhere } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";
import { CONSENT_DOCUMENT_MAX_BYTES, detectConsentDocumentMime, safeDocumentName } from "@/lib/consent-document";
import { encryptBytes } from "@/lib/data-encryption";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "MANAGER", "RECEPTION"];

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

// Zgoda marketingowa pacjenta wyrażona na recepcji (papierowy dokument): stan zgody i lista wgranych skanów.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ROLES);
  if (deny) return deny;

  const patient = await prisma.patient.findFirst({ where: { id: params.id, ...scopedLocationWhere(user!) }, select: { id: true } });
  if (!patient) return bad("Nie znaleziono pacjenta", 404);

  const [consent, documents] = await Promise.all([
    prisma.patientConsent.findUnique({ where: { patientId_type: { patientId: patient.id, type: "MARKETING" } } }),
    prisma.patientConsentDocument.findMany({
      where: { patientId: patient.id, type: "MARKETING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    marketing: {
      granted: consent?.granted ?? false,
      grantedAt: consent?.grantedAt?.toISOString() ?? null,
      revokedAt: consent?.revokedAt?.toISOString() ?? null,
    },
    documents: documents.map((doc) => ({ ...doc, createdAt: doc.createdAt.toISOString() })),
  });
}

// Zapis zgody marketingowej przez recepcję (multipart: granted = "true" | "false", file = opcjonalny skan).
// Zmiana trafia do historii zgód pacjenta (z oznaczeniem „recepcja / dokument papierowy”) i do dziennika zdarzeń.
// Można też samo dołączyć skan do już udzielonej zgody (bez zmiany jej stanu).
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ROLES);
  if (deny) return deny;

  const patient = await prisma.patient.findFirst({
    where: { id: params.id, ...scopedLocationWhere(user!) },
    select: { id: true, name: true },
  });
  if (!patient) return bad("Nie znaleziono pacjenta", 404);

  const form = await req.formData().catch(() => null);
  if (!form) return bad("Niepoprawne dane");
  const grantedRaw = String(form.get("granted") ?? "");
  if (grantedRaw !== "true" && grantedRaw !== "false") return bad("Niepoprawne dane");
  const granted = grantedRaw === "true";

  let file: { bytes: Uint8Array; mime: NonNullable<ReturnType<typeof detectConsentDocumentMime>>; name: string } | null = null;
  const upload = form.get("file");
  if (upload instanceof Blob && upload.size > 0) {
    if (upload.size > CONSENT_DOCUMENT_MAX_BYTES) return bad("Plik jest za duży (maksymalnie 6 MB)", 413);
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const mime = detectConsentDocumentMime(bytes);
    if (!mime) return bad("Dozwolone są skany w formacie PDF, JPG, PNG, GIF i WebP");
    file = { bytes, mime, name: safeDocumentName(upload instanceof File ? upload.name : "zgoda", mime) };
  }

  const existing = await prisma.patientConsent.findUnique({
    where: { patientId_type: { patientId: patient.id, type: "MARKETING" } },
    select: { granted: true },
  });
  const changed = (existing?.granted ?? false) !== granted || (!existing && granted);
  if (!changed && !file) return NextResponse.json({ ok: true, unchanged: true });

  const now = new Date();
  const operations = [];
  if (changed) {
    operations.push(
      prisma.patientConsent.upsert({
        where: { patientId_type: { patientId: patient.id, type: "MARKETING" } },
        create: {
          patientId: patient.id,
          type: "MARKETING",
          granted,
          grantedAt: granted ? now : null,
          revokedAt: granted ? null : now,
        },
        update: {
          granted,
          ...(granted ? { grantedAt: now, revokedAt: null } : { revokedAt: now }),
        },
      }),
      prisma.patientConsentEvent.create({
        data: { patientId: patient.id, type: "MARKETING", granted, channel: "PAPER", recordedById: user!.id },
      }),
    );
  }
  if (file) {
    operations.push(
      prisma.patientConsentDocument.create({
        data: {
          patientId: patient.id,
          type: "MARKETING",
          fileName: file.name,
          mimeType: file.mime,
          size: file.bytes.length,
          data: encryptBytes(file.bytes),
          uploadedById: user!.id,
        },
        select: { id: true },
      }),
    );
  }
  await prisma.$transaction(operations);

  await logAudit({
    actorId: user!.id,
    action: "CONSENT",
    entity: "PatientConsent",
    entityId: patient.id,
    summary: changed
      ? `Zgoda marketingowa pacjenta ${patient.name}: ${granted ? "wyrażona" : "wycofana"} na recepcji (dokument papierowy)${file ? ", dołączono skan" : ""}`
      : `Dołączono skan zgody marketingowej pacjenta ${patient.name}`,
    data: { type: "MARKETING", granted, previouslyGranted: existing?.granted ?? null, via: "reception", scanAttached: Boolean(file) },
  });

  return NextResponse.json({ ok: true, changed, scanAttached: Boolean(file) });
}
