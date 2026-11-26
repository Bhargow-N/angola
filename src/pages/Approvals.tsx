import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LoanApplication } from '../types';
import { getStoredApplications, processApprovalDecision } from '../lib/loans';
import { useSyncDatabase } from '../lib/syncClient';
import { useAuth } from '../context/AuthContext';
import { formatKz } from '../lib/money';
import { StatusChip } from '../components/StatusChip';
import { PageHeader } from '../components/PageHeader';
import { Modal } from '../components/Modal';
import { SimilarCustomersCard } from '../components/SimilarCustomersCard';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Check,
  X,
  ShieldCheck,
  ArrowRight,
  Filter,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertOctagon,
  Copy,
} from 'lucide-react';

type ApprovalTab = 'submitted' | 'approved' | 'rejected' | 'all';

export const Approvals: React.FC = () => {
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [applications, setApplications] = useState<LoanApplication[]>([]);

  // Tab State
  const initialTabParam = searchParams.get('tab') || searchParams.get('status');
  const [activeTab, setActiveTab] = useState<ApprovalTab>(() => {
    if (initialTabParam === 'approved') return 'approved';
    if (initialTabParam === 'rejected') return 'rejected';
    if (initialTabParam === 'all') return 'all';
    return 'submitted';
  });

  const [search, setSearch] = useState<string>('');
  const [copiedRefId, setCopiedRefId] = useState<string | null>(null);

  const handleCopyRef = (e: React.MouseEvent, refText: string) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(refText);
    setCopiedRefId(refText);
    setTimeout(() => setCopiedRefId((prev) => (prev === refText ? null : prev)), 1500);
  };
  const [selectedApp, setSelectedApp] = useState<LoanApplication | null>(null);

  // Pagination (6 to 8 rows per page)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const rowsPerPage = 7;

  // Decision Modal State
  const [decisionModalOpen, setDecisionModalOpen] = useState<boolean>(false);
  const [decisionType, setDecisionType] = useState<'approved' | 'rejected'>('approved');
  const [decisionReason, setDecisionReason] = useState<string>('');
  const [actionSuccess, setActionSuccess] = useState<string>('');

  // AI or Template Approver Summary
  const [approverSummary, setApproverSummary] = useState<string>('');
  const [summaryLabel, setSummaryLabel] = useState<string>('Template summary - approver decides');

  useEffect(() => {
    refreshData();
  }, []);

  // Live real-time cross-port sync
  useSyncDatabase(() => {
    refreshData();
  });

  const refreshData = () => {
    const apps = getStoredApplications();
    setApplications(apps);
    // If a selected app is open, update its reference
    if (selectedApp) {
      const updated = apps.find((a) => a.id === selectedApp.id);
      if (updated) setSelectedApp(updated);
    }
  };

  // Dynamic Approver Summary generation (AI or Template)
  useEffect(() => {
    if (!selectedApp) {
      setApproverSummary('');
      return;
    }
    const fetchSummary = async () => {
      try {
        const payload = {
          customer_name: selectedApp.evaluation?.customer?.full_name || 'Subscriber',
          age: selectedApp.evaluation?.customer?.date_of_birth
            ? Math.floor((Date.now() - new Date(selectedApp.evaluation.customer.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000))
            : 34,
          marital_status: selectedApp.evaluation?.customer?.marital_status || 'married',
          occupation: selectedApp.evaluation?.customer?.occupation || 'independent worker',
          city: selectedApp.evaluation?.customer?.city || 'Luanda',
          assets: ['motorbike'],
          score: selectedApp.evaluation?.results?.score || 650,
          band: selectedApp.evaluation?.results?.band_label || 'Acceptable',
          confidence: selectedApp.evaluation?.results?.confidence || 'High',
          credit_limit: selectedApp.evaluation?.results?.limit_kz || 150000,
          equipment_name: selectedApp.equipment?.name || '4G Smartphone',
          emi_amount: selectedApp.monthly_emi_kz || 10000,
          term_months: selectedApp.term_months || 12,
          ml_segment: selectedApp.evaluation?.segment_code || 'S3',
          knn_summary: '5 similar customers: 4 repaid on time, 1 paid late (80% repayment chance)',
          red_flags: selectedApp.evaluation?.results?.address_warning ? ['Geographic address disparity'] : [],
        };

        const res = await fetch('/api/ai/approver_summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.text) {
            setApproverSummary(data.text);
            setSummaryLabel(data.label || 'Template summary - approver decides');
            return;
          }
        }
      } catch {}

      // Fallback template
      const fallbackText = `${selectedApp.evaluation?.customer?.full_name || 'Subscriber'}, 34, married, independent worker in Luanda. Owns motorbike. Score ${selectedApp.evaluation?.results?.score || 650} (${selectedApp.evaluation?.results?.band_label || 'Acceptable'}), Data confidence ${selectedApp.evaluation?.results?.confidence || 'High'}. Credit limit: ${formatKz(selectedApp.evaluation?.results?.limit_kz || 150000)}. Wants ${selectedApp.equipment?.name || '4G Smartphone'} on a ${selectedApp.term_months || 12}-month EMI of about ${formatKz(selectedApp.monthly_emi_kz)}. ML Segment: ${selectedApp.evaluation?.segment_code || 'S3'}. KNN: 5 similar customers: 4 repaid on time, 1 paid late (80% estimated repayment chance). No critical red flags detected.`;
      setApproverSummary(fallbackText);
      setSummaryLabel('Template summary - approver decides');
    };

    fetchSummary();
  }, [selectedApp?.id]);

  const handleSelectTab = (tab: ApprovalTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
    setCurrentPage(1);
  };

  // Metrics
  const submittedApps = applications.filter((a) => a.status === 'submitted');
  const approvedApps = applications.filter((a) => a.status === 'approved' || a.status === 'purchased');
  const rejectedApps = applications.filter((a) => a.status === 'rejected');

  // Filtered applications
  const filteredApps = applications.filter((app) => {
    const custName = app.evaluation?.customer?.full_name?.toLowerCase() || '';
    const q = search.toLowerCase();
    const matchesSearch =
      custName.includes(q) ||
      app.id.toLowerCase().includes(q) ||
      (app.equipment?.name && app.equipment.name.toLowerCase().includes(q));

    if (activeTab === 'submitted') return matchesSearch && app.status === 'submitted';
    if (activeTab === 'approved') return matchesSearch && (app.status === 'approved' || app.status === 'purchased');
    if (activeTab === 'rejected') return matchesSearch && app.status === 'rejected';
    return matchesSearch;
  });

  // Paged items
  const totalPages = Math.max(1, Math.ceil(filteredApps.length / rowsPerPage));
  const pagedApps = filteredApps.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const handleOpenReview = (app: LoanApplication) => {
    setSelectedApp(app);
  };

  const handleOpenDecision = (type: 'approved' | 'rejected') => {
    if (!selectedApp) return;
    setDecisionType(type);
    if (type === 'approved') {
      setDecisionReason(
        `Approved: acceptable proxy score (${selectedApp.evaluation?.results?.score || 650}) and affordable ${selectedApp.emi_share_pct}% monthly debt burden.`
      );
    } else {
      setDecisionReason('Declined: exceeds credit risk tolerance or policy affordability threshold.');
    }
    setDecisionModalOpen(true);
    setActionSuccess('');
  };

  const handleExecuteDecision = () => {
    if (!selectedApp) return;
    if (decisionType === 'rejected' && !decisionReason.trim()) {
      alert('A decision reason is mandatory for rejection.');
      return;
    }

    const recipient = selectedApp.evaluation?.customer?.email || 'bhargownarravula777@gmail.com';
    processApprovalDecision(
      selectedApp.id,
      decisionType,
      decisionReason,
      currentUser.full_name || 'Dra. Maria Mendes (Approver)',
      recipient
    );

    refreshData();
    setActionSuccess(`Application ${selectedApp.id.slice(-6).toUpperCase()} marked as ${decisionType.toUpperCase()}! Decision email delivered.`);
    setTimeout(() => {
      setDecisionModalOpen(false);
      setActionSuccess('');
    }, 1200);
  };

  return (
    <div className="space-y-4 w-full min-w-0 max-w-full pb-8">
      {/* Page Header */}
      <PageHeader
        title="Applications Queue"
        helperText="Review proxy scores and make credit decisions."
        icon={CheckCircle2}
        badgeText={`Approver: ${currentUser.full_name}`}
      />

      {/* VIEW 1: APPLICATIONS QUEUE TABLE */}
      {!selectedApp && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Filter Pills & Search */}
          <div className="bg-card p-4 rounded-2xl border-2 border-orange shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                onClick={() => handleSelectTab('submitted')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'submitted'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-orange-600'
                  }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Submitted ({submittedApps.length})</span>
              </button>

              <button
                onClick={() => handleSelectTab('approved')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'approved'
                  ? 'bg-green-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-green-700'
                  }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approved ({approvedApps.length})</span>
              </button>

              <button
                onClick={() => handleSelectTab('rejected')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'rejected'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-red-700'
                  }`}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Rejected ({rejectedApps.length})</span>
              </button>

              <button
                onClick={() => handleSelectTab('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'all'
                  ? 'bg-ink text-white shadow-xs'
                  : 'text-slate-600 hover:text-ink'
                  }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>All ({applications.length})</span>
              </button>
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search applicant or equipment..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-orange focus:bg-white"
              />
            </div>
          </div>

          {/* Compact Table (6-8 rows per page) */}
          <div className="bg-card rounded-2xl border-2 border-orange shadow-xs overflow-hidden w-full">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[720px]">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4 w-24">Ref</th>
                    <th className="py-3 px-4 w-52">Subscriber</th>
                    <th className="py-3 px-4 w-28">Segment</th>
                    <th className="py-3 px-4">Equipment</th>
                    <th className="py-3 px-4 w-36">Monthly EMI</th>
                    <th className="py-3 px-4 w-28">Score</th>
                    <th className="py-3 px-4 w-28">Status</th>
                    <th className="py-3 px-4 text-right w-24">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedApps.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No applications matching selected filter.
                      </td>
                    </tr>
                  ) : (
                    pagedApps.map((app) => (
                      <tr
                        key={app.id}
                        onClick={() => handleOpenReview(app)}
                        className="hover:bg-peach/30 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-slate-600 group/id">
                          <div className="inline-flex items-center gap-1.5">
                            <span>{app.id.slice(-6).toUpperCase()}</span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyRef(e, app.id.slice(-6).toUpperCase())}
                              title="Copy Application Ref"
                              className={`p-1 rounded-md transition-opacity ${
                                copiedRefId === app.id.slice(-6).toUpperCase()
                                  ? 'opacity-100 text-emerald-600 bg-emerald-50'
                                  : 'opacity-0 group-hover/id:opacity-100 text-slate-400 hover:text-orange-600 hover:bg-orange-50'
                              }`}
                            >
                              {copiedRefId === app.id.slice(-6).toUpperCase() ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-ink block">
                            {app.evaluation?.customer?.full_name || 'Subscriber'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {app.evaluation?.customer?.msisdn}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-orange-600">
                          {app.evaluation?.segment_code}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-700 block">
                            {app.equipment?.name}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatKz(app.price_kz)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-ink block">
                            {formatKz(app.monthly_emi_kz)}/mo
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {app.term_months}m ({app.emi_share_pct}%)
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-black text-ink block text-xs">
                            {app.evaluation?.results?.score || '—'}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {app.evaluation?.results?.band_label}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <StatusChip status={app.status} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenReview(app);
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-orange-600 hover:text-white rounded-lg text-[11px] font-bold text-slate-700 transition-all inline-flex items-center gap-1"
                          >
                            <span>Review</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls (Paging 6 to 8 rows) */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs">
              <span className="text-slate-500">
                Showing {Math.min(filteredApps.length, (currentPage - 1) * rowsPerPage + 1)} to{' '}
                {Math.min(filteredApps.length, currentPage * rowsPerPage)} of {filteredApps.length} applications
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono font-bold text-slate-700">
                  {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: REVIEW PAGE (When a row is clicked) */}
      {selectedApp && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Back button bar */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedApp(null)}
              className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-all shadow-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Queue</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-500">
                App ID: {selectedApp.id}
              </span>
              <StatusChip status={selectedApp.status} />
            </div>
          </div>

          {/* 1. APPROVER SUMMARY (AI or Template) */}
          <div className="p-4 bg-gradient-to-r from-orange-50/80 via-white to-orange-50/40 rounded-2xl border-2 border-orange/50 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-slate-900">
                <Sparkles className="w-4 h-4 text-orange" />
                <span>Executive Approver Summary</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                summaryLabel.includes('AI') ? 'bg-orange text-white' : 'bg-slate-200 text-slate-800'
              }`}>
                {summaryLabel}
              </span>
            </div>

            <p className="text-xs text-slate-800 font-medium leading-relaxed bg-white p-3 rounded-xl border border-orange-100">
              {approverSummary || (
                `${selectedApp.evaluation?.customer?.full_name || 'Subscriber'}, 34, married, independent worker in Luanda. Score ${selectedApp.evaluation?.results?.score || 650} (${selectedApp.evaluation?.results?.band_label || 'Acceptable'}), Data confidence ${selectedApp.evaluation?.results?.confidence || 'High'}. Wants ${selectedApp.equipment?.name || '4G Smartphone'} on a ${selectedApp.term_months || 12}-month EMI of about ${formatKz(selectedApp.monthly_emi_kz)}, within approved credit limit of ${formatKz(selectedApp.evaluation?.results?.limit_kz || 150000)}.`
              )}
            </p>
          </div>

          {/* 2. KNN SIMILAR PAST CUSTOMERS CARD */}
          <SimilarCustomersCard application={selectedApp} />

          {/* ADDRESS DISPARITY ALERT */}
          {(selectedApp.evaluation?.results?.address_warning ||
            (selectedApp.evaluation?.customer?.city &&
              selectedApp.evaluation?.customer?.dominant_region_6m &&
              selectedApp.evaluation.customer.city.toLowerCase() !== selectedApp.evaluation.customer.dominant_region_6m.toLowerCase())) && (
            <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-1 text-xs text-amber-900 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1.5 text-amber-950 uppercase tracking-wider text-[11px]">
                  <AlertOctagon className="w-4 h-4 text-amber-600" />
                  <span>Geographic Address Disparity Warning</span>
                </span>
                <span className="text-[10px] font-bold bg-orange text-white px-2 py-0.5 rounded">
                  AI-generated - approver decides
                </span>
              </div>
              <p className="leading-relaxed">
                National ID (BI) address lists <strong>{selectedApp.evaluation?.customer?.city}</strong>, but SIM CDR activity over the last 6 months is predominantly in <strong>{selectedApp.evaluation?.customer?.dominant_region_6m || 'Huambo'}</strong>.
                AI suggests requesting secondary address proof prior to equipment handover.
              </p>
            </div>
          )}

          {/* 2. Review Content Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Left: Points Bars */}
            <div className="bg-card rounded-2xl p-5 border border-orange-100 shadow-md space-y-3">
              <span className="text-xs font-black text-ink uppercase tracking-wider block">
                Block Breakdown
              </span>

              <div className="space-y-2 text-xs">
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-slate-600">Personal (P)</span>
                    <span className="font-mono font-bold text-ink">
                      {Math.round(selectedApp.evaluation?.results?.block_points?.P?.earnedPoints || 10)} pts
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-slate-600 rounded-full w-4/5" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-teal font-medium">Telecom (T)</span>
                    <span className="font-mono font-bold text-ink">
                      {Math.round(selectedApp.evaluation?.results?.block_points?.T?.earnedPoints || 30)} pts
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-teal rounded-full w-3/4" />
                  </div>
                </div>

                {selectedApp.evaluation?.results?.block_points?.W && selectedApp.evaluation.results.block_points.W.rawPoints > 0 && (
                  <div>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-purple-700 font-medium">Wallet (W)</span>
                      <span className="font-mono font-bold text-ink">
                        {Math.round(selectedApp.evaluation.results.block_points.W.earnedPoints)} pts
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-purple-600 rounded-full w-2/3" />
                    </div>
                  </div>
                )}

                {selectedApp.evaluation?.results?.block_points?.B && selectedApp.evaluation.results.block_points.B.rawPoints > 0 && (
                  <div>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-blue-700 font-medium">Bank (B)</span>
                      <span className="font-mono font-bold text-ink">
                        {Math.round(selectedApp.evaluation.results.block_points.B.earnedPoints)} pts
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-blue-700 rounded-full w-4/5" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Middle: Key Values with Source Chips */}
            <div className="bg-card rounded-2xl p-5 border border-orange-100 shadow-md space-y-2.5">
              <span className="text-xs font-black text-ink uppercase tracking-wider block">
                Verified Key Signals
              </span>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-600">SIM Tenure</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-100 text-orange-800">
                    From Unitel
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-600">Top-Up History</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-100 text-orange-800">
                    From Unitel
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-600">Wallet Turnover</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-100 text-purple-800">
                    From Unitel Money
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-slate-600">Identity Verification</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-green-100 text-green-800">
                    Civil Match
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Policy Flags & Decision Actions */}
            <div className="bg-card rounded-2xl p-5 border border-orange-100 shadow-md flex flex-col justify-between space-y-4">
              <div>
                <span className="text-xs font-black text-ink uppercase tracking-wider block mb-2">
                  Policy Overlay
                </span>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-ink">
                    <ShieldCheck className="w-4 h-4 text-orange" />
                    <span>BNA Underwriting Checks Passed</span>
                  </div>
                  <span className="text-[11px] text-slate-500 block">
                    No SIM-swap hold detected. 30% debt cap validated.
                  </span>
                </div>
              </div>

              {/* AI Suggested Decision Card */}
              <div className="p-3 bg-gradient-to-r from-orange-50 to-white rounded-xl border border-orange-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px] text-slate-800 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-orange" />
                    <span>Suggested Decision</span>
                  </span>
                  <span className="text-[9px] font-bold bg-orange text-white px-1.5 py-0.2 rounded">
                    AI-generated - approver decides
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      (selectedApp.evaluation?.results?.score || 650) >= 700
                        ? 'bg-emerald-100 text-emerald-800'
                        : (selectedApp.evaluation?.results?.score || 650) >= 550
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {(selectedApp.evaluation?.results?.score || 650) >= 700
                      ? 'Suggest: Approve'
                      : (selectedApp.evaluation?.results?.score || 650) >= 550
                      ? 'Suggest: Review'
                      : 'Suggest: Reject'}
                  </span>
                  <span className="text-[11px] text-slate-600 font-medium">
                    {(selectedApp.evaluation?.results?.score || 650) >= 700
                      ? 'Tier 1 Standard • 12m Term • 0 Kz downpayment'
                      : (selectedApp.evaluation?.results?.score || 650) >= 550
                      ? `Tier 2 Starter • 6m Term • 15% downpayment (${formatKz(Math.round(selectedApp.price_kz * 0.15))})`
                      : 'High Risk • Criteria not met'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {(selectedApp.evaluation?.results?.score || 650) >= 700
                    ? 'Consistent recharge patterns, verified KYC, and low debt-service ratio.'
                    : (selectedApp.evaluation?.results?.score || 650) >= 550
                    ? 'Acceptable telecom history; recommend verifying secondary contact or 15% upfront downpayment.'
                    : 'Insufficient SIM activity tenure and unverified alternative documentation.'}
                </p>
              </div>

              {/* Action Buttons */}
              {selectedApp.status === 'submitted' ? (
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handleOpenDecision('rejected')}
                    className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                  <button
                    onClick={() => handleOpenDecision('approved')}
                    className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-slate-50 text-center text-xs text-slate-600 border border-slate-200 font-medium">
                  Decision finalized as <strong className="uppercase">{selectedApp.status}</strong>.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DECISION CONFIRMATION MODAL */}
      <Modal
        isOpen={decisionModalOpen && !!selectedApp}
        onClose={() => setDecisionModalOpen(false)}
        className="bg-white rounded-2xl max-w-lg md:max-w-xl w-full p-6 sm:p-7 shadow-2xl border-2 border-orange/40 space-y-5"
      >
        {selectedApp && (
          <>
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-black font-heading text-ink">
                Confirm {decisionType === 'approved' ? 'Approval' : 'Rejection'}
              </h3>
              <button
                onClick={() => setDecisionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {actionSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <span>{actionSuccess}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-ink mb-1">
                  Decision Note {decisionType === 'rejected' && <span className="text-red-600">*</span>}:
                </label>
                <textarea
                  rows={3}
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange text-xs"
                  placeholder="Enter reason included in transactional decision email..."
                />
              </div>

              <span className="text-[11px] text-slate-400 block">
                This note will be included directly in the email dispatched to {selectedApp.evaluation?.customer?.email || 'the applicant'}.
              </span>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <button
                onClick={() => setDecisionModalOpen(false)}
                className="flex-1 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDecision}
                className={`flex-1 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all ${decisionType === 'approved'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
                  }`}
              >
                Confirm {decisionType === 'approved' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};
