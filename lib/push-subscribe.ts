import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getVapidKeys } from "@/lib/push";

// Wspólna obsługa zapisu i usuwania subskrypcji push dla dwóch endpointów:
// /api/patient/push (klient) i /api/me/push (pracownik).

type Owner = { patientId: string } | { userId: string };

const SubscribeSchema = z.object({
  endpoint: z.string().url().max(2000).startsWith("https://"),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});

const UnsubscribeSchema = z.object({ endpoint: z.string().min(1).max(2000) });

/** Klucz publiczny potrzebny przeglądarce do subskrypcji i liczba urządzeń właściciela. */
export async function pushStatusResponse(owner: Owner) {
  const [{ publicKey }, devices] = await Promise.all([
    getVapidKeys(),
    prisma.pushSubscription.count({ where: owner }),
  ]);
  return NextResponse.json({ ok: true, publicKey, devices });
}

export async function subscribeResponse(req: Request, owner: Owner) {
  const parsed = SubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });

  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const data = {
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userAgent,
    // Urządzenie należy do jednej osoby naraz — do tej, która włączyła
    // powiadomienia jako ostatnia (np. po przelogowaniu na wspólnym telefonie).
    patientId: "patientId" in owner ? owner.patientId : null,
    userId: "userId" in owner ? owner.userId : null,
  };
  await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    create: { endpoint: parsed.data.endpoint, ...data },
    update: data,
  });
  return NextResponse.json({ ok: true });
}

export async function unsubscribeResponse(req: Request, owner: Owner) {
  const parsed = UnsubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Niepoprawne dane" }, { status: 400 });
  // Tylko własne urządzenie — nie da się wyłączyć powiadomień komuś innemu.
  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, ...owner } });
  return NextResponse.json({ ok: true });
}
