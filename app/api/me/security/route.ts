import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-cookie";
import { SESSION_POLICY } from "@/lib/session-core";

// Stan zabezpieczeń własnego konta: MFA, kody odzyskiwania, klucze dostępu, aktywne sesje.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 });

  const idleCutoff = new Date(Date.now() - SESSION_POLICY.staff.idleMs);
  const [user, recoveryCodesRemaining, passkeys, sessions] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: auth.id }, select: { mfaEnabledAt: true, mfaTotpSecretEnc: true } }),
    prisma.mfaRecoveryCode.count({ where: { userId: auth.id, usedAt: null } }),
    prisma.webAuthnPasskey.findMany({
      where: { userId: auth.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    }),
    prisma.staffSession.findMany({
      where: { userId: auth.id, revokedAt: null, expiresAt: { gt: new Date() }, lastSeenAt: { gt: idleCutoff } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, createdAt: true, lastSeenAt: true, ipAddress: true, userAgent: true, mfaMethod: true },
    }),
  ]);

  return NextResponse.json(
    {
      ok: true,
      mfaEnabledAt: user.mfaEnabledAt,
      totpEnabled: Boolean(user.mfaTotpSecretEnc),
      recoveryCodesRemaining,
      passkeys,
      // Pełnego identyfikatora sesji nie ujawniamy — wystarczy skrót do wyświetlenia.
      sessions: sessions.map((s) => ({ ...s, id: s.id.slice(0, 12), current: s.id === auth.sessionId })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
