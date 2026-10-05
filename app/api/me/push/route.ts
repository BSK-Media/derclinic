import { requireAuth } from "@/lib/api-helpers";
import { pushStatusResponse, subscribeResponse, unsubscribeResponse } from "@/lib/push-subscribe";

// Powiadomienia push zalogowanego pracownika (każda rola): klucz do
// subskrypcji (GET), włączenie na tym urządzeniu (POST) i wyłączenie (DELETE).

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;
  return pushStatusResponse({ userId: user!.id });
}

export async function POST(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  return subscribeResponse(req, { userId: user!.id });
}

export async function DELETE(req: Request) {
  const { user, error } = await requireAuth();
  if (error) return error;
  return unsubscribeResponse(req, { userId: user!.id });
}
