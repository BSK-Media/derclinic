import { NextResponse } from "next/server";
import { clearPatientAuthCookie, getPatientAuth } from "@/lib/patient-auth";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const patient = await getPatientAuth();
  clearPatientAuthCookie();
  if (patient) {
    await logAudit({
      actor: { type: "PATIENT", id: patient.id, name: patient.name, contact: patient.phone },
      action: "LOGOUT",
      entity: "PatientAccount",
      entityId: patient.id,
      summary: "Wylogowanie z panelu klienta",
    });
  }
  return NextResponse.json({ ok: true });
}
