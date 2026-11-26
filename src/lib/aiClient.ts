// AI Client Utility for Unitel Credit Scoring POC
// Provides unified access to POST /api/ai/:task with high-fidelity deterministic template fallback
// Labels all AI outputs as "AI-generated - approver decides"

import { getStoredScoringConfig, saveScoringConfig } from './config';
import { formatKz } from './money';

export type AiTask =
  | 'address_explanation'
  | 'score_explanation'
  | 'suggested_decision'
  | 'approver_summary'
  | 'social_tags'
  | 'risk_brief';

export interface AiTaskResult<T = any> {
  task: AiTask;
  label: 'AI-generated - approver decides';
  mode: 'api' | 'templates' | 'off';
  data: T;
  text?: string;
  disabled?: boolean;
}

export function getAiMode(): 'api' | 'templates' | 'off' {
  const config = getStoredScoringConfig();
  return config.ai_mode || 'templates';
}

export function setAiMode(mode: 'api' | 'templates' | 'off'): void {
  const config = getStoredScoringConfig();
  config.ai_mode = mode;
  saveScoringConfig(config);
}

// Deterministic built-in templates
export function generateTemplateAiResponse(task: AiTask, payload: any): AiTaskResult {
  const label: 'AI-generated - approver decides' = 'AI-generated - approver decides';

  switch (task) {
    case 'address_explanation': {
      const { customer_name = 'Subscriber', bi_city = 'Luanda', dominant_region_6m = 'Huambo' } = payload || {};
      const text = `Applicant ${customer_name}'s National ID (BI) residence is officially registered in ${bi_city}, whereas primary SIM cell-tower activity over the past 6 months is predominantly concentrated in ${dominant_region_6m}. This geographical disparity indicates recent relocation, inter-province trade migration, or dual residency. Recommendation: approver should request a secondary proof of address (utility bill or employer verification) prior to credit finalization.`;
      return { task, label, mode: 'templates', text, data: { disparity: true, bi_city, dominant_region_6m, recommendation: 'Request secondary proof of address' } };
    }

    case 'score_explanation': {
      const { score = 650, band = 'Acceptable', customer_name = 'Applicant', highest_block = 'Telecom', lowest_block = 'Banking' } = payload || {};
      const text = `Credit Evaluation Analysis for ${customer_name}: A score of ${score} places this applicant in the ${band} risk category. What raised the score: Strong mobile tenure and consistent airtime top-up frequency across the preceding 12 months (${highest_block}). What held it back: Absence of formal commercial banking relationship or thin digital wallet transactional history (${lowest_block}). How to improve: Consistently executing Unitel Money utility bill payments and maintaining 15+ active airtime recharge days will qualify applicant for higher financing tiers.`;
      return {
        task,
        label,
        mode: 'templates',
        text,
        data: {
          what_raised: 'Strong mobile tenure and consistent airtime top-up frequency across the preceding 12 months.',
          what_held_back: 'Absence of formal commercial banking relationship or thin digital wallet transactional history.',
          how_to_improve: 'Regular Unitel Money transactions and utility bill payments will elevate credit tier on next review.',
        },
      };
    }

    case 'suggested_decision': {
      const { score = 650, requested_amount = 85000, emi = 8500 } = payload || {};
      if (score >= 700) {
        return {
          task,
          label,
          mode: 'templates',
          text: `Suggested Decision: APPROVE (Tier 1 Standard). Repayment term up to 12 months with 0 Kz downpayment (approx monthly EMI ${emi.toLocaleString()} Kz for ${requested_amount.toLocaleString()} Kz limit). Consistent telecommunications profile and verified identity indicate low default risk.`,
          data: {
            suggestion: 'Approve',
            tier: 'Tier 1 - Standard / Premium',
            term_months: 12,
            downpayment_kz: 0,
            reason: 'Consistent recharge patterns, verified KYC, and low debt-service ratio.',
          },
        };
      } else if (score >= 550) {
        const downpayment = Math.round(requested_amount * 0.15);
        return {
          task,
          label,
          mode: 'templates',
          text: `Suggested Decision: REVIEW (Tier 2 Starter). Recommend conditional approval with a 6-month repayment term and a 15% upfront downpayment (${formatKz(downpayment)}).`,
          data: {
            suggestion: 'Review',
            tier: 'Tier 2 - Starter / Standard',
            term_months: 6,
            downpayment_kz: downpayment,
            reason: 'Acceptable telecom history; recommend verifying secondary contact or 15% upfront downpayment.',
          },
        };
      } else {
        return {
          task,
          label,
          mode: 'templates',
          text: `Suggested Decision: REJECT. High risk profile with insufficient subscriber tenure and lack of supporting collateral. Re-evaluation recommended in 90 days.`,
          data: {
            suggestion: 'Reject',
            tier: 'Not Eligible',
            term_months: 0,
            downpayment_kz: 0,
            reason: 'Insufficient SIM activity tenure and unverified alternative documentation.',
          },
        };
      }
    }

    case 'approver_summary': {
      const {
        customer_name = 'Thomas Mateus',
        age = 34,
        marital_status = 'married',
        occupation = 'runs a small shop',
        city = 'Luanda',
        assets = ['motorbike'],
        score = 712,
        band = 'Good',
        confidence = 'High',
        credit_limit = 150000,
        equipment_name = 'Smartphone 4G Mid',
        emi_amount = 10000,
        term_months = 12,
      } = payload || {};

      const assetsStr = Array.isArray(assets) && assets.length > 0
        ? `Owns ${assets.join(' and ')}.`
        : assets && typeof assets === 'string'
        ? `Owns ${assets}.`
        : 'No verified motor/property assets.';
      const text = `${customer_name}, ${age}, ${marital_status}, ${occupation} in ${city}. ${assetsStr} Score ${score} (${band}), Data confidence ${confidence}. Wants ${equipment_name} on a ${term_months}-month EMI of about ${formatKz(emi_amount)}, within approved credit limit of ${formatKz(credit_limit)}.`;

      return {
        task,
        label,
        mode: 'templates',
        text,
        data: { summary: text },
      };
    }

    case 'social_tags': {
      const { posts = [], handle = '' } = payload || {};
      const tags: any[] = [];
      const postText = posts.map((p: any) => `${p.caption || ''} ${p.image_description || ''} ${(p.hashtags || []).join(' ')}`).join(' ').toLowerCase();

      if (/moto|bike|honda|yamaha|scooter|motociclo/.test(postText)) {
        tags.push({
          type: 'two_wheeler',
          evidence: ['p-1'],
          reason: 'Subscriber posts show personal two-wheeler transport in active use.',
          confidence: 0.92,
          bonus_points: 1,
        });
      }
      if (/carro|car|toyota|veiculo|automovel|hilux/.test(postText)) {
        const isBlurry = /unclear|blurry|maybe/.test(postText);
        tags.push({
          type: 'four_wheeler',
          evidence: ['p-car'],
          reason: isBlurry ? 'Possible vehicle photo detected with low image confidence.' : 'Personal vehicle in regular use shown in verified posts.',
          confidence: isBlurry ? 0.35 : 0.88,
          bonus_points: 2,
        });
      }
      if (/loja|mercado|comercio|vendas|banca|produtos|mini-mercado/.test(postText)) {
        tags.push({
          type: 'small_business',
          evidence: ['p-2'],
          reason: 'Commercial activity and retail shopfront identified in business posts.',
          confidence: 0.89,
          bonus_points: 1,
        });
      }
      if (/casa|terreno|propriedade|obra|construcao/.test(postText)) {
        tags.push({
          type: 'property',
          evidence: ['p-prop'],
          reason: 'Residential property improvement or ownership documentation in posts.',
          confidence: 0.75,
          bonus_points: 2,
        });
      }

      return {
        task,
        label,
        mode: 'templates',
        text: `Extracted ${tags.length} evidence tag(s) from public social profile @${handle}.`,
        data: { tags },
      };
    }

    case 'risk_brief': {
      const {
        total_applications = 14,
        approval_rate = '71%',
        avg_score = 668,
        active_portfolio_kz = 3450000,
      } = payload || {};

      const text = `Executive Portfolio Risk Brief: The financing portfolio currently tracks ${total_applications} evaluated applications with a cumulative approval rate of ${approval_rate}. The portfolio mean subscriber proxy score stands at ${avg_score} (Acceptable/Good tier) with total financed equipment value of ${formatKz(active_portfolio_kz)}. Key Underwriting Recommendation: Expand financing allowances for Unitel Money wallet merchants who hold a 12+ month SIM tenure, while enforcing a mandatory 15% downpayment on applicants with thin utility verification.`;

      return {
        task,
        label,
        mode: 'templates',
        text,
        data: {
          summary: text,
          recommendation: 'Expand merchant limits while enforcing 15% downpayment on unverified utility subscribers.',
        },
      };
    }
  }
}

// Call AI API or return template
export async function callAiTask(task: AiTask, payload: any): Promise<AiTaskResult> {
  const mode = getAiMode();
  const label: 'AI-generated - approver decides' = 'AI-generated - approver decides';

  if (mode === 'off') {
    return {
      task,
      label,
      mode: 'off',
      disabled: true,
      text: undefined,
      data: null,
    };
  }

  if (mode === 'templates') {
    return generateTemplateAiResponse(task, payload);
  }

  // mode === 'api': attempt POST to server
  try {
    const res = await fetch(`/api/ai/${task}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const json = await res.json();
      return {
        task,
        label,
        mode: 'api',
        text: json.text,
        data: json.data || json,
      };
    }
  } catch (err) {
    console.warn(`[AIClient] Server AI call failed for ${task}, falling back to template:`, err);
  }

  // Graceful fallback to deterministic template
  return generateTemplateAiResponse(task, payload);
}
