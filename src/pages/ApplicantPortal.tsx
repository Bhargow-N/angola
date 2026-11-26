import React, { useState } from 'react';
import { LoanApplication } from '../types';
import { getStoredApplications } from '../lib/loans';
import { useSyncDatabase } from '../lib/syncClient';
import { formatKz } from '../lib/money';
import { StatusChip } from '../components/StatusChip';
import {
  Smartphone,
  KeyRound,
  Phone,
  ArrowRight,
  LogOut,
  Clock,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';

export const ApplicantPortal: React.FC = () => {
  const [msisdnInput, setMsisdnInput] = useState<string>('923111222');
  const [demoCodeInput, setDemoCodeInput] = useState<string>('123456');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');

  const [activeApp, setActiveApp] = useState<LoanApplication | null>(null);

  // Sync with shared DB
  useSyncDatabase(() => {
    refreshApplication();
  });

  const refreshApplication = () => {
    const apps = getStoredApplications();
    const cleanPhone = msisdnInput.replace(/[^0-9]/g, '');
    const found = apps.find(
      (a) =>
        (a.evaluation?.customer?.msisdn &&
          a.evaluation.customer.msisdn.replace(/[^0-9]/g, '').includes(cleanPhone)) ||
        (a.id && a.id.toLowerCase() === cleanPhone.toLowerCase())
    );
    if (found) {
      setActiveApp(found);
    } else if (apps.length > 0) {
      // Fallback to latest application
      setActiveApp(apps[0]);
    }
  };

  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError('');

    if (demoCodeInput.trim() !== '123456') {
      setAuthError('Invalid demo access code. Please enter 123456.');
      return;
    }

    if (!msisdnInput.trim()) {
      setAuthError('Please enter your Unitel mobile number.');
      return;
    }

    refreshApplication();
    setIsAuthenticated(true);
  };

  const handleFillDemo = (phone: string, code: string = '123456') => {
    setMsisdnInput(phone);
    setDemoCodeInput(code);
    setAuthError('');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setActiveApp(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
      {/* Top Navigation Bar */}
      <header className="bg-navy border-b border-navy-light text-white px-6 py-4 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange flex items-center justify-center font-bold text-white shadow-xs">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Unitel Smartphone Financing
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange text-white uppercase tracking-wider">
                  Applicant Portal
                </span>
              </h1>
              <p className="text-xs text-slate-300">
                Track your credit limit, application status, and loan repayment
              </p>
            </div>
          </div>

          {isAuthenticated && (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <span className="text-xs font-bold text-white block">
                  {activeApp?.evaluation?.customer?.full_name || 'Thomas Mateus'}
                </span>
                <span className="text-[10px] text-slate-300 font-mono">
                  +244 {msisdnInput}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Log out of applicant portal"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Exit</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto w-full p-6 flex-1">
        {!isAuthenticated ? (
          /* LOGIN SCREEN (Mobile + Demo Code 123456) */
          <div className="max-w-md mx-auto my-12 bg-white rounded-2xl shadow-xl border border-slate-border p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-orange/10 text-orange mx-auto flex items-center justify-center mb-3">
                <KeyRound className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-navy">Applicant Verification</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Enter your Unitel mobile phone number and the demo access code (<strong>123456</strong>) to inspect your loan application and access the conversational loan assistant.
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>Unitel Mobile Number</span>
                </label>
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-orange focus-within:bg-white transition-all">
                  <span className="text-xs font-bold text-slate-400 mr-2">+244</span>
                  <input
                    type="text"
                    value={msisdnInput}
                    onChange={(e) => setMsisdnInput(e.target.value)}
                    placeholder="923 111 222"
                    className="w-full bg-transparent text-xs font-mono font-bold text-slate-800 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>Demo Access Code</span>
                </label>
                <input
                  type="text"
                  value={demoCodeInput}
                  onChange={(e) => setDemoCodeInput(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-hidden focus:border-orange focus:bg-white transition-all tracking-widest text-center"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-orange hover:bg-orange/95 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2"
              >
                <span>Access My Application</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="pt-4 border-t border-slate-100 space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block text-center">
                Quick Demo Access
              </span>
              <button
                type="button"
                onClick={() => handleFillDemo('923111222', '123456')}
                className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-[11px] font-semibold text-slate-700 text-left flex items-center justify-between transition-colors"
              >
                <span>Thomas Mateus (Shop Owner, Luanda)</span>
                <span className="font-mono text-slate-400">923111222</span>
              </button>
            </div>
          </div>
        ) : (
          /* AUTHENTICATED APPLICANT DASHBOARD */
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Status Hero Card */}
            <div className="card-base p-6 rounded-2xl bg-white border border-slate-border shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
                    Application ID: {activeApp?.applicationNo || '10001'}
                  </span>
                  <h2 className="text-xl font-black text-navy mt-0.5">
                    {activeApp?.evaluation?.customer?.full_name || 'Thomas Mateus'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    MSISDN: +244 {msisdnInput} • Registered in {activeApp?.evaluation?.customer?.city || 'Luanda'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block font-medium">Status</span>
                    <StatusChip status={activeApp?.status || 'submitted'} />
                  </div>
                </div>
              </div>

              {/* Status Note Banner */}
              {activeApp?.status === 'cancelled' ? (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Application Cancelled: </strong>
                    This application was cancelled at your request. Confirmation has been dispatched to your contact email. To apply again in the future, visit any Unitel store or submit a new evaluation.
                  </div>
                </div>
              ) : activeApp?.status === 'approved' || activeApp?.status === 'purchased' ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Congratulations! Your Application is Approved: </strong>
                    Your smartphone financing request has been verified. You may collect your equipment at the designated Unitel branch with your Bilhete de Identidade (BI).
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-orange-soft border border-orange-border text-xs text-navy flex items-start gap-3">
                  <Clock className="w-5 h-5 text-orange shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-orange font-bold">Queue Position & Review Status: </strong>
                    Your application is currently under review by our underwriting team. Average turnaround is under 2 hours during business hours.
                  </div>
                </div>
              )}

              {/* Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-border">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Approved Limit
                  </span>
                  <span className="text-lg font-black text-navy mt-1 block">
                    {formatKz(activeApp?.evaluation?.results?.limit_kz || 150000)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    Maximum financing cap
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-border">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Credit Score
                  </span>
                  <span className="text-lg font-black text-navy mt-1 block">
                    {activeApp?.evaluation?.results?.score || 712}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium capitalize">
                    {activeApp?.evaluation?.results?.band_label || 'Good Tier'}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-border">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Equipment Selected
                  </span>
                  <span className="text-sm font-bold text-navy mt-1 block truncate">
                    {activeApp?.equipment?.name || 'Smartphone 4G Mid'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {formatKz(activeApp?.price_kz || 85000)} total value
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-border">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Monthly EMI
                  </span>
                  <span className="text-lg font-black text-orange mt-1 block">
                    {formatKz(activeApp?.monthly_emi_kz || 10000)}/mo
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {activeApp?.term_months || 12}-month repayment plan
                  </span>
                </div>
              </div>
            </div>

            {/* Conversational Assistant Notice Banner */}
            <div className="p-5 rounded-2xl bg-white border border-slate-border shadow-xs flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange/10 text-orange flex items-center justify-center shrink-0">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-navy">
                    Need help or have questions about your loan?
                  </h3>
                  <p className="text-xs text-slate-500">
                    Click the floating <strong>Unitel Assistant</strong> widget at the bottom right. You can ask: &ldquo;What is my status?&rdquo;, &ldquo;How is my score calculated?&rdquo;, &ldquo;Why is my limit this low?&rdquo;, or &ldquo;Cancel my application&rdquo;.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-border py-4 text-center text-xs text-slate-400">
        Unitel S.A. • Automated Smartphone Credit Underwriting POC • All synthetic demo records
      </footer>
    </div>
  );
};
