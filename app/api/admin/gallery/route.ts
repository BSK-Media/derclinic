import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, requireStrictRole } from "@/lib/api-helpers";

const MEDICAL_LIMIT = 300;

// Galeria zdjęć w systemie (tylko administrator). Trzy rodzaje:
//  * medical    — zdjęcia przed/po zabiegu z kart wizyt: DOKUMENTACJA MEDYCZNA,
//                 w galerii tylko do podglądu — nie wolno ich usuwać,
//  * newsletter — zdjęcia wgrane w edytorze newslettera (można usunąć),
//  * avatars    — zdjęcia profilowe pracowników (można usunąć).
// Lista zwraca wyłącznie metadane; same obrazy ładują się osobnymi żądaniami.
export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  const deny = requireStrictRole(user!.role, ["ADMIN"]);
  if (deny) return deny;

  const appointmentSelect = {
    id: true,
    startsAt: true,
    patient: { select: { id: true, name: true } },
    customServiceName: true,
    service: { select: { name: true } },
  } as const;

  // Sprawdzamy tylko, czy zdjęcie istnieje — bez ładowania wielomegabajtowej treści.
  const [withBefore, withAfter, beforeCount, afterCount, images, avatars, campaigns] = await Promise.all([
    prisma.appointment.findMany({
      where: { photoBefore: { not: null }, deletedAt: null },
      orderBy: { startsAt: "desc" },
      take: MEDICAL_LIMIT,
      select: appointmentSelect,
    }),
    prisma.appointment.findMany({
      where: { photoAfter: { not: null }, deletedAt: null },
      orderBy: { startsAt: "desc" },
      take: MEDICAL_LIMIT,
      select: appointmentSelect,
    }),
    prisma.appointment.count({ where: { photoBefore: { not: null }, deletedAt: null } }),
    prisma.appointment.count({ where: { photoAfter: { not: null }, deletedAt: null } }),
    prisma.newsletterImage.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, size: true, mimeType: true },
    }),
    prisma.user.findMany({
      where: { avatarUrl: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, login: true },
    }),
    prisma.newsletterCampaign.findMany({ select: { id: true, subject: true, html: true } }),
  ]);

  const medical = [
    ...withBefore.map((a) => ({ a, slot: "before" as const })),
    ...withAfter.map((a) => ({ a, slot: "after" as const })),
  ]
    .sort((x, y) => y.a.startsAt.getTime() - x.a.startsAt.getTime())
    .map(({ a, slot }) => ({
      key: `${a.id}:${slot}`,
      appointmentId: a.id,
      slot,
      takenAt: a.startsAt,
      patientId: a.patient.id,
      patientName: a.patient.name,
      serviceName: a.customServiceName || a.service.name,
    }));

  return NextResponse.json({
    ok: true,
    medical,
    medicalTotal: beforeCount + afterCount,
    medicalLimit: MEDICAL_LIMIT,
    newsletter: images.map((image) => ({
      id: image.id,
      createdAt: image.createdAt,
      size: image.size,
      mimeType: image.mimeType,
      // Wiadomości, w których to zdjęcie jest użyte — usunięcie zepsułoby je w już wysłanych mailach.
      usedIn: campaigns
        .filter((campaign) => campaign.html.includes(image.id))
        .map((campaign) => ({ id: campaign.id, subject: campaign.subject })),
    })),
    avatars,
  });
}
