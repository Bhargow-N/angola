import React, { useState, useEffect } from 'react';
import { BlockCode, SegmentSwitchItem, ScoringConfiguration } from '../types';
import {
  getStoredScoringConfig,
  saveScoringConfig,
  resetScoringConfigToDefault,
  getNormalizedSegmentWeights,
} from '../lib/config';
import { getAiMode, setAiMode } from '../lib/aiClient';
import {
  Sliders,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Info,
  ShieldCheck,
  Smartphone,
  Wallet,
  Landmark,
  Zap,
  Share2,
  Home,
  Check,
} from 'lucide-react';

const BLOCK_ICONS: Record<BlockCode, React.ElementType> = {
  P: ShieldCheck,
  T: Smartphone,
  W: Wallet,
  B: Landmark,
  X: Zap,
  S: Share2,
  A: Home,
};

export const SegmentSwitchesCard: React.FC = () => {
  const [config, setConfig] = useState<ScoringConfiguration>(() => getStoredScoringConfig());
  const [saveNotice, setSaveNotice] = useState<string>('');
  const [aiModeState, setAiModeState] = useState<'api' | 'templates' | 'off'>(() => getAiMode());

  // Listen to external updates
  useEffect(() => {
    const handleStorage = () => {
      setConfig(getStoredScoringConfig());
      setAiModeState(getAiMode());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleToggleSegment = (code: BlockCode) => {
    if (code === 'A') {
      const updated: ScoringConfiguration = {
        ...config,
        assets_bonus_enabled: !config.assets_bonus_enabled,
        updated_at: new Date().toISOString(),
      };
      saveScoringConfig(updated);
      setConfig(updated);
      const action = !config.assets_bonus_enabled ? 'ENABLED' : 'DISABLED';
      setSaveNotice(`Assets Bonus switch ${action}.`);
      setTimeout(() => setSaveNotice(''), 3000);
      return;
    }

    const updatedSegments = config.segments.map((s) =>
      s.code === code ? { ...s, enabled: !s.enabled } : s
    );
    const target = config.segments.find((s) => s.code === code);
    const updated: ScoringConfiguration = {
      ...config,
      segments: updatedSegments,
      updated_at: new Date().toISOString(),
    };

    saveScoringConfig(updated);
    setConfig(updated);

    const action = target && !target.enabled ? 'ENABLED' : 'DISABLED';
    setSaveNotice(`Segment "${target?.name || code}" ${action}. Scoring weights re-normalized to 94 base points.`);
    setTimeout(() => setSaveNotice(''), 3000);
  };

  const handleResetToDefault = () => {
    const def = resetScoringConfigToDefault();
    setConfig(def);
    setAiMode('templates');
    setAiModeState('templates');
    setSaveNotice('Scoring configuration and segment weights successfully restored to default.');
    setTimeout(() => setSaveNotice(''), 3000);
  };

  const handleSelectAiMode = (mode: 'api' | 'templates' | 'off') => {
    setAiMode(mode);
    setAiModeState(mode);
    const updated: ScoringConfiguration = { ...config, ai_mode: mode };
    saveScoringConfig(updated);
    setConfig(updated);
    setSaveNotice(`AI Mode set to "${mode.toUpperCase()}". All AI features labeled "AI-generated - approver decides".`);
    setTimeout(() => setSaveNotice(''), 3000);
  };

  // Preview normalized weights for standard S3 segment
  const normalizedS3 = getNormalizedSegmentWeights('S3');
  const activeBaseBlocks = (['P', 'T', 'W', 'B', 'X'] as BlockCode[]).filter(
    (code) => config.segments.find((s) => s.code === code)?.enabled
  );
  const activeBaseSum = activeBaseBlocks.reduce(
    (sum, code) => sum + (normalizedS3[code] || 0),
    0
  );

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border-2 border-orange/40 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-orange-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-orange" />
            <h2 className="text-base sm:text-lg font-black font-heading text-slate-900">
              Segment Switches & Dynamic Scoring Configuration
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange/10 text-orange font-bold">
              {config.version_label || config.version_id}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Toggle segment blocks ON/OFF. Disabling a segment excludes it from scoring, hides its form steps, and re-normalizes remaining weights to sum to 94 base points.
          </p>
        </div>

        <button
          type="button"
          onClick={handleResetToDefault}
          className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
        >
          <RotateCcw className="w-3.5 h-3.5 text-orange" />
          <span>Reset to Default</span>
        </button>
      </div>

      {/* Notice Banner */}
      {saveNotice && (
        <div className="p-3 rounded-xl bg-orange-soft/60 border border-orange-200 text-xs text-orange font-semibold flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-orange shrink-0" />
          <span>{saveNotice}</span>
        </div>
      )}

      {/* Segment Switches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {config.segments.map((item: SegmentSwitchItem) => {
          const code = item.code;
          const isEnabled = item.enabled;
          const Icon = BLOCK_ICONS[code] || ShieldCheck;
          const isSocial = code === 'S';
          const normWeight = normalizedS3[code];

          return (
            <div
              key={code}
              className={`p-4 rounded-xl border transition-all space-y-3 ${
                isEnabled
                  ? 'border-orange/60 bg-gradient-to-b from-white to-orange-50/20 shadow-xs'
                  : 'border-slate-200 bg-slate-50/80 opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                      isEnabled ? 'bg-orange text-white' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-900">{item.name}</span>
                      <span className="text-[10px] font-mono px-1 rounded bg-slate-100 text-slate-600">
                        {code}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 block font-mono">
                      {isSocial ? 'Bonus Module (Max +3 pts)' : `Base Weight: ${item.base_weight} pts`}
                    </span>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  type="button"
                  onClick={() => handleToggleSegment(code)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isEnabled ? 'bg-orange' : 'bg-slate-300'
                  }`}
                  title={`Toggle ${item.name}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      isEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">
                {item.description}
              </p>

              {/* Dynamic Status Tag */}
              <div className="flex items-center justify-between text-[10px] border-t border-slate-100 pt-2">
                <span className="font-medium text-slate-500">
                  {isSocial
                    ? isEnabled ? 'Max Social Bonus: +3 pts' : 'Social step hidden'
                    : isEnabled
                    ? `Normalized: ${normWeight ? Math.round(normWeight * 10) / 10 : item.base_weight} pts`
                    : 'Excluded from score'}
                </span>
                <span
                  className={`font-mono font-bold uppercase ${
                    isEnabled ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {isEnabled ? 'ACTIVE' : 'OFF'}
                </span>
              </div>
            </div>
          );
        })}

        {/* Assets Bonus Separate Switch Card */}
        <div
          className={`p-4 rounded-xl border transition-all space-y-3 ${
            config.assets_bonus_enabled
              ? 'border-orange/60 bg-gradient-to-b from-white to-orange-50/20 shadow-xs'
              : 'border-slate-200 bg-slate-50/80 opacity-70'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                  config.assets_bonus_enabled ? 'bg-orange text-white' : 'bg-slate-200 text-slate-500'
                }`}
              >
                <Home className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-xs text-slate-900">Assets Bonus Switch</span>
                  <span className="text-[10px] font-mono px-1 rounded bg-slate-100 text-slate-600">
                    A
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 block font-mono">
                  Separate Bonus (Max +6 pts)
                </span>
              </div>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              onClick={() => handleToggleSegment('A')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.assets_bonus_enabled ? 'bg-orange' : 'bg-slate-300'
              }`}
              title="Toggle Assets Bonus Switch"
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  config.assets_bonus_enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">
            Independent bonus for verified home, land title, motor vehicle, or two-wheeler ownership.
          </p>

          <div className="flex items-center justify-between text-[10px] border-t border-slate-100 pt-2">
            <span className="font-medium text-slate-500">
              {config.assets_bonus_enabled ? 'Assets + Social Capped at +6 pts' : 'Assets Bonus Disabled (0 pts)'}
            </span>
            <span
              className={`font-mono font-bold uppercase ${
                config.assets_bonus_enabled ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              {config.assets_bonus_enabled ? 'ACTIVE' : 'OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* Re-Normalization Invariant Summary */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-orange shrink-0" />
          <span>
            <strong>Active Invariant:</strong> {activeBaseBlocks.length} base blocks enabled summing to exactly{' '}
            <span className="font-mono font-bold text-orange">{Math.round(activeBaseSum)}</span> base points.
            Missing data is neutral (lowers confidence, never scored as zero).
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          {activeBaseBlocks.map((b) => (
            <span key={b} className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-bold">
              {b}:{Math.round((normalizedS3[b] || 0) * 10) / 10}
            </span>
          ))}
        </div>
      </div>

      {/* Section 2: AI Mode Setting */}
      <div className="border-t border-orange-100 pt-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange" />
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            AI Assistant Configuration (POST /api/ai/:task)
          </h3>
          <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-medium">
            AI-generated - approver decides
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['templates', 'api', 'off'] as const).map((mode) => {
            const isCurrent = aiModeState === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => handleSelectAiMode(mode)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isCurrent
                    ? 'border-orange bg-orange-soft/40 shadow-xs ring-1 ring-orange'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-slate-900 uppercase">
                    {mode === 'templates' ? 'Built-in Templates' : mode === 'api' ? 'Live API Provider' : 'AI Features Off'}
                  </span>
                  {isCurrent && <Check className="w-3.5 h-3.5 text-orange" />}
                </div>
                <span className="text-[11px] text-slate-500 block leading-snug">
                  {mode === 'templates'
                    ? 'Deterministic rule-based synthesis without external API dependencies.'
                    : mode === 'api'
                    ? 'Queries backend AI provider (.env AI_PROVIDER, AI_API_KEY, AI_MODEL).'
                    : 'Disables all AI explanations and tag extraction.'}
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-[11px] text-slate-500 italic bg-slate-50 p-2.5 rounded-lg border border-slate-200">
          Rule Compliance: AI never calculates credit scores and never makes loan decisions. All AI outputs are strictly suggestions displayed in cards marked "AI-generated - approver decides".
        </div>
      </div>
    </div>
  );
};
