import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole, scopedLocationWhere } from "@/lib/api-helpers";

// Historia notatki (poprzednie treści) wizyty lub pacjenta — tylko dla osób, które mają dostęp
// do danego rekordu. Treść jest odszyfrowywana przez warstwę Prisma.
export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = await requireRole(user!.role, ["ADMIN", "MANAGER", "RECEPTION", "SPECIALIST"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const entity = url.searchParams.get("entity");
  const id = url.searchParams.get("id") ?? "";
  if ((entity !== "APPOINTMENT" && entity !== "PATIENT") || !id) {
    return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
  }

  if (entity === "APPOINTMENT") {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id,
        ...(user!.role === "SPECIALIST" ? { specialistId: user!.id } : scopedLocationWhere(user!)),
      },
      select: { id: true },
    });
    if (!appointment) return NextResponse.json({ ok: false, message: "Nie znaleziono" }, { status: 404 });
  } else {
    if (user!.role === "SPECIALIST") return NextResponse.json({ ok: false, message: "Brak uprawnień" }, { status: 403 });
    const patient = await prisma.patient.findFirst({ where: { id, ...scopedLocationWhere(user!) }, select: { id: true } });
    if (!patient) return NextResponse.json({ ok: false, message: "Nie znaleziono" }, { status: 404 });
  }

  const versions = await prisma.noteVersion.findMany({
    where: { entity, entityId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const authors = await prisma.user.findMany({
    where: { id: { in: [...new Set(versions.map((v) => v.createdById).filter((v): v is string => Boolean(v)))] } },
    select: { id: true, name: true },
  });
  const names = new Map(authors.map((a) => [a.id, a.name]));

  return NextResponse.json({
    ok: true,
    versions: versions.map((v) => ({
      id: v.id,
      createdAt: v.createdAt,
      note: v.note,
      changedBy: v.createdById ? (names.get(v.createdById) ?? null) : null,
    })),
  });
}
