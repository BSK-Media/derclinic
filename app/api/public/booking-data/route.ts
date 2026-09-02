import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Wewnętrzna usługa używana do blokowania czasu w kalendarzu — nigdy nie
// pokazujemy jej w publicznym formularzu rezerwacji.
const RESERVATION_SERVICE_NAME = "__DERCLINIC_REZERWACJA_CZASU__";

export async function GET() {
  const [locations, specialists, services] = await Promise.all([
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { role: "SPECIALIST", isVisible: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        jobTitle: true,
        specialization: true,
        avatarUrl: true,
        locationId: true,
        assignedServices: { select: { serviceId: true } },
      },
    }),
    prisma.service.findMany({
      where: { name: { not: RESERVATION_SERVICE_NAME } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        category: true,
        categoryColor: true,
        description: true,
        durationMin: true,
        price: true,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    locations,
    specialists: specialists.map((s) => ({
      id: s.id,
      name: s.name,
      jobTitle: s.jobTitle,
      specialization: s.specialization,
      avatarUrl: s.avatarUrl,
      locationId: s.locationId,
      serviceIds: s.assignedServices.map((a) => a.serviceId),
    })),
    services,
  });
}
