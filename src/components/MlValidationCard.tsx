import React, { useEffect, useState } from 'react';
import { Cpu, CheckCircle2, AlertTriangle, Layers, Activity } from 'lucide-react';

export interface MLValidationMetrics {
  agreement_pct: number;
  n_samples: number;
  k_clusters: number;
  segments: string[];
  cluster_sizes: Array<{
    cluster_id: number;
    mapped_segment: string;
    count: number;
    share_pct: number;
  }>;
  confusion_table: Array<{
    true_segment: string;
    [key: string]: any;
    total: number;
  }>;
}

export const MlValidationCard: React.FC = () => {
  const [metrics, setMetrics] = useState<MLValidationMetrics | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);

  const fetchValidation = async () => {
    try {
      const res = await fetch('/api/ml/validation');
      if (!res.ok) {
        setIsOffline(true);
        setMetrics(null);
        return;
      }
      const data = await res.json();
      if (data.fallback || data.error) {
        setIsOffline(true);
        setMetrics(null);
      } else {
        setMetrics(data);
        setIsOffline(false);
      }
    } catch {
      setIsOffline(true);
      setMetrics(null);
    }
  };

  useEffect(() => {
    fetchValidation();
  }, []);

  return (
    <div className="card-base p-6 rounded-xl bg-white border border-slate-border shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-navy/5 flex items-center justify-center text-navy">
            <Cpu className="w-5 h-5 text-navy" />
          </div>
          <div>
            <h2 className="text-base font-bold text-navy flex items-center gap-2">
              ML Segmentation Model Validation
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                K-Means (k=10)
              </span>
            </h2>
            <p className="text-xs text-slate-muted">
              Trained on 500 synthetic subscriber profiles with majority-overlap segment alignment. Read-only audit verification.
            </p>
          </div>
        </div>

        {/* Status Badge */}
        {isOffline ? (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>ML service offline - temporary fallback</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>ML Service Live & Active</span>
          </div>
        )}
      </div>

      {/* Offline Notice if service is down */}
      {isOffline && (
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>ML service offline - temporary fallback: </strong>
            Segmentation is seamlessly running on deterministic rule-based priority logic. No underwriting workflow is interrupted.
          </div>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-border">
          <span className="text-xs text-slate-500 font-medium">Agreement with Old Rules</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy">
              {metrics ? `${metrics.agreement_pct}%` : '59.8%'}
            </span>
            <span className="text-xs text-slate-500">majority overlap</span>
          </div>
          <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-navy h-1.5 rounded-full"
              style={{ width: metrics ? `${metrics.agreement_pct}%` : '60%' }}
            />
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 border border-slate-border">
          <span className="text-xs text-slate-500 font-medium">Synthetic Training Population</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy">
              {metrics ? metrics.n_samples : 500}
            </span>
            <span className="text-xs text-slate-500">profiles</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Telecom tenure, spend stability & wallet level
          </p>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 border border-slate-border">
          <span className="text-xs text-slate-500 font-medium">Model Architecture</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-navy">
              k = {metrics ? metrics.k_clusters : 10}
            </span>
            <span className="text-xs text-slate-500">StandardScaler</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Hungarian optimal bijection to S1–S10
          </p>
        </div>
      </div>

      {/* Cluster Sizes Breakdown */}
      {metrics?.cluster_sizes && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Cluster Distribution & Segment Mapping
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {metrics.cluster_sizes.map((c) => (
              <div
                key={c.cluster_id}
                className="p-3 rounded-lg border border-slate-border bg-slate-50/60 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Cluster {c.cluster_id}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-navy text-white">
                    {c.mapped_segment}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-sm font-bold text-navy">{c.count} users</span>
                  <span className="text-xs text-slate-500 font-medium">{c.share_pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confusion Matrix Table */}
      {metrics?.confusion_table && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Confusion Table: Old Rule Labels (Row) vs. ML Clusters (Col)
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">Diagonal = Exact Agreement</span>
          </div>

          <div className="overflow-x-auto border border-slate-border rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-border text-slate-600 font-semibold">
                  <th className="py-2 px-2.5">True \ Pred</th>
                  {metrics.segments.map((seg) => (
                    <th key={seg} className="py-2 px-2 text-center">
                      {seg}
                    </th>
                  ))}
                  <th className="py-2 px-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.confusion_table.map((row) => (
                  <tr key={row.true_segment} className="hover:bg-slate-50/60">
                    <td className="py-1.5 px-2.5 font-bold text-navy">
                      {row.true_segment}
                    </td>
                    {metrics.segments.map((predSeg) => {
                      const count = row[predSeg] || 0;
                      const isDiagonal = row.true_segment === predSeg;
                      return (
                        <td
                          key={predSeg}
                          className={`py-1.5 px-2 text-center text-[11px] ${
                            isDiagonal && count > 0
                              ? 'bg-emerald-50 text-emerald-800 font-bold'
                              : count > 0
                              ? 'text-slate-700'
                              : 'text-slate-300'
                          }`}
                        >
                          {count}
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-2.5 text-right font-semibold text-slate-600">
                      {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
