import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { RfmPanel } from "@/components/rfm-panel";

export default function AnalyticsPage() {
  return (
    <div className="space-y-8">
      <AnalyticsDashboard />
      <RfmPanel />
    </div>
  );
}
