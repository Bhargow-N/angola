import React, { useEffect, useState } from 'react';
import { LoanApplication } from '../types';
import { formatKz } from '../lib/money';
import { Users, CheckCircle2, Clock } from 'lucide-react';

interface SimilarCustomerItem {
  id: string;
  sim_age_months: number;
  topup_regularity: number;
  avg_monthly_topup_kz: number;
  spend_stability: number;
  outcome: string;
  distance?: number;
}

interface SimilarCustomersResponse {
  similar_customers: SimilarCustomerItem[];
  repaid_on_time_count: number;
  paid_late_count: number;
  repayment_chance_pct: number;
  summary_line: string;
  disclaimer: string;
}

export const SimilarCustomersCard: React.FC<{ application: LoanApplication }> = ({ application }) => {
  const [data, setData] = useState<SimilarCustomersResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const fetchSimilar = async () => {
      setLoading(true);
      try {
        const simMonths = application.evaluation?.customer?.sim_activation_date
          ? Math.max(1, Math.round((Date.now() - new Date(application.evaluation.customer.sim_activation_date).getTime()) / (1000 * 60 * 60 * 24 * 30.4)))
          : 24;

        const features = {
          sim_age_months: simMonths,
          topup_regularity: 0.82,
          avg_monthly_topup_kz: Math.round(application.price_kz / 4) || 25000,
          spend_stability: 0.80,
          airtime_loans_repaid_ratio: 0.95,
          wallet_level: application.evaluation?.segment_code === 'S8' ? 3 : 2,
        };

        const res = await fetch('/api/ml/similar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(features),
        });

        if (res.ok) {
          const json = await res.json();
          if (isMounted && json.success) {
            setData(json);
            setLoading(false);
            return;
          }
        }
      } catch {
        // ML service offline fallback
      }

      // Offline Fallback Data
      if (isMounted) {
        setData({
          similar_customers: [
            { id: 'CUST-1042', sim_age_months: 24, topup_regularity: 0.85, avg_monthly_topup_kz: 28000, spend_stability: 0.82, outcome: 'repaid on time' },
            { id: 'CUST-1089', sim_age_months: 20, topup_regularity: 0.80, avg_monthly_topup_kz: 22000, spend_stability: 0.78, outcome: 'repaid on time' },
            { id: 'CUST-1150', sim_age_months: 26, topup_regularity: 0.88, avg_monthly_topup_kz: 31000, spend_stability: 0.85, outcome: 'repaid on time' },
            { id: 'CUST-1215', sim_age_months: 18, topup_regularity: 0.75, avg_monthly_topup_kz: 24000, spend_stability: 0.70, outcome: 'repaid on time' },
            { id: 'CUST-1340', sim_age_months: 15, topup_regularity: 0.70, avg_monthly_topup_kz: 19000, spend_stability: 0.65, outcome: 'paid late' },
          ],
          repaid_on_time_count: 4,
          paid_late_count: 1,
          repayment_chance_pct: 80,
          summary_line: '5 similar customers: 4 repaid on time, 1 paid late. Estimated repayment chance: 80%.',
          disclaimer: 'Based on synthetic demo history',
        });
        setLoading(false);
      }
    };

    fetchSimilar();
    return () => {
      isMounted = false;
    };
  }, [application.id, application.price_kz]);

  if (loading || !data) {
    return (
      <div className="p-4 rounded-xl bg-white border border-slate-border shadow-xs animate-pulse space-y-2">
        <div className="h-4 bg-slate-200 rounded w-1/3" />
        <div className="h-16 bg-slate-100 rounded" />
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl bg-white border border-slate-border shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-navy/5 flex items-center justify-center text-navy">
            <Users className="w-4 h-4 text-navy" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-navy uppercase tracking-wider">
              KNN Similar Past Customers
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">
              5 nearest profile matches on scaled features
            </span>
          </div>
        </div>

        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
          {data.disclaimer}
        </span>
      </div>

      {/* Repayment Probability Line */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-navy">
              {data.summary_line}
            </p>
            <p className="text-[11px] text-slate-500">
              Supports underwriting decision • Never alters score calculation
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-xl font-black text-navy">{data.repayment_chance_pct}%</span>
          <span className="text-[10px] text-slate-500 block font-medium">Repayment Likelihood</span>
        </div>
      </div>

      {/* Small Table of 5 Past Customers */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="py-2 px-3">Customer ID</th>
              <th className="py-2 px-3 text-center">SIM Age</th>
              <th className="py-2 px-3 text-center">Top-Up Regularity</th>
              <th className="py-2 px-3 text-right">Avg Monthly Spend</th>
              <th className="py-2 px-3 text-center">Loan Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.similar_customers.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/50">
                <td className="py-2 px-3 font-mono font-medium text-slate-700">{c.id}</td>
                <td className="py-2 px-3 text-center text-slate-600">{c.sim_age_months} months</td>
                <td className="py-2 px-3 text-center text-slate-600">
                  {Math.round(c.topup_regularity * 100)}%
                </td>
                <td className="py-2 px-3 text-right font-mono text-slate-700">
                  {formatKz(c.avg_monthly_topup_kz)}
                </td>
                <td className="py-2 px-3 text-center">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      c.outcome === 'repaid on time'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {c.outcome === 'repaid on time' ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Clock className="w-3 h-3 text-amber-600" />
                    )}
                    <span>{c.outcome}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
