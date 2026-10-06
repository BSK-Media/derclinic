import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPatientAuth } from "@/lib/patient-auth";
import { buildIcs, googleCalendarUrl, type CalendarEvent } from "@/lib/calendar-links";

// Dodanie własnej, nadchodzącej wizyty do kalendarza klienta.
//  * domyślnie plik .ics — na iPhonie Safari pokazuje od razu okno „Dodaj do
//    kalendarza", na Androidzie plik otwiera się w aplikacji Kalendarz,
//  * ?format=google — przekierowanie do Google Kalendarza (wygodniejsze na Androidzie).
// Wizyta jest pobierana wyłącznie po (id, patientId) zalogowanego klienta.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await getPatientAuth();
  if (!auth) return NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });

  const appointment = await prisma.appointment.findFirst({
    where: { id: params.id, patientId: auth.id, deletedAt: null, status: { not: "CANCELED" } },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      updatedAt: true,
      customServiceName: true,
      service: { select: { name: true } },
      specialist: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
  if (!appointment) return NextResponse.json({ ok: false, message: "Nie znaleziono wizyty" }, { status: 404 });

  const serviceName = appointment.customServiceName || appointment.service.name;
  const event: CalendarEvent = {
    id: appointment.id,
    title: `${serviceName} — DerClinic`,
    description: `Specjalista: ${appointment.specialist.name}`,
    location: appointment.location?.name ? `DerClinic, ${appointment.location.name}` : "DerClinic",
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    updatedAt: appointment.updatedAt,
  };

  const format = new URL(req.url).searchParams.get("format");
  if (format === "google") return NextResponse.redirect(googleCalendarUrl(event));

  return new NextResponse(buildIcs(event), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // inline: iOS od razu proponuje dodanie do Kalendarza; nazwa pliku dla pozostałych.
      "Content-Disposition": 'inline; filename="wizyta-derclinic.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
