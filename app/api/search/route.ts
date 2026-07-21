import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/api-helpers";
import {
  hasSidebarPermission,
  type SidebarPermission,
} from "@/lib/sidebar-permissions";

export const dynamic = "force-dynamic";

const LIMIT = 5;

type SearchItem = {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

type SearchGroup = { key: string; label: string; items: SearchItem[] };

export async function GET(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, groups: [] });

  const contains = { contains: q, mode: "insensitive" as const };
  const can = (permission: SidebarPermission) =>
    hasSidebarPermission(user!.role, user!.sidebarPermissions, permission);

  const groups: SearchGroup[] = [];

  // ── SPECJALISTA: wyszukiwanie tylko własnych wizyt ─────────────────────
  if (user!.role === "SPECIALIST") {
    const appointments = await prisma.appointment.findMany({
      where: {
        specialistId: user!.id,
        deletedAt: null,
        OR: [
          { patient: { name: contains } },
          { service: { name: contains } },
          { customServiceName: contains },
        ],
      },
      select: {
        id: true,
        startsAt: true,
        customServiceName: true,
        patient: { select: { name: true } },
        service: { select: { name: true } },
      },
      orderBy: { startsAt: "desc" },
      take: 8,
    });
    if (appointments.length > 0) {
      groups.push({
        key: "appointments",
        label: "Wizyty",
        items: appointments.map((a: (typeof appointments)[number]) => ({
          id: a.id,
          title: `${a.patient.name} • ${a.customServiceName || a.service.name}`,
          subtitle: new Date(a.startsAt).toLocaleString("pl-PL", {
            dateStyle: "short",
            timeStyle: "short",
          }),
          href: `/specialist/appointments/${a.id}`,
        })),
      });
    }
    return NextResponse.json({ ok: true, groups });
  }

  // ── ADMIN / RECEPCJA: kategorie zgodne z uprawnieniami sidebara ────────
  const [patients, appointments, specialists, products, services, warehouses, locations] =
    await Promise.all([
      can("patients")
        ? prisma.patient.findMany({
            where: { OR: [{ name: contains }, { phone: contains }, { email: contains }] },
            select: { id: true, name: true, phone: true, email: true },
            orderBy: { name: "asc" },
            take: LIMIT,
          })
        : Promise.resolve([]),
      can("appointments")
        ? prisma.appointment.findMany({
            where: {
              deletedAt: null,
              OR: [
                { patient: { name: contains } },
                { service: { name: contains } },
                { customServiceName: contains },
                { specialist: { name: contains } },
              ],
            },
            select: {
              id: true,
              startsAt: true,
              customServiceName: true,
              patient: { select: { name: true } },
              service: { select: { name: true } },
              specialist: { select: { name: true } },
            },
            orderBy: { startsAt: "desc" },
            take: LIMIT,
          })
        : Promise.resolve([]),
      can("specialists")
        ? prisma.user.findMany({
            where: {
              role: "SPECIALIST",
              OR: [{ name: contains }, { email: contains }],
            },
            select: { id: true, name: true, email: true },
            orderBy: { name: "asc" },
            take: LIMIT,
          })
        : Promise.resolve([]),
      can("products")
        ? prisma.product.findMany({
            where: {
              OR: [
                { name: contains },
                { sku: contains },
                { ean: contains },
                { manufacturer: contains },
              ],
            },
            select: { id: true, name: true, manufacturer: true, sku: true },
            orderBy: { name: "asc" },
            take: LIMIT,
          })
        : Promise.resolve([]),
      can("services")
        ? prisma.service.findMany({
            where: { OR: [{ name: contains }, { category: contains }] },
            select: { id: true, name: true, category: true },
            orderBy: { name: "asc" },
            take: LIMIT,
          })
        : Promise.resolve([]),
      can("inventory")
        ? prisma.warehouse.findMany({
            where: { name: contains },
            select: { id: true, name: true, parent: { select: { name: true } } },
            orderBy: { name: "asc" },
            take: LIMIT,
          })
        : Promise.resolve([]),
      can("locations")
        ? prisma.location.findMany({
            where: { isActive: true, name: contains },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
            take: LIMIT,
          })
        : Promise.resolve([]),
    ]);

  if (patients.length > 0) {
    groups.push({
      key: "patients",
      label: "Pacjenci",
      items: patients.map((p: (typeof patients)[number]) => ({
        id: p.id,
        title: p.name,
        subtitle: [p.phone, p.email].filter(Boolean).join(" • ") || undefined,
        href: `/admin/patients/${p.id}`,
      })),
    });
  }
  if (appointments.length > 0) {
    groups.push({
      key: "appointments",
      label: "Wizyty",
      items: appointments.map((a: (typeof appointments)[number]) => ({
        id: a.id,
        title: `${a.patient.name} • ${a.customServiceName || a.service.name}`,
        subtitle: `${new Date(a.startsAt).toLocaleString("pl-PL", {
          dateStyle: "short",
          timeStyle: "short",
        })} • ${a.specialist.name}`,
        href: `/admin/appointments/${a.id}`,
      })),
    });
  }
  if (specialists.length > 0) {
    groups.push({
      key: "specialists",
      label: "Specjaliści",
      items: specialists.map((s: (typeof specialists)[number]) => ({
        id: s.id,
        title: s.name,
        subtitle: s.email ?? undefined,
        href: `/admin/specialists/${s.id}`,
      })),
    });
  }
  if (products.length > 0) {
    groups.push({
      key: "products",
      label: "Produkty",
      items: products.map((p: (typeof products)[number]) => ({
        id: p.id,
        title: p.name,
        subtitle: [p.manufacturer, p.sku].filter(Boolean).join(" • ") || undefined,
        href: `/admin/products/${p.id}`,
      })),
    });
  }
  if (services.length > 0) {
    groups.push({
      key: "services",
      label: "Zabiegi i procedury",
      items: services.map((s: (typeof services)[number]) => ({
        id: s.id,
        title: s.name,
        subtitle: s.category ?? undefined,
        href: `/admin/services/${s.id}`,
      })),
    });
  }
  if (warehouses.length > 0) {
    groups.push({
      key: "warehouses",
      label: "Magazyny",
      items: warehouses.map((w: (typeof warehouses)[number]) => ({
        id: w.id,
        title: w.name,
        subtitle: w.parent?.name ? `w: ${w.parent.name}` : undefined,
        href: `/admin/inventory/${w.id}`,
      })),
    });
  }
  if (locations.length > 0) {
    groups.push({
      key: "locations",
      label: "Lokalizacje",
      items: locations.map((location: (typeof locations)[number]) => ({
        id: location.id,
        title: location.name,
        subtitle: "Analityka lokalizacji",
        href: `/admin/locations/${location.id}`,
      })),
    });
  }

  return NextResponse.json({ ok: true, groups });
}
