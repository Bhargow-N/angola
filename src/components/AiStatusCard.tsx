import React, { useState, useEffect } from 'react';
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Cpu,
  Layers,
  ShieldCheck,
} from 'lucide-react';

interface ProviderHealth {
  name: string;
  configured: boolean;
  status: 'ok' | 'failed';
  model: string;
  error?: string;
  latencyMs?: number;
}

interface AiHealthResponse {
  primary: ProviderHealth;
  backup: ProviderHealth;
  lastProviderUsed: string;
  timestamp: string;
}

export const AiStatusCard: React.FC = () => {
  const [health, setHealth] = useState<AiHealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/health');
      if (!res.ok) {
        throw new Error(`Failed to fetch AI health (HTTP ${res.status})`);
      }
      const data: AiHealthResponse = await res.json();
      setHealth(data);
    } catch (err: any) {
      setError(err.message || 'Could not reach health check endpoint');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const formatLastProvider = (provider?: string) => {
    if (!provider || provider === 'none') return 'None yet';
    if (provider === 'primary') return 'Primary (Google Gemini)';
    if (provider === 'backup') return 'Backup (Groq)';
    if (provider === 'basic') return 'Basic chat mode (Deterministic)';
    return provider;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange flex items-center justify-center text-white shadow-xs">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 leading-tight">
              AI Chatbot Service Status
            </h3>
            <p className="text-[11px] text-slate-500">
              Dual-provider failover health (Primary: Gemini • Backup: Groq)
            </p>
          </div>
        </div>

        <button
          onClick={fetchHealth}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-200 disabled:opacity-50"
          title="Refresh AI health status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange' : 'text-slate-500'}`} />
          <span>{loading ? 'Checking...' : 'Refresh'}</span>
        </button>
      </div>

      {error ? (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Grid of Providers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Primary Provider */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-slate-600 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Primary Provider
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {health?.primary?.name || 'Google Gemini'}
                    </span>
                  </div>
                </div>

                {health?.primary?.status === 'ok' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Working
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                    Failed
                  </span>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Model:</span>
                  <span className="font-mono text-slate-700 font-medium">
                    {health?.primary?.model || 'Configured in .env'}
                  </span>
                </div>
                {health?.primary?.latencyMs !== undefined && health.primary.status === 'ok' && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Response Latency:</span>
                    <span className="font-mono text-emerald-700 font-semibold">
                      {health.primary.latencyMs}ms
                    </span>
                  </div>
                )}
                {health?.primary?.error && (
                  <div className="mt-1 p-1.5 rounded bg-rose-50 text-[10px] text-rose-700 break-words font-mono">
                    {health.primary.error}
                  </div>
                )}
              </div>
            </div>

            {/* Backup Provider */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-600 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Backup Provider
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {health?.backup?.name || 'Groq'}
                    </span>
                  </div>
                </div>

                {health?.backup?.status === 'ok' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Working
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                    Failed
                  </span>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Model:</span>
                  <span className="font-mono text-slate-700 font-medium">
                    {health?.backup?.model || 'Configured in .env'}
                  </span>
                </div>
                {health?.backup?.latencyMs !== undefined && health.backup.status === 'ok' && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Response Latency:</span>
                    <span className="font-mono text-emerald-700 font-semibold">
                      {health.backup.latencyMs}ms
                    </span>
                  </div>
                )}
                {health?.backup?.error && (
                  <div className="mt-1 p-1.5 rounded bg-rose-50 text-[10px] text-rose-700 break-words font-mono">
                    {health.backup.error}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Last Provider Used & Safety Summary */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-600 shrink-0" />
              <span className="text-slate-600 font-medium">
                Last Provider Used:
              </span>
              <span className="font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                {formatLastProvider(health?.lastProviderUsed)}
              </span>
            </div>

            <span className="text-[11px] text-slate-400 italic">
              Failover: 8s Primary Timeout &rarr; 1 Retry on Backup &rarr; Basic chat mode
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
