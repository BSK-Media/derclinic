"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function LocationAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const locationId = params.id;
  const { data, isLoading } = useSWR(
    locationId ? `/api/admin/locations/${encodeURIComponent(locationId)}` : null,
    fetcher,
  );

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-500">Ładowanie lokalizacji…</div>;
  }

  if (!data?.ok || !data?.location) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/locations"
          className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Wróć do lokalizacji
        </Link>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          Nie znaleziono lokalizacji.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href="/admin/locations"
        className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Wróć do lokalizacji
      </Link>
      <AnalyticsDashboard
        apiPath={`/api/admin/locations/${encodeURIComponent(locationId)}/analytics`}
        title={`Analityka — ${data.location.name}`}
        description="Przychody, wizyty i zużycie preparatów wyłącznie dla tej lokalizacji."
      />
    </div>
  );
}
