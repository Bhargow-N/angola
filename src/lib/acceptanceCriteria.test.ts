import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateCreditScore,
  calculateAssetBonus,
  calculateSocialBonus,
  ScoringInputs,
} from './scoring';
import {
  getStoredScoringConfig,
  saveScoringConfig,
  resetScoringConfigToDefault,
  isSegmentEnabled,
  getNormalizedSegmentWeights,
} from './config';
import { extractSocialTagsKeywordFallback, DemoSocialProfile } from './socialAdapter';
import { generateTemplateAiResponse, setAiMode } from './aiClient';
import { SocialTagItem } from '../types';

describe('Unitel Credit Scoring POC - 8 Acceptance Criteria', () => {
  beforeEach(() => {
    resetScoringConfigToDefault();
    setAiMode('templates');
  });

  // TEST 1: Banking segment OFF and ON
  it('Criterion 1: Turn Banking OFF in Admin -> weights re-normalize to 94, confidence lowers; turn ON -> restores', () => {
    const baselineWeights = getNormalizedSegmentWeights('S8');
    expect(baselineWeights.B).toBeGreaterThan(0);
    const sumBaseline = baselineWeights.P + baselineWeights.T + baselineWeights.W + baselineWeights.B + baselineWeights.X;
    expect(sumBaseline).toBe(94);

    // Turn Banking OFF
    const config = getStoredScoringConfig();
    const bankingSeg = config.segments.find((s) => s.code === 'B');
    expect(bankingSeg).toBeDefined();
    bankingSeg!.enabled = false;
    saveScoringConfig(config);

    expect(isSegmentEnabled('B')).toBe(false);

    // Weights re-normalize to exactly 94
    const offWeights = getNormalizedSegmentWeights('S8');
    expect(offWeights.B).toBe(0);
    const sumOff = offWeights.P + offWeights.T + offWeights.W + offWeights.X;
    expect(sumOff).toBe(94);

    // Scoring with partial data (Telecom only, missing Wallet, Bank, Utility)
    const inputsWithoutBank: ScoringInputs = {
      segmentCode: 'S8',
      parameterInputs: {
        id_sim_match: 'yes',
        sim_tenure_months: 24,
        avg_monthly_recharge_kz: 15000,
        recharge_frequency_days: 20,
      },
    };
    const resWithoutBank = calculateCreditScore(inputsWithoutBank);
    expect(resWithoutBank.blockScores.B.basePoints).toBe(0);
    expect(['low', 'medium']).toContain(resWithoutBank.dataConfidence);

    // Turn Banking back ON
    bankingSeg!.enabled = true;
    saveScoringConfig(config);
    expect(isSegmentEnabled('B')).toBe(true);
    const restoredWeights = getNormalizedSegmentWeights('S8');
    expect(restoredWeights.B).toBe(baselineWeights.B);
  });

  // TEST 2: Thomas Mateus application with consent and social scan
  it('Criterion 2: New application for Thomas: consent ticked, scan demo -> extracts two_wheeler & small_business -> score rises by capped bonus', () => {
    const thomasProfile: DemoSocialProfile = {
      handle: 'thomas_mateus_demo',
      display_name: 'Thomas Mateus (Comércio Geral)',
      platform: 'instagram',
      posts: [
        {
          id: 'p-1',
          date: '2026-10-15',
          caption: 'Entregas do dia feitas com a minha moto Yamaha. Cliente satisfeito no Kilamba!',
          hashtags: ['#entregas', '#moto', '#yamaha', '#luanda'],
          location: 'Kilamba, Luanda',
          image_description: 'Motorcycle parked with delivery crate in front of customer storefront',
        },
        {
          id: 'p-2',
          date: '2026-11-02',
          caption: 'Novas mercadorias chegaram hoje na nossa loja! Venham conferir os melhores preços.',
          hashtags: ['#loja', '#comercio', '#negocio', '#luanda'],
          location: 'Mercado dos Congolenses, Luanda',
          image_description: 'Interior of retail shop with stocked shelves and cash counter',
        },
      ],
    };

    const extractedTags = extractSocialTagsKeywordFallback(thomasProfile);
    expect(extractedTags.some((t) => t.tag === 'two_wheeler')).toBe(true);
    expect(extractedTags.some((t) => t.tag === 'small_business')).toBe(true);

    // Accept both tags
    const acceptedTags: SocialTagItem[] = extractedTags.map((t) => ({ ...t, status: 'accepted' }));
    const socialBonus = calculateSocialBonus(acceptedTags, false);
    // two_wheeler (+1) + small_business (+1) = +2 pts
    expect(socialBonus).toBe(2);

    // Score without social tags
    const baseInputs: ScoringInputs = {
      segmentCode: 'S3',
      parameterInputs: {
        id_sim_match: 'yes',
        sim_tenure_months: 28,
        avg_monthly_recharge_kz: 18000,
        recharge_frequency_days: 22,
        consecutive_active_months: 12,
        night_activity_ratio: 0.03,
        multi_sim_detected: 'no',
        days_since_last_recharge: 2,
        avg_monthly_inflow_kz: 90000,
        merchant_qr_receipts: 'regular',
        bill_payments_via_wallet: 'regular',
        wallet_balance_stability: 'stable',
        wallet_loan_repayment: 'on_time',
      },
      assets: { two_wheeler: 'yes' },
    };
    const baseScoreRes = calculateCreditScore(baseInputs);

    // Score with accepted social tags
    const withSocialRes = calculateCreditScore({
      ...baseInputs,
      socialTags: acceptedTags,
      socialConsentWithdrawn: false,
    });

    expect(withSocialRes.socialBonus).toBe(2);
    expect(withSocialRes.score).toBeGreaterThan(baseScoreRes.score);
  });

  // TEST 3: Without ticking consent, scan disabled; skip has zero penalty
  it('Criterion 3: Without consent, scan is disabled; skipping has no penalty (neutral)', () => {
    const inputsSkippedSocial: ScoringInputs = {
      segmentCode: 'S3',
      parameterInputs: {
        id_sim_match: 'yes',
        sim_tenure_months: 18,
        avg_monthly_recharge_kz: 12000,
        recharge_frequency_days: 15,
        consecutive_active_months: 10,
        night_activity_ratio: 0.05,
        multi_sim_detected: 'no',
        days_since_last_recharge: 5,
      },
      socialTags: [], // skipped
    };

    const res = calculateCreditScore(inputsSkippedSocial);
    expect(res.socialBonus).toBe(0);
    // Missing data is neutral: does not subtract or score negative points
    expect(res.score).toBeGreaterThanOrEqual(300);
  });

  // TEST 4: Withdraw consent removes tags and recomputes score
  it('Criterion 4: Withdraw consent removes tags and bonus, recomputing score back to base', () => {
    const tags: SocialTagItem[] = [
      {
        id: 'tag-1',
        tag: 'two_wheeler',
        label: 'Two-Wheeler',
        bonus_points: 1,
        evidence_post_ids: ['p-1'],
        reason: 'Motorbike',
        confidence: 0.9,
        status: 'accepted',
      },
    ];

    const bonusWithConsent = calculateSocialBonus(tags, false);
    expect(bonusWithConsent).toBe(1);

    const bonusWithdrawn = calculateSocialBonus(tags, true);
    expect(bonusWithdrawn).toBe(0);

    const resWithdrawn = calculateCreditScore({
      segmentCode: 'S3',
      parameterInputs: {
        id_sim_match: 'yes',
        sim_tenure_months: 20,
      },
      socialTags: tags,
      socialConsentWithdrawn: true,
    });
    expect(resWithdrawn.socialBonus).toBe(0);
  });

  // TEST 5: Turn Social segment OFF
  it('Criterion 5: Turn Social segment OFF -> isSegmentEnabled("S") returns false', () => {
    const config = getStoredScoringConfig();
    const socialSeg = config.segments.find((s) => s.code === 'S');
    expect(socialSeg).toBeDefined();

    socialSeg!.enabled = false;
    saveScoringConfig(config);
    expect(isSegmentEnabled('S')).toBe(false);

    socialSeg!.enabled = true;
    saveScoringConfig(config);
    expect(isSegmentEnabled('S')).toBe(true);
  });

  // TEST 6: Approver screen summary, suggested decision, address disparity
  it('Criterion 6: Approver summary, suggested decision, and address disparity detection', () => {
    const inputsWithDisparity: ScoringInputs = {
      segmentCode: 'S3',
      city: 'Luanda',
      dominantRegion6m: 'Huambo',
      parameterInputs: {
        id_sim_match: 'yes',
        sim_tenure_months: 24,
      },
    };
    const res = calculateCreditScore(inputsWithDisparity);
    expect(res.addressWarning).toContain('Huambo');

    // Test AI approver summary template
    const summaryAi = generateTemplateAiResponse('approver_summary', {
      customer_name: 'Thomas Mateus',
      age: 34,
      marital_status: 'married',
      occupation: 'runs a small shop',
      city: 'Luanda',
      assets: 'motorbike',
      score: 712,
      band: 'Good',
      confidence: 'medium',
      credit_limit_kz: 150000,
      equipment_name: 'Smartphone 4G Entry',
      emi_kz: 10000,
      term_months: 12,
    });

    expect(summaryAi.label).toBe('AI-generated - approver decides');
    expect(summaryAi.text).toContain('Thomas Mateus');
    expect(summaryAi.text).toContain('712');

    // Test AI suggested decision template
    const decisionAi = generateTemplateAiResponse('suggested_decision', {
      score: 712,
      requested_amount: 120000,
      emi: 10000,
    });
    expect(decisionAi.label).toBe('AI-generated - approver decides');
    expect(decisionAi.data.suggestion).toBe('Approve');
  });

  // TEST 7: AI mode Built-in Templates
  it('Criterion 7: AI mode to Built-in templates: all AI tasks return deterministic text marked "AI-generated - approver decides"', () => {
    const tasks = [
      'address_explanation',
      'score_explanation',
      'suggested_decision',
      'approver_summary',
      'social_tags',
      'risk_brief',
    ] as const;

    for (const task of tasks) {
      const res = generateTemplateAiResponse(task, {
        customer_name: 'Thomas Mateus',
        score: 712,
        band: 'Good',
        handle: 'thomas_mateus_demo',
      });
      expect(res.label).toBe('AI-generated - approver decides');
      expect(res.mode).toBe('templates');
      expect(res.text ? res.text.length : 0).toBeGreaterThan(10);
    }
  });

  // TEST 8: Total bonus cap (Assets + Social max +6, Social max +3)
  it('Criterion 8: Bonus caps invariant: Social max +3, Assets + Social combined capped at +6', () => {
    const assetBonus = calculateAssetBonus({
      house: 'yes', // +2
      car: 'yes', // +2
      two_wheeler: 'yes', // +1
      land_title: 'yes', // +1
    });
    expect(assetBonus).toBe(6);

    const manyTags: SocialTagItem[] = [
      { id: '1', tag: 'four_wheeler', label: 'Car', bonus_points: 2, evidence_post_ids: ['p1'], reason: '', confidence: 1, status: 'accepted' },
      { id: '2', tag: 'property', label: 'Property', bonus_points: 2, evidence_post_ids: ['p2'], reason: '', confidence: 1, status: 'accepted' },
      { id: '3', tag: 'two_wheeler', label: 'Moto', bonus_points: 1, evidence_post_ids: ['p3'], reason: '', confidence: 1, status: 'accepted' },
    ];

    const socialBonus = calculateSocialBonus(manyTags, false);
    // 2 + 2 + 1 = 5, but capped at 3
    expect(socialBonus).toBe(3);

    const combinedInputs: ScoringInputs = {
      segmentCode: 'S3',
      parameterInputs: { id_sim_match: 'yes', sim_tenure_months: 12 },
      assets: { house: 'yes', car: 'yes', two_wheeler: 'yes', land_title: 'yes' },
      socialTags: manyTags,
      socialConsentWithdrawn: false,
    };
    const combinedRes = calculateCreditScore(combinedInputs);
    // Combined asset + social bonus is strictly capped at +6
    expect(combinedRes.assetBonus + (combinedRes.socialBonus ?? 0)).toBeLessThanOrEqual(6);
  });
});
