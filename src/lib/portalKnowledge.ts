/**
 * Auto-Generated Portal Knowledge Base
 * Automatically compiles portal screens, 6-stage underwriting workflows, scoring blocks & weights,
 * segment definitions (S1-S10), rules & hard stops, glossary, and AI/ML capabilities.
 */

import { DEFAULT_SEGMENTS } from '../data/seedData';
import { getStoredScoringConfig } from './config';

export interface KnowledgeSection {
  id: string;
  category: 'screens' | 'workflow' | 'scoring' | 'segments' | 'rules' | 'glossary' | 'ai_features';
  title: string;
  keywords: string[];
  content: string;
}

export function generatePortalKnowledge(): KnowledgeSection[] {
  // Read scoring config
  getStoredScoringConfig();

  const sections: KnowledgeSection[] = [
    // 1. SCREENS
    {
      id: 'screen_applicant_portal',
      category: 'screens',
      title: 'Applicant Portal Screen',
      keywords: ['applicant', 'customer', 'status', 'queue', 'mobile', 'login', 'code', '123456', 'cancel'],
      content: 'The Applicant Page allows customers to enter their Unitel mobile number and demo access code 123456. Once verified, the customer can view their live application status, queue position, credit limit, score band, and interact with the loan assistant chatbot to check requirements, query their limit, or request application cancellation.',
    },
    {
      id: 'screen_approver_portal',
      category: 'screens',
      title: 'Approver Portal & Queue Screen',
      keywords: ['approver', 'queue', 'approval', 'review', 'reject', 'summary', 'knn', 'similar', 'red flags'],
      content: 'The Approver screen displays pending loan applications in the underwriting queue. It features an Approver Summary (AI or template generated) at the top, a KNN Similar Past Customers card showing repayment probabilities, full customer profile details, credit limit breakdown, and Approve/Reject action buttons with required underwriting notes.',
    },
    {
      id: 'screen_admin_segments',
      category: 'screens',
      title: 'Admin Segments Screen',
      keywords: ['admin', 'segments', 'validation', 'k-means', 'cluster', 'confusion', 'agreement', 'rules'],
      content: 'The Admin > Segments screen provides an architectural view of the 10 customer segments, 6 parameter blocks, and decision tree. It includes a read-only ML Validation Card displaying K-Means agreement percentage with legacy rules, cluster sizes, and confusion matrix. There is no manual ML/rules toggle switch. If ML service is offline, a temporary fallback note is shown.',
    },
    {
      id: 'screen_evaluations',
      category: 'screens',
      title: 'Credit Score Evaluation Menu',
      keywords: ['evaluation', 'calculator', 'simulate', 'score', 'new application', 'test'],
      content: 'The Credit Score Evaluation screen allows credit analysts to simulate or compute subscriber credit scores using telecom, profile, wallet, banking, and utility parameters. It produces a 300 to 900 score, confidence score, and recommended credit limit.',
    },
    {
      id: 'screen_audit_log',
      category: 'screens',
      title: 'Immutable Audit Log Screen',
      keywords: ['audit', 'log', 'traceability', 'history', 'timestamp', 'actor', 'compliance'],
      content: 'The Audit Log screen logs every portal action, analyst submission, approver decision, parameter modification, and chatbot query with timestamp, actor role, application ID, and payload snapshot for strict compliance and auditability.',
    },

    // 2. WORKFLOW (6-STAGE PIPELINE)
    {
      id: 'workflow_stage_1',
      category: 'workflow',
      title: 'Stage 1: Customer Identification & Eligibility Gates',
      keywords: ['identification', 'kyc', 'bi', 'national id', 'sim age', 'hard stop', 'under 18', 'mismatch'],
      content: 'Stage 1 collects Subscriber Full Name, MSISDN (+244 9xx), Bilhete de Identidade (BI), Date of Birth, and SIM activation date. Enforces Hard Stop 1 (ID & SIM registration match check) and Hard Stop 2 (Age 18+). Never collects health, gender, religion, ethnicity, or private GPS.',
    },
    {
      id: 'workflow_stage_2',
      category: 'workflow',
      title: 'Stage 2: Customer Segmentation',
      keywords: ['segmentation', 'find segment', 'priority chain', 'questions', 's1', 's10', 'k-means'],
      content: 'Stage 2 determines customer segment via K-Means clustering (k=10) on scaled features, mapped to segments S1 through S10. In rule-based fallback, it uses the 9-question priority chain where the first "Yes" fixes the segment, defaulting to S1.',
    },
    {
      id: 'workflow_stage_3',
      category: 'workflow',
      title: 'Stage 3: Parameter Collection & Nil Scoring',
      keywords: ['parameters', 'nil scoring', 'missing data', 'blocks', 'telecom', 'wallet', 'banking'],
      content: 'Collects only parameters relevant to the customer segment. Nil scoring principle: missing data or unrecorded blocks score 0 (Nil) rather than redistributing points, ensuring missing data appropriately lowers the overall score.',
    },
    {
      id: 'workflow_stage_4',
      category: 'workflow',
      title: 'Stage 4: Score & Confidence Calculation',
      keywords: ['score', 'formula', 'confidence', '300', '900', 'points', 'asset bonus', 'social bonus'],
      content: 'Calculates credit score from 300 to 900 using formula: round(300 + (totalPoints / 100) * 600). Total points include base block points (up to 94) plus physical asset bonuses (+1 to +6: house +2, land title +1, motorbike +1, car +2) and social bonus (0 to +3). Data confidence is rated High (>=3 blocks, >=12m tenure), Medium (2 blocks or 6-12m), or Low (1 block or <6m).',
    },
    {
      id: 'workflow_stage_5',
      category: 'workflow',
      title: 'Stage 5: Credit Limit Engine',
      keywords: ['credit limit', 'starter', 'standard', 'higher', 'highest', 'income cap', 'emi burden', '30%'],
      content: 'Approved credit limit is the lowest of: 1) Score Band baseline (Starter 50k Kz, Standard 150k Kz, Higher 400k Kz, Highest 1,000,000 Kz), 2) Stated or estimated Income Band cap, and 3) 30% monthly EMI debt-to-income burden. Low confidence or SIM tenure < 6 months caps limit at Starter.',
    },
    {
      id: 'workflow_stage_6',
      category: 'workflow',
      title: 'Stage 6: Loan Journey & Underwriting Decision',
      keywords: ['loan journey', 'equipment', 'emi', 'approval queue', 'approver', 'reject', 'email'],
      content: 'Customer selects equipment within credit limit (feature phones, 4G smartphones, solar kits) and chooses a 3 to 12 month EMI tenure. Application enters queue where Underwriters approve or reject with mandatory written justifications.',
    },

    // 3. SCORING PARAMETERS & BLOCKS
    {
      id: 'scoring_blocks_weights',
      category: 'scoring',
      title: 'Scoring Blocks & Points Weights',
      keywords: ['weights', 'block points', 'telecom', 'profile', 'wallet', 'banking', 'utility', 'bonus'],
      content: 'Base points sum to 94 across 5 blocks: Telecom (P) ~32 pts, Profile Stability (T) ~14 pts, Unitel Money Wallet (W) ~20 pts, Commercial Banking (B) ~20 pts, and Utility / In-store records (X) ~8 pts. Physical assets add up to +6 bonus points, reaching maximum 100 total points.',
    },
    {
      id: 'scoring_red_flags',
      category: 'scoring',
      title: 'Red Flags & Overlay Rules',
      keywords: ['red flags', 'sim swap', 'fraud', 'hold review', 'starter cap', 'address warning', 'disparity'],
      content: 'Red flag overlay rules trigger automatic protective constraints: SIM Swap in last 30 days triggers fraud hold; Geographic Disparity (BI province differs from cell tower location) triggers address warning and secondary address request; Low SIM tenure (<6m) caps credit limit at Starter tier.',
    },

    // 4. SEGMENTS (S1 TO S10)
    ...DEFAULT_SEGMENTS.map((s) => ({
      id: `segment_${s.code.toLowerCase()}`,
      category: 'segments' as const,
      title: `Segment ${s.code}: ${s.name}`,
      keywords: [s.code.toLowerCase(), s.name.toLowerCase(), 'segment', 'profile', s.limit_rule.toLowerCase()],
      content: `Segment ${s.code} (${s.name}): ${s.story} How money moves: ${s.how_money_moves}. Data visible: ${s.data_visible}. Credit limit rule: ${s.limit_rule}. Share note: ${s.share_note || ''}`,
    })),

    // 5. GLOSSARY
    {
      id: 'glossary_bi',
      category: 'glossary',
      title: 'Glossary: Bilhete de Identidade (BI)',
      keywords: ['bi', 'bilhete', 'identidade', 'national id', 'kyc'],
      content: 'Bilhete de Identidade (BI): Angolan National Identity Document with biometric registration. Used for KYC identity verification and cross-referencing SIM registration.',
    },
    {
      id: 'glossary_msisdn',
      category: 'glossary',
      title: 'Glossary: MSISDN',
      keywords: ['msisdn', 'mobile number', 'phone number', '+244'],
      content: 'MSISDN: Mobile Station International Subscriber Directory Number (+244 9xx xxx xxx). Identifies the Unitel telecom subscriber account.',
    },
    {
      id: 'glossary_emi',
      category: 'glossary',
      title: 'Glossary: EMI (Equated Monthly Installment)',
      keywords: ['emi', 'installment', 'monthly payment', 'tenure'],
      content: 'EMI (Equated Monthly Installment): Fixed monthly repayment amount covering principal and financing charges over 3, 6, 9, or 12 months. Enforces a strict 30% affordability cap.',
    },
    {
      id: 'glossary_kwik_mcx',
      category: 'glossary',
      title: 'Glossary: KWiK & Multicaixa Express (MCX)',
      keywords: ['kwik', 'mcx', 'multicaixa express', 'interbank', 'emis'],
      content: 'KWiK (Kwanza Instantaneo) and Multicaixa Express (MCX): Angolan national instant interbank payment infrastructure operated by EMIS, enabling real-time account-to-wallet and P2P transfers.',
    },

    // 6. AI & ML FEATURES
    {
      id: 'ai_kmeans',
      category: 'ai_features',
      title: 'AI Feature: K-Means ML Customer Segmentation',
      keywords: ['k-means', 'ml', 'clustering', 'k=10', 'segments', 'machine learning'],
      content: 'Segments customers into 10 clusters using K-Means on scaled features: SIM age, top-up regularity, average monthly spend, spend stability, airtime loans repaid ratio, and wallet level. Clusters are mapped to S1..S10 by majority overlap with historical rule-based labels.',
    },
    {
      id: 'ai_knn',
      category: 'ai_features',
      title: 'AI Feature: KNN Similar Past Customers',
      keywords: ['knn', 'similar customers', 'nearest neighbors', 'repayment chance', 'synthetic history'],
      content: 'A K-Nearest Neighbors (k=5) model searches the synthetic database of 500 customers to find the 5 closest profile matches based on scaled features. Reports outcomes (repaid on time vs paid late) and estimated repayment chance (e.g. 80%) to assist approver decisions.',
    },
    {
      id: 'ai_approver_summary',
      category: 'ai_features',
      title: 'AI Feature: Approver Summary Generator',
      keywords: ['approver summary', 'ai summary', 'template summary', 'llm', 'underwriting brief'],
      content: 'Generates an executive underwriting brief summarizing applicant age, marital status, occupation, city, assets, score and band, data confidence, credit limit, equipment EMI, ML segment, KNN repayment chance, and detected red flags. Labeled "AI-generated" or "Template summary - approver decides".',
    },
  ];

  return sections;
}

export const PORTAL_KNOWLEDGE = generatePortalKnowledge();

/**
 * Retrieve relevant knowledge sections based on query keyword matching
 */
export function retrieveKnowledge(query: string, maxResults: number = 3): KnowledgeSection[] {
  const qTokens = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
  if (qTokens.length === 0) return PORTAL_KNOWLEDGE.slice(0, maxResults);

  const scored = PORTAL_KNOWLEDGE.map((sec) => {
    let score = 0;
    const titleLower = sec.title.toLowerCase();
    const contentLower = sec.content.toLowerCase();

    for (const token of qTokens) {
      if (sec.keywords.some((kw) => kw.includes(token))) score += 5;
      if (titleLower.includes(token)) score += 4;
      if (contentLower.includes(token)) score += 1;
    }

    return { sec, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > 0).slice(0, maxResults).map((s) => s.sec);
}
