import { FactoryMetrics } from "../services/types";

type Props = { metrics?: FactoryMetrics | null; loading?: boolean };

export default function SummaryCards({ metrics, loading }: Props) {
  if (loading || !metrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-gradient-to-br from-slate-800 to-slate-700 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="p-4 rounded-xl bg-white shadow">
        <div className="text-sm text-slate-500">Total Units</div>
        <div className="text-3xl font-bold text-slate-800">{metrics.total_units}</div>
      </div>

      <div className="p-4 rounded-xl bg-white shadow">
        <div className="text-sm text-slate-500">Avg Utilization</div>
        <div className="text-3xl font-bold text-slate-800">{metrics.average_utilization_percent}%</div>
      </div>

      <div className="p-4 rounded-xl bg-white shadow">
        <div className="text-sm text-slate-500">Avg Units / Worker / Hr</div>
        <div className="text-3xl font-bold text-slate-800">{metrics.average_production_rate_per_worker_per_hour}</div>
      </div>

      <div className="p-4 rounded-xl bg-white shadow">
        <div className="text-sm text-slate-500">Workers</div>
        <div className="text-3xl font-bold text-slate-800">{metrics.workers_count}</div>
      </div>
    </div>
  );
}