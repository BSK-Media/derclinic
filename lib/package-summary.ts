import type { Prisma } from "@prisma/client";
import { benefitStatus, packageItemsLeft } from "@/lib/vouchers";

// Wspólne wczytywanie i opis pakietu (kupujący, posiadacz, pozycje z pozostałymi zabiegami) dla API.

export const PACKAGE_PERSON_SELECT = { id: true, name: true, phone: true } as const;

export const PACKAGE_INCLUDE = {
  patient: { select: PACKAGE_PERSON_SELECT },
  holder: { select: PACKAGE_PERSON_SELECT },
  items: { orderBy: { position: "asc" }, include: { service: { select: { id: true, name: true } } } },
  payments: { select: { id: true, packageSessions: true, patientPackageItemId: true, appointmentId: true } },
} satisfies Prisma.PatientPackageInclude;

export type PackageWithItems = Prisma.PatientPackageGetPayload<{ include: typeof PACKAGE_INCLUDE }>;

/** Pozycje z pozostałymi zabiegami, łączna liczba pozostałych zabiegów i status pakietu. */
export function summarizePackage(
  p: PackageWithItems,
  options: { now?: Date; excludePaymentIds?: string[] } = {},
) {
  const payments = options.excludePaymentIds ? p.payments.filter((x) => !options.excludePaymentIds!.includes(x.id)) : p.payments;
  const items = packageItemsLeft(
    p.items.map((item) => ({
      id: item.id,
      serviceId: item.serviceId,
      serviceName: item.service?.name ?? null,
      sessions: item.sessions,
    })),
    payments,
  );
  const sessionsLeft = items.reduce((sum, item) => sum + item.left, 0);
  return {
    items,
    sessionsLeft,
    servicesLabel: items.map((item) => `${item.serviceName ?? "dowolna usługa"} ×${item.sessions}`).join(", "),
    status: benefitStatus({ canceledAt: p.canceledAt, expiresAt: p.expiresAt, remaining: sessionsLeft, now: options.now }),
  };
}
