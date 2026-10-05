import { NextResponse } from "next/server";
import { getPatientAuth } from "@/lib/patient-auth";
import { pushStatusResponse, subscribeResponse, unsubscribeResponse } from "@/lib/push-subscribe";

// Powiadomienia push zalogowanego klienta: klucz do subskrypcji (GET),
// włączenie na tym urządzeniu (POST) i wyłączenie (DELETE).
async function owner() {
  const auth = await getPatientAuth();
  return auth ? { patientId: auth.id } : null;
}

const unauthorized = () => NextResponse.json({ ok: false, message: "Brak autoryzacji" }, { status: 401 });

export async function GET() {
  const who = await owner();
  return who ? pushStatusResponse(who) : unauthorized();
}

export async function POST(req: Request) {
  const who = await owner();
  return who ? subscribeResponse(req, who) : unauthorized();
}

export async function DELETE(req: Request) {
  const who = await owner();
  return who ? unsubscribeResponse(req, who) : unauthorized();
}
