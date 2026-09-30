import { GET as getAnalytics } from "@/app/api/admin/analytics/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const url = new URL(req.url);
  url.searchParams.set("locationId", params.id);
  return getAnalytics(new Request(url.toString(), { headers: req.headers }));
}
