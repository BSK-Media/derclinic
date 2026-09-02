import { prisma } from "@/lib/db";
import { PatientDetailsForm } from "@/components/patient-details-form";
import { PatientStatistics } from "@/components/patient-statistics";
import { PatientHistoryTabs } from "@/components/patient-history-tabs";
import { getEffectiveAuth } from "@/lib/effective-auth";

export default async function AdminPatientDetailPage({ params }: { params: { id: string } }) {
  const { user } = await getEffectiveAuth();
  const isAdmin = user?.role === "ADMIN";
  const patient = await prisma.patient.findUnique({ where: { id: params.id } });
  if (!patient) return <div className="p-6 text-sm">Nie znaleziono pacjenta.</div>;

  const [appts, sales] = await Promise.all([
    prisma.appointment.findMany({
      where: { patientId: params.id, deletedAt: null },
      orderBy: { startsAt: "desc" },
      include: {
        specialist: true,
        service: true,
        payments: true,
        consumptions: { include: { product: true } },
      },
      take: 200,
    }),
    prisma.retailSale.findMany({
      where: { patientId: params.id },
      orderBy: { createdAt: "desc" },
      include: {
        soldBy: { select: { id: true, name: true } },
        items: { include: { product: true } },
        payments: true,
      },
      take: 200,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PatientDetailsForm
        patient={{
          id: patient.id,
          name: patient.name,
          phone: patient.phone,
          email: patient.email,
          note: patient.note,
        }}
      >
        <PatientStatistics patientId={patient.id} showSpending={isAdmin} />
      </PatientDetailsForm>

      <PatientHistoryTabs
        appointments={appts.map((appointment) => ({
          id: appointment.id,
          startsAt: appointment.startsAt.toISOString(),
          serviceName: appointment.customServiceName || appointment.service.name,
          specialistName: appointment.specialist.name,
          status: appointment.status,
          price: appointment.priceFinal ?? appointment.priceEstimate,
          paid: appointment.payments.reduce((sum, payment) => sum + payment.amount, 0),
        }))}
        purchases={sales.map((sale) => ({
          id: sale.id,
          createdAt: sale.createdAt.toISOString(),
          items: sale.items.map((item) => ({
            productName: item.product.name,
            quantity: String(item.quantity),
            unit: item.product.unit,
          })),
          soldByName: sale.soldBy.name,
          status: sale.status,
          total: sale.total,
          paid: sale.payments.reduce((sum, payment) => sum + payment.amount, 0),
        }))}
      />
    </div>
  );
}
