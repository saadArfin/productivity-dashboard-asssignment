import { WorkstationMetrics } from "../services/types";

type Props = { metrics?: WorkstationMetrics | null; loading?: boolean };

export default function WorkstationCard({ metrics, loading }: Props) {
  if (loading || !metrics) return <div className="p-4 rounded-lg bg-white shadow animate-pulse h-36" />;

  return (
    <div className="p-4 rounded-lg bg-white shadow">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-lg font-semibold text-slate-800">{metrics.workstation_id}</h4>
        <div className="text-sm text-slate-500">Throughput/hr <span className="font-medium">{metrics.throughput_per_hour}</span></div>
      </div>

      <div className="text-sm text-slate-700 space-y-1">
        <div>Utilization: <span className="font-medium">{metrics.utilization_percent}%</span></div>
        <div>Occupancy: <span className="font-medium">{(metrics.occupancy_seconds / 3600).toFixed(2)} hrs</span></div>
        <div>Total units: <span className="font-medium">{metrics.total_units}</span></div>
      </div>
    </div>
  );
}