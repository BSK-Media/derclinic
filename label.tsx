import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  const patients = await prisma.patient.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ ok: true, patients });
}

const CreateSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  note: z.string().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireRole(user!.role, ["ADMIN", "RECEPTION"]);
  if (deny) return deny;

  const json = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const p = await prisma.patient.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone ? parsed.data.phone : null,
      email: parsed.data.email ? parsed.data.email : null,
      note: parsed.data.note ? parsed.data.note : null,
    },
  });

  await logAudit({ actorId: user!.id, action: "CREATE", entity: "Patient", entityId: p.id });

  return NextResponse.json({ ok: true, patient: p });
}
