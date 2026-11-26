import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Calculator,
  Layers,
  Share2,
  ShieldAlert,
  Smartphone,
  CreditCard,
  UserCheck,
  Mail,
  History,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface WorkflowStage {
  id: string;
  number: number;
  title: string;
  sentence: string;
  icon: React.ElementType;
  mockComponent: React.ReactNode;
}

export const HowItWorks: React.FC = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState<number>(1);

  const stages: WorkflowStage[] = [
    {
      id: 'dashboard',
      number: 1,
      title: 'Dashboard',
      sentence: 'Monitors real-time portfolio health, score band distributions, and thin-file financial inclusion rates.',
      icon: LayoutDashboard,
      mockComponent: (
        <div className="bg-slate-900 text-white rounded-xl p-4 space-y-3 font-sans text-xs">
          <div className="flex justify-between items-center border-b border-slate-700 pb-2">
            <span className="font-bold text-orange">Portfolio Overview</span>
            <span className="bg-green-600/30 text-green-400 text-[10px] px-2 py-0.5 rounded-full font-mono">LIVE SYNC</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-800 p-2.5 rounded-lg border border-slate-700">
              <span className="text-slate-400 text-[10px] block">Mean Score</span>
              <span className="text-base font-black text-amber-400">668</span>
            </div>
            <div className="bg-slate-800 p-2.5 rounded-lg border border-slate-700">
              <span className="text-slate-400 text-[10px] block">Approval Rate</span>
              <span className="text-base font-black text-teal-400">71%</span>
            </div>
            <div className="bg-slate-800 p-2.5 rounded-lg border border-slate-700">
              <span className="text-slate-400 text-[10px] block">Financed Kz</span>
              <span className="text-base font-black text-orange-400">3.45M</span>
            </div>
          </div>
          <div className="h-10 bg-slate-800/80 rounded-lg flex items-end gap-1 px-2 pb-1 border border-slate-700">
            <div className="w-1/5 bg-red-500 h-2 rounded-t" />
            <div className="w-1/5 bg-amber-500 h-4 rounded-t" />
            <div className="w-1/5 bg-teal-500 h-8 rounded-t" />
            <div className="w-1/5 bg-emerald-500 h-6 rounded-t" />
            <div className="w-1/5 bg-blue-500 h-3 rounded-t" />
          </div>
        </div>
      ),
    },
    {
      id: 'evaluation',
      number: 2,
      title: 'Credit Score Evaluation',
      sentence: 'Analyst enters subscriber KYC, mobile tenure, and financial data points with automatic Unitel pre-fill.',
      icon: Calculator,
      mockComponent: (
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-2.5 text-xs text-slate-700">
          <div className="flex justify-between items-center font-bold text-slate-900 border-b pb-1.5">
            <span>Evaluation: Matthew Silva</span>
            <span className="text-orange text-[10px] font-mono">+244 923 000 101</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between py-1 px-2 rounded bg-slate-50 border border-slate-100">
              <span>SIM Tenure (T)</span>
              <strong className="text-slate-900 font-mono">30 Months (High)</strong>
            </div>
            <div className="flex justify-between py-1 px-2 rounded bg-slate-50 border border-slate-100">
              <span>Monthly Inflow (W)</span>
              <strong className="text-slate-900 font-mono">120,000 Kz</strong>
            </div>
            <div className="flex justify-between py-1 px-2 rounded bg-slate-50 border border-slate-100">
              <span>National ID (BI) Match</span>
              <span className="text-emerald-700 font-bold">Verified</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'segments',
      number: 3,
      title: 'Segments',
      sentence: 'Selects underwriting rule sets and dynamically tunes segment block weights with automatic re-normalization.',
      icon: Layers,
      mockComponent: (
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-2 text-xs">
          <div className="font-bold text-slate-900 border-b pb-1">Segment Weight Normalization</div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-600">Telecom (T)</span>
              <span className="font-mono font-bold text-teal-700">30 pts (31.9%)</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-teal-600 h-full w-[32%]" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-600">Unitel Money (W)</span>
              <span className="font-mono font-bold text-purple-700">20 pts (21.3%)</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-purple-600 h-full w-[21%]" />
            </div>
          </div>
          <div className="text-[11px] text-slate-500 italic mt-1">
            Total active base blocks invariant: exactly 94 base points.
          </div>
        </div>
      ),
    },
    {
      id: 'social',
      number: 4,
      title: 'Social Consent',
      sentence: 'Subscriber explicitly consents to public post analysis for unverified physical asset and business signals.',
      icon: Share2,
      mockComponent: (
        <div className="bg-white rounded-xl p-4 border-2 border-orange/40 shadow-sm space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900">Social Media Verification</span>
            <span className="bg-orange/10 text-orange font-bold text-[10px] px-2 py-0.5 rounded">Optional</span>
          </div>
          <div className="p-2 rounded-lg bg-orange-50/60 border border-orange-200 text-[11px] text-slate-700 space-y-1">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked readOnly className="rounded text-orange" />
              <span className="font-medium">Consent confirmed by subscriber</span>
            </div>
            <div className="text-[10px] text-slate-500 pl-5">Instagram: @thomas_mateus_demo</div>
          </div>
          <div className="flex gap-1.5">
            <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-[10px] font-bold text-blue-700">
              🛵 two_wheeler (+1)
            </span>
            <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded text-[10px] font-bold text-emerald-700">
              🏬 small_business (+1)
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'limit',
      number: 5,
      title: 'Credit Limit',
      sentence: 'Calculates the baseline financing envelope using score band thresholds and verified monthly income caps.',
      icon: ShieldAlert,
      mockComponent: (
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-2 text-xs">
          <div className="flex justify-between items-center border-b pb-1 font-bold">
            <span className="text-slate-900">Approved Credit Limit</span>
            <span className="text-emerald-600 font-mono text-sm">150,000 Kz</span>
          </div>
          <div className="space-y-1 text-slate-600 text-[11px]">
            <div className="flex justify-between">
              <span>Score Tier Baseline:</span>
              <span className="font-mono font-bold text-slate-800">180,000 Kz</span>
            </div>
            <div className="flex justify-between">
              <span>Income Cap Constraint:</span>
              <span className="font-mono font-bold text-slate-800">150,000 Kz</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-bold border-t pt-1">
              <span>Binding Binding Cap:</span>
              <span className="font-mono">150,000 Kz (Standard)</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'equipment',
      number: 6,
      title: 'Equipment',
      sentence: 'Filters available smartphones, routers, and solar devices matching the subscriber’s credit ceiling.',
      icon: Smartphone,
      mockComponent: (
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-2 text-xs">
          <div className="font-bold text-slate-900">Selected Device</div>
          <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-orange text-white flex items-center justify-center font-bold text-xs">
              4G
            </div>
            <div>
              <div className="font-bold text-slate-900">Smartphone 4G Mid</div>
              <div className="text-slate-500 text-[10px]">Price: 120,000 Kz • In Stock</div>
            </div>
            <span className="ml-auto text-emerald-600 font-bold text-[10px]">Within Limit</span>
          </div>
        </div>
      ),
    },
    {
      id: 'emi',
      number: 7,
      title: 'EMI',
      sentence: 'Validates monthly repayment affordability against the strict 30% debt-to-income underwriting cap.',
      icon: CreditCard,
      mockComponent: (
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-2 text-xs">
          <div className="font-bold text-slate-900">Repayment Plan & Affordability</div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 bg-slate-50 rounded border">
              <span className="text-slate-500 block">Monthly Payment</span>
              <strong className="text-slate-900 font-mono text-sm">10,000 Kz/mo</strong>
            </div>
            <div className="p-2 bg-slate-50 rounded border">
              <span className="text-slate-500 block">EMI Income Share</span>
              <strong className="text-emerald-700 font-mono text-sm">13.3% (Safe &lt; 30%)</strong>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'approver',
      number: 8,
      title: 'Approver Summary & Decision',
      sentence: 'Presents structured AI synthesis and risk recommendation for the human approver to adjudicate.',
      icon: UserCheck,
      mockComponent: (
        <div className="bg-gradient-to-r from-orange-50 to-white rounded-xl p-3.5 border-2 border-orange/50 shadow-sm space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-orange font-bold text-[11px]">
              <Sparkles className="w-3.5 h-3.5 text-orange" />
              <span>AI-generated - approver decides</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
              Suggested: Approve
            </span>
          </div>
          <p className="text-[11px] text-slate-700 leading-snug">
            Thomas Mateus, 34, married, runs a small shop in Luanda. Owns a motorbike. Score 712 (Good). Wants a 120,000 Kz phone on 12-month EMI of 10,000 Kz.
          </p>
        </div>
      ),
    },
    {
      id: 'email',
      number: 9,
      title: 'Email',
      sentence: 'Dispatches real-time transactional status and repayment schedules directly to the applicant via Brevo / SMTP.',
      icon: Mail,
      mockComponent: (
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-2 text-xs">
          <div className="flex justify-between items-center text-slate-500 border-b pb-1 text-[11px]">
            <span>To: thomas.mateus@unitel.ao</span>
            <span className="text-emerald-600 font-bold">Dispatched</span>
          </div>
          <div className="font-bold text-slate-900 text-xs">Unitel Credit Approval Notification (CR-007)</div>
          <p className="text-[11px] text-slate-600">
            Parabéns! Your financing request for Smartphone 4G Mid has been approved. Monthly EMI: 10,000 Kz. Pickup ready at Luanda Kinaxixi branch.
          </p>
        </div>
      ),
    },
    {
      id: 'audit',
      number: 10,
      title: 'Audit Log',
      sentence: 'Records an immutable, timestamped ledger of every calculation, social consent, and approval decision.',
      icon: History,
      mockComponent: (
        <div className="bg-slate-950 text-slate-200 rounded-xl p-3.5 space-y-2 text-xs font-mono">
          <div className="flex justify-between text-[10px] text-slate-400 border-b border-slate-800 pb-1">
            <span>IMMUTABLE LEDGER</span>
            <span>SHA-256 SIGNED</span>
          </div>
          <div className="text-[11px] space-y-1">
            <div className="text-emerald-400">17:24:02 • CONSENT_RECORDED [thomas_mateus_demo]</div>
            <div className="text-amber-400">17:24:05 • SOCIAL_TAG_ACCEPTED [two_wheeler, +1 pt]</div>
            <div className="text-blue-400">17:24:18 • APPROVAL_EXECUTED [CR-007, maria.mendes]</div>
          </div>
        </div>
      ),
    },
  ];

  const currentStage = stages[activeStep - 1] || stages[0];

  const handleNext = () => {
    setActiveStep((prev) => Math.min(stages.length, prev + 1));
  };

  const handlePrev = () => {
    setActiveStep((prev) => Math.max(1, prev - 1));
  };

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-orange-100 pb-4">
        <div>
          <h1 className="text-2xl font-black font-heading text-slate-900 flex items-center gap-2">
            <span>How It Works</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange text-white font-mono">
              10-Stage Workflow
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Interactive click-through guide to the Unitel Credit Underwriting & Equipment Financing Lifecycle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/approver/dashboard')}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Go to Dashboard
          </button>
        </div>
      </div>

      {/* 10-Stage Visual Stepper */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-orange-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500 font-bold mb-2">
          <span>WORKFLOW PROGRESSION</span>
          <span className="font-mono text-orange">Stage {activeStep} of {stages.length}</span>
        </div>

        {/* Horizontal scrollable stepper pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          {stages.map((stage) => {
            const isCurrent = stage.number === activeStep;
            const isPassed = stage.number < activeStep;
            const StageIcon = stage.icon;

            return (
              <button
                key={stage.id}
                onClick={() => setActiveStep(stage.number)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                  isCurrent
                    ? 'bg-orange text-white shadow-md shadow-orange/30 ring-2 ring-orange/30 font-black'
                    : isPassed
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                    : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                    isCurrent
                      ? 'bg-white text-orange'
                      : isPassed
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {isPassed ? <CheckCircle2 className="w-3.5 h-3.5" /> : stage.number}
                </span>
                <StageIcon className="w-3.5 h-3.5 opacity-80" />
                <span>{stage.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Stage Display Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Stage Details & Plain Sentence */}
        <div className="lg:col-span-6 bg-white rounded-2xl p-6 sm:p-8 border border-orange-100 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-soft text-orange text-xs font-black uppercase tracking-wider">
              <currentStage.icon className="w-4 h-4" />
              <span>Stage {currentStage.number} of {stages.length}</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black font-heading text-slate-900">
              {currentStage.title}
            </h2>

            {/* Plain one-sentence description required by spec */}
            <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-medium bg-slate-50 p-4 rounded-xl border border-slate-200">
              {currentStage.sentence}
            </p>
          </div>

          {/* Stepper Controls: Next & Back with Animated Arrow */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-100">
            <button
              onClick={handlePrev}
              disabled={activeStep === 1}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            {/* Animated Arrow Connector */}
            <div className="flex items-center gap-1.5 text-orange animate-pulse">
              <span className="w-2 h-2 rounded-full bg-orange" />
              <ArrowRight className="w-4 h-4 text-orange" />
            </div>

            <button
              onClick={handleNext}
              disabled={activeStep === stages.length}
              className="px-5 py-2.5 rounded-xl bg-orange hover:bg-orange-btn text-white text-xs font-bold shadow-md shadow-orange/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all cursor-pointer"
            >
              <span>{activeStep === stages.length ? 'Completed' : 'Next Stage'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Small Mock Card of the Real Screen */}
        <div className="lg:col-span-6 bg-slate-50 rounded-2xl p-6 sm:p-8 border border-slate-200 flex flex-col justify-center space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold uppercase tracking-wider">
            <span>Visual Screen Mockup</span>
            <span className="font-mono text-orange">UI Preview</span>
          </div>

          <div className="w-full transition-all duration-300 transform hover:scale-[1.01]">
            {currentStage.mockComponent}
          </div>

          <div className="text-[11px] text-slate-400 text-center italic pt-1">
            Stage {currentStage.number}: {currentStage.title} interactive preview
          </div>
        </div>
      </div>
    </div>
  );
};
