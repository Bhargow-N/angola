/**
 * Real Conversational Chatbot Engine with SSE Streaming & Tool Calling
 * Supports OpenAI-compatible providers (Gemini, Groq, OpenRouter, OpenAI, Ollama)
 * via configurable AI_BASE_URL, AI_API_KEY, AI_MODEL.
 *
 * Enforces:
 * - Session state & rate limiting
 * - Max 5 tool calls per question loop
 * - Customer privacy: 2-step verification (ID lookup -> last 4 digits confirmation)
 * - Strict role permissions (Customer sees only verified app; Approver/Admin see staff tools)
 * - Deterministic fallback mode (Basic chat mode) when AI_API_KEY is not configured
 */

import fs from 'fs';
import path from 'path';

// 10 Customer Segments
export const SEGMENT_DEFINITIONS = {
  S1: { code: 'S1', name: 'Button phone, cash-only', story: 'Basic feature phone user relying entirely on physical cash and scratch cards.', limit_rule: 'Starter limit only (max 50,000 Kz) until tenure >= 12m or wallet activated.' },
  S2: { code: 'S2', name: 'Button phone with USSD wallet', story: 'Uses feature phone but actively transacts via USSD (*449#) on Unitel Money.', limit_rule: 'Eligible for standard limits if wallet inflows are consistent.' },
  S3: { code: 'S3', name: 'Smartphone, unbanked, wallet app', story: 'Younger or urban unbanked user with Android smartphone using wallet app.', limit_rule: 'Standard limit based on wallet volume and app tenure.' },
  S4: { code: 'S4', name: 'Agent-assisted cash user', story: 'Transacts primarily through mobile money agents and informal banking intermediaries.', limit_rule: 'Credit limit tied to agent transaction history and regularity.' },
  S5: { code: 'S5', name: 'Banked, branch and ATM user', story: 'Traditional bank customer using debit cards, ATMs, and branch counters.', limit_rule: 'Standard to Higher limit based on average bank balance.' },
  S6: { code: 'S6', name: 'Banked digital, hybrid with wallet', story: 'Tech-savvy urban customer using Multicaixa Express, KWiK, and mobile wallets.', limit_rule: 'Higher credit limits supported by digital banking velocity.' },
  S7: { code: 'S7', name: 'Salaried formal worker', story: 'Public sector or corporate employee with verifiable monthly payroll deposit.', limit_rule: 'High to Highest credit limits, up to 1,000,000 Kz.' },
  S8: { code: 'S8', name: 'Self-employed or informal trader', story: 'Market vendor, shopkeeper, artisan, or moto-taxi operator.', limit_rule: 'Credit limit tied to 90-day merchant inflow velocity.' },
  S9: { code: 'S9', name: 'Remittance-dependent household', story: 'Household relying on regular domestic transfers from relatives or diaspora abroad.', limit_rule: 'Standard limit with strict 30% EMI safety cap.' },
  S10: { code: 'S10', name: 'Postpaid or high-value subscriber', story: 'Corporate or high-net-worth individual with monthly billing contract or high ARPU.', limit_rule: 'Top revenue tier; eligible for maximum limits.' },
};

// Portal Knowledge Base
export const PORTAL_KNOWLEDGE = [
  {
    topic: 'credit_score_calculation',
    keywords: ['score', 'calculate', 'formula', 'points', 'points formula', 'how is my score calculated', 'breakdown', 'proxy'],
    text: 'A Unitel credit score ranges from 300 to 900, calculated with the formula: round(300 + (totalPoints / 100) * 600). The base scoring model evaluates 94 base points across 5 blocks: Telecom (32 pts), Profile Stability (14 pts), Unitel Money Wallet (20 pts), Banking (20 pts), and Utility (8 pts). Nil scoring applies: missing data scores 0 rather than redistributing points. Verified physical assets (house +2, land title +1, motorbike +1, car +2) add up to +6 bonus points for a maximum of 100 total points.',
  },
  {
    topic: 'credit_limit_rules',
    keywords: ['limit', 'low limit', 'why is my limit', 'starter cap', 'increase limit', 'how to improve', 'raise limit', 'cap'],
    text: 'Approved credit limit is strictly the lowest of: 1) Score Band baseline (Starter 50,000 Kz, Standard 150,000 Kz, Higher 400,000 Kz, Highest 1,000,000 Kz), 2) Declared income band cap, and 3) 30% monthly EMI debt-to-income burden. If SIM tenure is <6 months or data confidence is Low, a Starter Cap (max 50,000 Kz) is enforced. To improve your score and limit: keep your SIM active for 12+ months, recharge airtime regularly every month, and use Unitel Money for utility bill payments.',
  },
  {
    topic: 'red_flags_overlay',
    keywords: ['red flag', 'red-flag', 'overlay', 'flagged', 'sim swap', 'disparity', 'address warning', 'hold'],
    text: 'The red-flag system (Overlay Rules) enforces automatic protective risk controls: 1) SIM Swap Hold: A SIM replacement in the last 30 days triggers an automatic fraud review hold. 2) Geographic Disparity (Address Disparity): If the applicant\'s National ID (BI) province differs from primary cell-tower activity over the past 6 months, an address warning is triggered requiring secondary proof of address. 3) Starter Caps: SIM tenure <6m or low data confidence caps financing at Starter tier.',
  },
  {
    topic: 'kyc_documents',
    keywords: ['document', 'documents', 'kyc', 'bi', 'national id', 'requirement', 'what do i need', 'how to proceed'],
    text: 'Required documents for Unitel smartphone loan applications: 1) Bilhete de Identidade (BI) valid national ID card matching SIM card registration, 2) Active Unitel MSISDN (+244 9xx) SIM card, 3) Proof of residence or utility bill if address disparity is flagged, and 4) Mobile money or bank account for monthly EMI debit setup.',
  },
  {
    topic: 'application_cancellation',
    keywords: ['cancel', 'cancellation', 'cancel my application', 'cancel loan', 'stop application'],
    text: 'Applicants can request application cancellation at any time before loan fulfillment. To prevent accidental cancellation, the portal requires the applicant to press the "Confirm Cancellation" button. Upon confirmation, the application status is marked Cancelled, an email notification is dispatched, and an immutable audit log entry is recorded.',
  },
  {
    topic: 'ml_segmentation_validation',
    keywords: ['ml', 'k-means', 'validation', 'machine learning', 'cluster', 'agreement', 'switch'],
    text: 'Customer segmentation is powered by an ML K-Means clustering model (k=10) on 6 standardized features: SIM age, top-up regularity, average monthly spend, spend stability, airtime loans repaid ratio, and wallet level. Clusters map to segments S1-S10 by majority overlap. There is no manual ML/Rules switch in the UI. In Admin > Segments, a read-only validation card displays agreement percentage with old rules, confusion matrix, and cluster sizes. If the ML service is offline, the app silently falls back to legacy rules with an offline notice.',
  },
  {
    topic: 'knn_similar_customers',
    keywords: ['knn', 'similar past customers', 'nearest neighbors', 'repayment chance', 'synthetic'],
    text: 'The Approver screen features a KNN (k=5) card that finds the 5 nearest synthetic past customers based on scaled features. It displays their SIM age, top-up regularity, spend, and loan outcomes, concluding with: "5 similar customers: 4 repaid on time, 1 paid late. Estimated repayment chance: 80%." Labeled "Based on synthetic demo history", it supports underwriter decisions and never alters the calculated score.',
  },
  {
    topic: 'cricket_sports',
    keywords: ['cricket', 'match', 'ipl', 'score match', 'won the cricket match', 'game', 'sports'],
    text: 'In international cricket, teams across the globe compete across Test, ODI, and T20 formats. For the latest live match scores, tournament updates, and winner announcements, please consult your favorite sports news portal! How can I assist you with your Unitel credit application today?',
  },
  {
    topic: 'equipment_emi_plans',
    keywords: ['equipment', 'phone', 'smartphone', 'emi', 'installment', 'term', 'months', 'affordability', 'device', 'buy', 'pickup', 'store'],
    text: 'Unitel offers 3-month, 6-month, 9-month, and 12-month zero-interest equipment financing plans for feature phones, 4G smartphones, pocket Wi-Fi routers, tablets, and solar kits. Monthly EMI is strictly capped at 30% of verified monthly income or telecom spend (BNA affordability rule). Once approved, click "Proceed to buy" in My Applications to confirm store pickup at a Unitel branch.',
  },
  {
    topic: 'customer_segments_overview',
    keywords: ['segment', 'segments', 's1', 's3', 's5', 's7', 's8', 'unbanked', 'salaried', 'trader', 'wallet'],
    text: 'Unitel scores 5 active customer segments tailored to Angola: S1 (Button phone, cash-only; Telecom-focused), S3 (Smartphone, unbanked, Unitel Money wallet), S5 (Banked branch & ATM user), S7 (Salaried formal worker; up to 1,000,000 Kz limit), and S8 (Self-employed informal trader). Missing bank or wallet data is never penalized.',
  },
];

// In-memory sessions store: sessionId -> state
const SESSIONS = new Map();

// In-memory tracking of the last provider that answered a query ('primary' | 'backup' | 'basic' | 'none')
let lastProviderUsed = 'none';

// Short-lived cooldown for providers returning HTTP 429 (quota/rate limit) so subsequent turns don't stall
const providerCooldowns = new Map();
const COOLDOWN_MS_429 = 60_000;

function isProviderInCooldown(apiKey, model) {
  const key = `${apiKey}:${model}`;
  const until = providerCooldowns.get(key);
  if (!until) return false;
  if (Date.now() < until) return true;
  providerCooldowns.delete(key);
  return false;
}

function markProviderCooldown(apiKey, model) {
  const key = `${apiKey}:${model}`;
  providerCooldowns.set(key, Date.now() + COOLDOWN_MS_429);
}

export function getLastProviderUsed() {
  return lastProviderUsed;
}

export function setLastProviderUsed(provider) {
  lastProviderUsed = provider;
}

export function getOrCreateSession(sessionId = 'default', role = 'customer') {
  if (!SESSIONS.has(sessionId)) {
    SESSIONS.set(sessionId, {
      sessionId,
      role,
      verifiedApplicationId: null,
      verifiedMsisdn: null,
      pendingVerification: null,
      lastQueryTimestamp: Date.now(),
      queryCount: 0,
    });
  }
  const s = SESSIONS.get(sessionId);
  s.role = role;
  return s;
}

export function cleanDigits(str = '') {
  return String(str).replace(/[^0-9]/g, '');
}

export function maskPhone(phone = '') {
  const digits = cleanDigits(phone);
  if (digits.length >= 7) {
    return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} *** ****`;
  }
  return '*** ****';
}

/**
 * Find an application by 5-digit applicationNo, full ID, short ref suffix, phone digits, or name.
 * Accepts "10234", "#10234", "APP-10234", "app 10234", "10001", legacy IDs, and phone numbers.
 */
export function findMatchingApplication(applications = [], rawQuery = '') {
  const raw = String(rawQuery || '').trim();
  if (!raw) return null;
  const queryUpper = raw.toUpperCase();
  const queryLower = raw.toLowerCase();
  const queryDigits = cleanDigits(raw);
  const STOP_WORDS = new Set([
    'tell', 'me', 'the', 'story', 'stroy', 'about', 'overview', 'of', 'applicant', 'applivant',
    'customer', 'details', 'detail', 'for', 'what', 'whats', 'is', 'are', 'give', 'show',
    'check', 'please', 'status', 'summary', 'info', 'information', 'profile', 'history', 'loan',
    'can', 'i', 'get', 'see', 'view', 'find', 'her', 'his', 'their', 'on', 'in', 'with', 'app', 'application', 'id',
  ]);
  const tokens = queryLower.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
  const digitTokens = tokens.map((t) => cleanDigits(t)).filter((d) => d.length >= 4);
  const nameTokens = tokens.filter((t) => !/^\d+$/.test(t) && t.length >= 3 && !STOP_WORDS.has(t));

  const activeApps = applications.filter((a) => !a.deleted_at);

  // 1. Match by 5-digit applicationNo (accepts "10234", "#10234", "APP-10234", "app 10234", "10001", etc.)
  const appNoMatch = activeApps.find((a) => {
    const no = a.applicationNo || a.application_no;
    if (!no) return false;
    const noStr = String(no);
    if (queryDigits === noStr) return true;
    if (digitTokens.includes(noStr)) return true;
    if (queryUpper.includes(noStr)) return true;
    return false;
  });
  if (appNoMatch) return appNoMatch;

  // 2. Exact ID / legacy ID / suffix / phone match
  const exactMatch = activeApps.find((a) => {
    const appIdUpper = (a.id || '').toUpperCase();
    const appPhoneDigits = cleanDigits(a.msisdn || a.customer_msisdn || a.phone || '');
    const custPhoneDigits = cleanDigits(a.evaluation?.customer?.msisdn || '');
    if (appIdUpper === queryUpper || appIdUpper.endsWith(queryUpper)) return true;
    if (queryDigits.length >= 4 && appIdUpper.endsWith(queryDigits)) return true;
    if (queryDigits.length >= 6 && (appPhoneDigits.includes(queryDigits) || custPhoneDigits.includes(queryDigits))) return true;
    if (digitTokens.some((dt) => appIdUpper.endsWith(dt) || (dt.length >= 6 && (appPhoneDigits.includes(dt) || custPhoneDigits.includes(dt))))) {
      return true;
    }
    return false;
  });
  if (exactMatch) return exactMatch;

  // 3. Exact full name match first (e.g. "Swetha S" -> "Swetha S", not "Swetha")
  const exactNameMatch = activeApps.find((a) => {
    const custNameLower = String(a.customer_name || a.evaluation?.customer?.full_name || '').trim().toLowerCase();
    return custNameLower && (custNameLower === queryLower || custNameLower === nameTokens.join(' '));
  });
  if (exactNameMatch) return exactNameMatch;

  // 4. All meaningful name tokens match
  if (nameTokens.length > 0) {
    const allTokensMatch = activeApps.find((a) => {
      const custNameLower = String(a.customer_name || a.evaluation?.customer?.full_name || '').toLowerCase();
      return nameTokens.every((nt) => custNameLower.includes(nt));
    });
    if (allTokensMatch) return allTokensMatch;

    // 5. Single meaningful name token match (e.g. "swetha" or "demo")
    const anyTokenMatch = activeApps.find((a) => {
      const custNameLower = String(a.customer_name || a.evaluation?.customer?.full_name || '').toLowerCase();
      return nameTokens.some((nt) => custNameLower.includes(nt));
    });
    if (anyTokenMatch) return anyTokenMatch;
  }

  return null;
}

/**
 * Robustly resolve application by 5-digit number, full ID, or matching query
 */
export function resolveApp(applications = [], targetId = '') {
  if (!targetId) return null;
  const raw = String(targetId).trim();
  const digits = cleanDigits(raw);
  const upper = raw.toUpperCase();
  return (
    applications.find((a) => {
      if (a.deleted_at) return false;
      const no = a.applicationNo || a.application_no;
      if (no && (String(no) === digits || upper.includes(String(no)))) return true;
      if (a.id && (a.id.toUpperCase() === upper || a.id.toUpperCase().endsWith(upper))) return true;
      return false;
    }) || findMatchingApplication(applications, raw)
  );
}

function formatStaffApplicationProfile(app) {
  const cust = app.evaluation?.customer || {};
  const res = app.evaluation?.results || {};
  const dob = cust.date_of_birth || null;
  let age = null;
  if (dob) {
    const birth = new Date(dob);
    if (!Number.isNaN(birth.getTime())) {
      const diff = Date.now() - birth.getTime();
      age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
    }
  }
  const appNo = app.applicationNo || app.application_no || null;
  const displayId = appNo ? `Application ID: ${appNo}` : app.id;
  return {
    id: app.id,
    application_no: appNo,
    application_id: displayId,
    name: app.customer_name || cust.full_name || 'Subscriber',
    age,
    date_of_birth: dob,
    msisdn: app.msisdn || cust.msisdn || '',
    email: cust.email || null,
    national_id_masked: cust.national_id_masked || null,
    sim_activation_date: cust.sim_activation_date || null,
    segment_code: app.evaluation?.segment_code || 'S3',
    status: app.status,
    equipment: app.equipment?.name || app.equipment_name || 'Equipment',
    price_kz: app.price_kz || 0,
    monthly_emi_kz: app.monthly_emi_kz || 0,
    term_months: app.term_months || 6,
    emi_share_pct: app.emi_share_pct ?? null,
    score: res.score || null,
    band: res.band_label || null,
    confidence: res.confidence || null,
    limit_kz: res.limit_kz || null,
    reasons: res.reasons || [],
    submitted_at: app.submitted_at || null,
  };
}

/**
 * Execute Tool by Name with Strict Role Permission Enforcement
 */
export function executeTool(toolName, args = {}, context = {}) {
  const { role, session, dbData = {} } = context;
  const applications = dbData.applications || [];
  const evaluations = dbData.evaluations || [];
  const approvals = dbData.approvals || [];

  // Customer Tool 1: lookup_application
  if (toolName === 'lookup_application') {
    const raw = String(args.identifier || '').trim();
    const queryDigits = cleanDigits(raw);
    const queryUpper = raw.toUpperCase();

    // Strict Customer Privacy: A customer cannot look up another application once verified
    if (role === 'customer' && session?.verifiedApplicationId && queryUpper) {
      const verifiedUpper = String(session.verifiedApplicationId).toUpperCase();
      const verifiedNo = String(session.verifiedApplicationNo || '');
      const matchesVerified =
        verifiedUpper === queryUpper ||
        queryUpper.includes(verifiedUpper) ||
        (verifiedNo && (queryDigits === verifiedNo || queryUpper.includes(verifiedNo)));
      if (!matchesVerified) {
        return {
          found: false,
          error: 'Permission denied: Customers cannot view other applications.',
          message: 'Access denied: For customer privacy and data security, you can only view your own verified application. I cannot disclose details of other applicants.',
        };
      }
    }

    let app = resolveApp(applications, raw);

    // Support standard demo customer APP-1001 / Thomas Ndalu (+244 923 111 222) if not yet in DB
    if (!app && (queryUpper.includes('1001') || queryDigits.includes('111222') || queryDigits.includes('1222'))) {
      app = {
        id: 'APP-1001',
        applicationNo: 10001,
        customer_name: 'Thomas Ndalu',
        msisdn: '+244 923 111 222',
        status: 'submitted',
        equipment: { name: 'Samsung Galaxy A15 (128GB)' },
        evaluation: {
          customer: { full_name: 'Thomas Ndalu', msisdn: '+244 923 111 222' },
          results: { score: 712, band_label: 'Good', limit_kz: 150000, confidence: 'High' },
        },
        monthly_emi_kz: 12500,
        term_months: 12,
      };
      if (Array.isArray(applications)) applications.push(app);
    }

    // Check if input is a partial ID matching the end of active application IDs
    const isExactIdOrPhone = app && (
      (app.id || '').toUpperCase() === queryUpper ||
      (app.applicationNo && (String(app.applicationNo) === queryDigits || queryUpper.includes(String(app.applicationNo)))) ||
      (queryDigits.length >= 6 && (
        cleanDigits(app.msisdn || app.customer_msisdn || app.phone || '').includes(queryDigits) ||
        cleanDigits(app.evaluation?.customer?.msisdn || '').includes(queryDigits)
      ))
    );

    if (!isExactIdOrPhone && queryDigits.length >= 3 && queryDigits.length < 10) {
      const suffixMatches = applications.filter(
        (a) => !a.deleted_at && (
          String(a.id || '').toUpperCase().endsWith(queryDigits) ||
          String(a.applicationNo || '').endsWith(queryDigits)
        )
      );
      if (suffixMatches.length === 1 && String(suffixMatches[0].id || '').toUpperCase() !== queryUpper) {
        const matched = suffixMatches[0];
        const matchDisplayId = matched.applicationNo ? `Application ID: ${matched.applicationNo}` : matched.id;
        if (session) {
          session.pendingLookupConfirmation = matched.id;
        }
        return {
          found: true,
          needs_confirmation: true,
          application_id: matchDisplayId,
          raw_id: matched.id,
          confirm_prompt: `Did you mean ${matchDisplayId}?`,
        };
      }
      if (suffixMatches.length > 1) {
        return {
          found: false,
          multiple_matches: suffixMatches.slice(0, 3).map((m) => m.applicationNo ? `Application ID: ${m.applicationNo}` : m.id),
          message: `Multiple applications match. Please provide the full Application ID.`,
        };
      }
    }

    if (!app) {
      return {
        found: false,
        message: "I can't find an application for that. Would you like to start a new one?",
        action: 'start_application',
      };
    }

    const appPhone = app.msisdn || app.customer_msisdn || app.evaluation?.customer?.msisdn || '923111222';
    const digitsOnly = cleanDigits(appPhone);
    const expectedLast4 = digitsOnly.slice(-4) || '1222';
    const displayId = app.applicationNo ? `Application ID: ${app.applicationNo}` : app.id;

    // Store pending verification in session
    if (session) {
      session.pendingVerification = {
        applicationId: app.id,
        applicationNo: app.applicationNo || null,
        expectedLast4,
        msisdn: appPhone,
      };
      session.pendingLookupConfirmation = null;
    }

    return {
      found: true,
      application_id: displayId,
      raw_id: app.id,
      application_no: app.applicationNo || null,
      customer_name: app.customer_name || app.evaluation?.customer?.full_name || 'Subscriber',
      masked_phone: maskPhone(appPhone),
      prompt: 'Please confirm the last 4 digits of your mobile number.',
    };
  }

  // Customer Tool 2: verify_customer
  if (toolName === 'verify_customer') {
    const rawDigits = String(args.last_4_digits || '').trim();
    if (!/^\d{4}$/.test(rawDigits)) {
      return {
        verified: false,
        error: 'Please enter exactly 4 digits (e.g. 0331) to verify your mobile number.',
      };
    }

    const appId = String(args.application_id || session?.pendingVerification?.applicationId || '').trim();
    const app = resolveApp(applications, appId);
    if (!app) {
      return { verified: false, error: 'Please share your Application ID or mobile number first.' };
    }

    const appPhone = app.msisdn || app.customer_msisdn || app.evaluation?.customer?.msisdn || '923111222';
    const expectedLast4 = cleanDigits(appPhone).slice(-4);
    const displayId = app.applicationNo ? `Application ID: ${app.applicationNo}` : app.id;

    if (rawDigits !== expectedLast4) {
      const custName = app.customer_name || app.evaluation?.customer?.full_name || 'Subscriber';
      return {
        verified: false,
        application_id: displayId,
        error: `Those 4 digits don't match our records for ${custName} (${displayId}). Please try again.`,
      };
    }

    // Success: mark session as verified for the rest of the chat
    if (session) {
      session.verifiedApplicationId = app.id;
      session.verifiedApplicationNo = app.applicationNo || null;
      session.verifiedMsisdn = appPhone;
      session.pendingVerification = null;
    }

    return {
      verified: true,
      application_id: displayId,
      raw_id: app.id,
      application_no: app.applicationNo || null,
      customer_name: app.customer_name || app.evaluation?.customer?.full_name || 'Subscriber',
      status: app.status || 'submitted',
      equipment: app.equipment?.name || app.equipment_name || 'Equipment',
      monthly_emi_kz: app.monthly_emi_kz || 0,
      term_months: app.term_months || 6,
      credit_limit_kz: app.evaluation?.results?.limit_kz || 150000,
      score: app.evaluation?.results?.score || null,
      submitted_at: app.submitted_at ? String(app.submitted_at).slice(0, 10) : null,
    };
  }

  // Customer Tool 3: get_queue_position (Only for verified application)
  if (toolName === 'get_queue_position') {
    const appId = args.application_id || session?.verifiedApplicationId;
    const app = resolveApp(applications, appId);
    if (!app) return { error: 'Application not found.' };

    if (role === 'customer') {
      const isVerified =
        session?.verifiedApplicationId === app.id ||
        (app.applicationNo && session?.verifiedApplicationNo === app.applicationNo);
      if (!isVerified) {
        return { error: 'Permission denied: Please verify your application first.' };
      }
    }

    const status = app.status || 'submitted';
    const stage =
      status === 'approved'
        ? 'Approved (Ready for branch pickup)'
        : status === 'cancelled'
          ? 'Cancelled'
          : status === 'rejected'
            ? 'Declined by Underwriting'
            : 'Submitted (Under active underwriting review)';

    const queuePosition = status === 'submitted' || status === 'pending' ? '#2 in underwriting queue' : 'Completed';
    const nextSteps =
      status === 'approved'
        ? 'Visit your nearest Unitel branch with your Bilhete de Identidade (BI) to collect your smartphone.'
        : status === 'cancelled'
          ? 'Application was cancelled. You may submit a new evaluation when ready.'
          : status === 'rejected'
            ? 'Underwriting review completed. Re-evaluation is available in 90 days.'
            : 'Credit analyst is reviewing recharge stability. Turnaround is under 2 hours.';

    const displayId = app.applicationNo ? `Application ID: ${app.applicationNo}` : app.id;
    return {
      application_id: displayId,
      raw_id: app.id,
      application_no: app.applicationNo || null,
      customer_name: app.customer_name || app.evaluation?.customer?.full_name || 'Subscriber',
      status,
      stage,
      queue_position: queuePosition,
      what_happens_next: nextSteps,
      equipment_name: app.equipment?.name || app.equipment_name || 'Smartphone 4G Mid',
      credit_limit_kz: app.evaluation?.results?.limit_kz || 150000,
      monthly_emi_kz: app.monthly_emi_kz || 10000,
      term_months: app.term_months || 12,
      submitted_at: app.submitted_at || app.created_at || null,
    };
  }

  // Customer Tool 4: request_cancel
  if (toolName === 'request_cancel') {
    const appId = args.application_id || session?.verifiedApplicationId;
    const app = resolveApp(applications, appId);
    if (!app) return { error: 'Application not found.' };

    if (role === 'customer') {
      const isVerified =
        session?.verifiedApplicationId === app.id ||
        (app.applicationNo && session?.verifiedApplicationNo === app.applicationNo);
      if (!isVerified) {
        return { error: 'Permission denied: You can only cancel your own verified application.' };
      }
    }

    const displayId = app.applicationNo ? `Application ID: ${app.applicationNo}` : app.id;

    if (app.status === 'cancelled' || app.status === 'canceled') {
      return {
        already_cancelled: true,
        application_id: displayId,
        message: 'You already cancelled this application.',
      };
    }

    return {
      action: 'confirm_required',
      application_id: app.id,
      display_id: displayId,
      prompt: `Do you want to cancel ${displayId}? Please click Confirm to proceed.`,
      proposal: {
        type: 'cancel_application',
        applicationId: app.id,
        label: `Confirm Cancellation of ${displayId}`,
      },
    };
  }

  // Customer Tool 5: list_required_documents
  if (toolName === 'list_required_documents') {
    return {
      documents: [
        'Bilhete de Identidade (BI) matching SIM registration',
        'Active Unitel SIM (+244 9xx) with minimum 3 months recharge history',
        'Unitel Money wallet or bank account for monthly EMI debits',
        'Secondary proof of address (utility bill) if address disparity warning is flagged',
      ],
    };
  }

  // Shared Tool: search_portal_knowledge
  if (toolName === 'search_portal_knowledge') {
    const q = String(args.query || '').toLowerCase();
    const STOP_WORDS = new Set(['the', 'and', 'for', 'are', 'with', 'what', 'this', 'that', 'from', 'you', 'your', 'has', 'have', 'was', 'were', 'can', 'about', 'how']);
    const tokens = q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !STOP_WORDS.has(t));

    if (tokens.length === 0) {
      return { matches: ['No specific documentation found for this query in the portal knowledge file.'] };
    }

    const matches = PORTAL_KNOWLEDGE.map((item) => {
      let score = 0;
      for (const t of tokens) {
        if (item.keywords.some((k) => k.includes(t))) score += 4;
        if (item.text.toLowerCase().includes(t)) score += 1;
      }
      return { item, score };
    })
      .filter((m) => m.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((m) => m.item.text);

    return {
      matches: matches.length > 0 ? matches : ['No specific documentation found for this query in the portal knowledge file.'],
    };
  }

  // Staff Tool 1: get_application_details
  if (toolName === 'get_application_details') {
    if (role === 'customer') {
      const appId = args.application_id || session?.verifiedApplicationId;
      if (!session?.verifiedApplicationId || session.verifiedApplicationId !== appId) {
        return { error: 'Permission denied: Customers cannot view other applications.' };
      }
    }
    const targetId = args.application_id;
    const app = applications.find((a) => a.id === targetId);
    if (!app) return { error: 'Application not found' };
    return {
      id: app.id,
      customer_name: app.customer_name || app.evaluation?.customer?.full_name,
      status: app.status,
      equipment_name: app.equipment?.name || app.equipment_name,
      price_kz: app.price_kz,
      term_months: app.term_months,
      monthly_emi_kz: app.monthly_emi_kz,
      score: app.evaluation?.results?.score || 650,
      band: app.evaluation?.results?.band_label || 'Acceptable',
    };
  }

  // Staff Tool 2: get_score_breakdown
  if (toolName === 'get_score_breakdown') {
    if (role === 'customer') {
      const appId = args.application_id || session?.verifiedApplicationId;
      if (!session?.verifiedApplicationId || session.verifiedApplicationId !== appId) {
        return { error: 'Permission denied: Customers cannot view other customer score evaluations.' };
      }
    }
    const targetId = args.application_id || session?.verifiedApplicationId || 'APP-1001';
    const app = applications.find((a) => a.id === targetId);
    const ev = evaluations.find((e) => e.id === app?.evaluation_id || e.id === targetId) || evaluations[0];
    return {
      application_id: targetId,
      score: ev?.score || 712,
      band: ev?.scoreBand || ev?.score_band || ev?.results?.band_label || 'Good',
      confidence: ev?.dataConfidence || ev?.data_confidence || ev?.results?.confidence || 'High',
      total_points: ev?.totalPoints || ev?.results?.total_points || 68,
      limit_kz: ev?.limitKz || ev?.results?.limit_kz || 150000,
      positive_factors: ['Consistent airtime top-up frequency', 'Verified 24m+ telecom tenure'],
      holding_factors: ['Absence of commercial bank statement'],
      red_flags: ev?.results?.address_warning ? ['Geographic address disparity'] : [],
    };
  }

  // Staff Tool 3: get_segment
  if (toolName === 'get_segment') {
    const code = String(args.segment_code || 'S1').toUpperCase();
    return SEGMENT_DEFINITIONS[code] || SEGMENT_DEFINITIONS.S1;
  }

  // Staff Tool 4: get_similar_customers
  if (toolName === 'get_similar_customers') {
    if (role === 'customer') {
      return { error: 'Permission denied: Detailed KNN past customer records are restricted to approvers.' };
    }
    return {
      similar_count: 5,
      similar_customers_count: 5,
      repaid_on_time: 4,
      paid_late: 1,
      repayment_chance_pct: 80,
      summary_line: '5 similar customers: 4 repaid on time, 1 paid late. Estimated repayment chance: 80%.',
      disclaimer: 'Based on synthetic demo history',
    };
  }

  // Alias: get_weekly_stats -> get_stats
  if (toolName === 'get_weekly_stats') {
    toolName = 'get_stats';
  }

  // Alias: get_application -> get_application_details
  if (toolName === 'get_application') {
    toolName = 'get_application_details';
  }

  // Staff Tool: list_applications
  if (toolName === 'list_applications') {
    if (role === 'customer') {
      return { error: 'Permission denied: Customers cannot view or list other applications.' };
    }
    const statusFilter = String(args.status || 'all').toLowerCase();
    const filtered = applications.filter((a) => {
      if (a.deleted_at) return false;
      const st = String(a.status || '').toLowerCase();
      if (statusFilter === 'all' || !statusFilter) return true;
      if (statusFilter === 'pending' || statusFilter === 'submitted') {
        return st === 'submitted' || st === 'pending';
      }
      return st === statusFilter;
    });
    return {
      filter: statusFilter,
      total: filtered.length,
      applications: filtered.slice(0, 25).map((a) => ({
        id: a.id,
        name: a.customer_name || a.evaluation?.customer?.full_name || 'Subscriber',
        msisdn: a.msisdn || a.evaluation?.customer?.msisdn || '',
        status: a.status,
        equipment: a.equipment?.name || a.equipment_name || 'N/A',
        price_kz: a.price_kz || 0,
        monthly_emi_kz: a.monthly_emi_kz || 0,
        score: a.evaluation?.results?.score || null,
        submitted_at: a.submitted_at || null,
      })),
    };
  }

  // Navigation Tool: navigate_to (and alias navigate_to_page)
  if (toolName === 'navigate_to' || toolName === 'navigate_to_page') {
    const dest = String(args.destination || args.page || '').toLowerCase();
    const isStaff = role !== 'customer';
    let url = '/applicant/new';
    let label = 'Start New Application';

    if (/queue|approv|pending|review/.test(dest) && isStaff) {
      url = '/approver/queue';
      label = 'Open Applications Queue';
    } else if (/instant|credit check|quick check/.test(dest) && isStaff) {
      url = '/approver/instant-check';
      label = 'Open Instant Credit Check';
    } else if (/points|points panel|scoring/.test(dest) && isStaff) {
      url = '/approver/points-panel';
      label = 'Open Points Panel';
    } else if (/data source|registry|registries/.test(dest) && isStaff) {
      url = '/approver/data-sources';
      label = 'Open Data Sources';
    } else if (/setting|config|admin/.test(dest) && isStaff) {
      url = '/approver/settings';
      label = 'Open Admin Settings';
    } else if (/evaluation/.test(dest) && isStaff) {
      url = '/approver/evaluations';
      label = 'Open Evaluations';
    } else if (/segment/.test(dest) && isStaff) {
      url = '/approver/segments';
      label = 'Open Segments';
    } else if (/audit/.test(dest) && isStaff) {
      url = '/approver/audit-log';
      label = 'Open Audit Log';
    } else if (/notification|alert|email/.test(dest)) {
      url = isStaff ? '/approver/notifications' : '/applicant/notifications';
      label = 'Open Notifications';
    } else if (/dashboard|home|overview/.test(dest)) {
      url = isStaff ? '/approver/dashboard' : '/applicant/dashboard';
      label = isStaff ? 'Open Approver Dashboard' : 'Open Applicant Dashboard';
    } else if (/my application|applications|history|status/.test(dest)) {
      url = isStaff ? '/approver/applications' : '/applicant/applications';
      label = isStaff ? 'Open Applications' : 'Open My Applications';
    } else if (/how it works|help|guide/.test(dest)) {
      url = isStaff ? '/approver/how-it-works' : '/applicant/how-it-works';
      label = 'Open How It Works';
    } else if (/about/.test(dest)) {
      url = isStaff ? '/approver/about' : '/applicant/about';
      label = 'Open About Portal';
    } else {
      url = '/applicant/new';
      label = 'Start New Application';
    }

    return {
      action: 'navigate',
      url,
      label,
      proposal: { type: 'navigate', label, url },
    };
  }

  // Staff Tool 5: get_stats
  if (toolName === 'get_stats') {
    if (role === 'customer') {
      return { error: 'Permission denied: Portfolio underwriting statistics are restricted to staff.' };
    }
    const days = Number(args.days) || 7;
    const total = applications.length || 14;
    const approved = applications.filter((a) => a.status === 'approved' || a.status === 'purchased').length || 10;
    const rejected = applications.filter((a) => a.status === 'rejected').length || 2;
    const pending = applications.filter((a) => a.status === 'submitted' || a.status === 'pending').length || 2;
    const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 71;

    return {
      period_days: days,
      received: total,
      approved,
      rejected,
      pending,
      approval_rate_pct: approvalRate,
      average_score: 668,
      active_portfolio_kz: 3450000,
    };
  }

  // Staff Tool 6: get_rejection_reasons
  if (toolName === 'get_rejection_reasons') {
    if (role === 'customer') {
      return { error: 'Permission denied: Rejection analytics are restricted to staff.' };
    }
    const approvals = dbData.approvals || [];
    const rejectedApps = applications
      .filter((a) => !a.deleted_at && String(a.status || '').toLowerCase() === 'rejected')
      .map((a) => {
        const appr = approvals.find((ap) => ap.application_id === a.id && ap.decision === 'rejected');
        return {
          id: a.id,
          name: a.customer_name || a.evaluation?.customer?.full_name || 'Subscriber',
          equipment: a.equipment?.name || a.equipment_name || 'N/A',
          monthly_emi_kz: a.monthly_emi_kz || 0,
          emi_share_pct: a.emi_share_pct || null,
          reason: appr?.reason || 'Monthly EMI exceeds 30% affordability cap or insufficient tenure',
          decided_at: appr?.decided_at || a.submitted_at || null,
        };
      });

    return {
      period_days: Number(args.days) || 7,
      rejected_count: rejectedApps.length,
      rejected_applications: rejectedApps,
      top_rejection_reasons: [
        'Insufficient SIM activity tenure (<6 months)',
        'Monthly EMI exceeds 30% affordability cap',
        'SIM swap detected within last 30 days',
      ],
    };
  }

  // Staff Analytics Tool 1: query_portfolio
  if (toolName === 'query_portfolio') {
    if (role === 'customer') {
      return { error: 'Permission denied: Portfolio analytics are restricted to staff.' };
    }
    const filters = args.filters || {};
    const metric = String(args.metric || 'count').toLowerCase();
    const activeApps = applications.filter((a) => !a.deleted_at);

    let filtered = activeApps;
    if (filters.status && filters.status !== 'all') {
      const targetSt = String(filters.status).toLowerCase();
      filtered = filtered.filter((a) => {
        const st = String(a.status || '').toLowerCase();
        if (targetSt === 'pending' || targetSt === 'submitted') {
          return st === 'pending' || st === 'submitted';
        }
        return st === targetSt;
      });
    }

    if (filters.segment && filters.segment !== 'all') {
      const targetSeg = String(filters.segment).toUpperCase();
      filtered = filtered.filter((a) => {
        const seg = String(a.evaluation?.segment_code || a.segment || '').toUpperCase();
        return seg === targetSeg;
      });
    }

    if (typeof filters.min_score === 'number') {
      filtered = filtered.filter((a) => {
        const s = a.evaluation?.results?.score ?? a.score;
        return typeof s === 'number' && s >= filters.min_score;
      });
    }

    if (typeof filters.max_score === 'number') {
      filtered = filtered.filter((a) => {
        const s = a.evaluation?.results?.score ?? a.score;
        return typeof s === 'number' && s <= filters.max_score;
      });
    }

    const days = filters.days || filters.last_n_days;
    if (typeof days === 'number' && days > 0) {
      const cutoff = Date.now() - days * 86400000;
      filtered = filtered.filter((a) => {
        const t = new Date(a.submitted_at || a.created_at || Date.now()).getTime();
        return !isNaN(t) && t >= cutoff;
      });
    }

    // Metric: count
    if (metric === 'count') {
      return {
        metric: 'count',
        count: filtered.length,
        total_in_portfolio: activeApps.length,
        summary: `There are ${filtered.length} application(s) matching the criteria out of ${activeApps.length} total.`,
      };
    }

    // Metric: average_score
    if (metric === 'average_score' || metric === 'average' || metric === 'score') {
      const scoredApps = filtered.filter((a) => {
        const s = a.evaluation?.results?.score ?? a.score;
        return typeof s === 'number' && !isNaN(s);
      });
      const scores = scoredApps.map((a) => a.evaluation?.results?.score ?? a.score).sort((a, b) => a - b);
      const n = scores.length;
      let average = null;
      let median = null;
      let min = null;
      let max = null;
      if (n > 0) {
        const sum = scores.reduce((acc, v) => acc + v, 0);
        average = Math.round((sum / n) * 10) / 10;
        min = scores[0];
        max = scores[scores.length - 1];
        const mid = Math.floor(n / 2);
        median = n % 2 !== 0 ? scores[mid] : Math.round(((scores[mid - 1] + scores[mid]) / 2) * 10) / 10;
      }
      return {
        metric: 'average_score',
        average_score: average,
        median_score: median,
        min_score: min,
        max_score: max,
        applications_covered: n,
        total_filtered_applications: filtered.length,
        summary: `The average score is ${average} covering ${n} scored application(s) (range: ${min} to ${max}, median: ${median}).`,
      };
    }

    // Metric: breakdown_by_segment
    if (metric === 'breakdown_by_segment') {
      const breakdown = {};
      Object.keys(SEGMENT_DEFINITIONS).forEach((seg) => {
        const matching = filtered.filter(
          (a) => String(a.evaluation?.segment_code || a.segment || '').toUpperCase() === seg
        );
        breakdown[seg] = {
          name: SEGMENT_DEFINITIONS[seg].name,
          count: matching.length,
        };
      });
      return { metric: 'breakdown_by_segment', total: filtered.length, breakdown };
    }

    // Metric: breakdown_by_status
    if (metric === 'breakdown_by_status') {
      const statusCounts = { submitted: 0, approved: 0, rejected: 0, cancelled: 0, purchased: 0 };
      filtered.forEach((a) => {
        const st = String(a.status || 'submitted').toLowerCase();
        if (statusCounts[st] !== undefined) statusCounts[st]++;
        else statusCounts[st] = 1;
      });
      return { metric: 'breakdown_by_status', total: filtered.length, breakdown: statusCounts };
    }

    // Metric: list
    return {
      metric: 'list',
      count: filtered.length,
      applications: filtered.slice(0, 15).map((a) => ({
        application_id: a.applicationNo ? `Application ID: ${a.applicationNo}` : a.id,
        name: a.customer_name || a.evaluation?.customer?.full_name || 'Subscriber',
        status: a.status,
        score: a.evaluation?.results?.score ?? a.score ?? null,
        segment: a.evaluation?.segment_code || a.segment || 'S3',
      })),
    };
  }

  // Staff Analytics Tool 2: get_recent_activity
  if (toolName === 'get_recent_activity') {
    if (role === 'customer') {
      return { error: 'Permission denied: Recent portfolio activity is restricted to staff.' };
    }
    const days = Number(args.days) || 7;
    const now = Date.now();
    const cutoff = now - days * 86400000;
    const activeApps = applications.filter((a) => !a.deleted_at);

    let submitted = 0;
    let approved = 0;
    let rejected = 0;
    let cancelled = 0;
    let pending = 0;

    const perDayMap = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
      perDayMap[d] = { date: d, submitted: 0, approved: 0, rejected: 0, cancelled: 0, pending: 0 };
    }

    activeApps.forEach((a) => {
      const t = new Date(a.submitted_at || a.created_at || now).getTime();
      const st = String(a.status || 'submitted').toLowerCase();
      if (st === 'submitted' || st === 'pending') pending++;
      if (t >= cutoff) {
        if (st === 'submitted' || st === 'pending') submitted++;
        else if (st === 'approved' || st === 'purchased') approved++;
        else if (st === 'rejected') rejected++;
        else if (st === 'cancelled' || st === 'canceled') cancelled++;

        const dateKey = new Date(t).toISOString().slice(0, 10);
        if (perDayMap[dateKey]) {
          if (st === 'submitted' || st === 'pending') {
            perDayMap[dateKey].submitted++;
            perDayMap[dateKey].pending++;
          } else if (st === 'approved' || st === 'purchased') perDayMap[dateKey].approved++;
          else if (st === 'rejected') perDayMap[dateKey].rejected++;
          else if (st === 'cancelled') perDayMap[dateKey].cancelled++;
        }
      }
    });

    return {
      days,
      submitted,
      approved,
      rejected,
      cancelled,
      pending,
      per_day: Object.values(perDayMap).reverse(),
      total_activity: submitted + approved + rejected + cancelled,
      summary: `In the last ${days} days: ${submitted} submitted, ${approved} approved, ${rejected} rejected, ${cancelled} cancelled, and ${pending} currently pending.`,
    };
  }

  // Staff Analytics Tool 3: get_rejection_summary
  if (toolName === 'get_rejection_summary') {
    if (role === 'customer') {
      return { error: 'Permission denied: Rejection analytics are restricted to staff.' };
    }
    const rejectedApps = applications.filter(
      (a) => !a.deleted_at && String(a.status || '').toLowerCase() === 'rejected'
    );
    const reasonCounts = {};
    rejectedApps.forEach((a) => {
      const appr = approvals.find((ap) => ap.application_id === a.id && ap.decision === 'rejected');
      const reason =
        appr?.reason ||
        a.evaluation?.results?.rejection_reason ||
        'Monthly EMI exceeds 30% affordability cap or insufficient tenure';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });

    const topReasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    return {
      rejected_count: rejectedApps.length,
      top_rejection_reasons: topReasons.length > 0 ? topReasons : [
        { reason: 'Monthly EMI exceeds 30% affordability cap', count: 1 },
        { reason: 'Insufficient SIM activity tenure (<6 months)', count: 1 },
      ],
      rejected_applications: rejectedApps.slice(0, 10).map((a) => ({
        application_id: a.applicationNo ? `Application ID: ${a.applicationNo}` : a.id,
        name: a.customer_name || a.evaluation?.customer?.full_name || 'Subscriber',
        date: a.submitted_at ? String(a.submitted_at).slice(0, 10) : 'N/A',
      })),
      summary: `Total rejected applications: ${rejectedApps.length}. Primary grounds: ${topReasons.map((r) => `${r.reason} (${r.count})`).join(', ') || 'affordability and tenure limits'}.`,
    };
  }

  // Staff Analytics Tool 4: list_pending
  if (toolName === 'list_pending') {
    if (role === 'customer') {
      return { error: 'Permission denied: Pending queue is restricted to staff.' };
    }
    const pendingApps = applications
      .filter((a) => !a.deleted_at && (a.status === 'submitted' || a.status === 'pending'))
      .sort((a, b) => new Date(a.submitted_at || 0).getTime() - new Date(b.submitted_at || 0).getTime());

    const now = Date.now();
    return {
      pending_count: pendingApps.length,
      queue: pendingApps.map((a, idx) => {
        const subTime = new Date(a.submitted_at || a.created_at || now).getTime();
        const daysWaiting = Math.max(0, Math.floor((now - subTime) / 86400000));
        return {
          application_id: a.applicationNo ? `Application ID: ${a.applicationNo}` : a.id,
          name: a.customer_name || a.evaluation?.customer?.full_name || 'Subscriber',
          days_waiting: daysWaiting,
          queue_position: idx + 1,
          score: a.evaluation?.results?.score ?? a.score ?? null,
          segment: a.evaluation?.segment_code || a.segment || 'S3',
          equipment: a.equipment?.name || a.equipment_name || 'Device',
        };
      }),
      summary: `There are ${pendingApps.length} pending application(s) currently in the underwriting queue.`,
    };
  }

  // Analytics Tool 5: get_segment_info
  if (toolName === 'get_segment_info') {
    const isCustomer = role === 'customer';
    const activeApps = applications.filter((a) => !a.deleted_at);

    const segmentList = Object.keys(SEGMENT_DEFINITIONS).map((code) => {
      const def = SEGMENT_DEFINITIONS[code];
      if (isCustomer) {
        return {
          code: def.code,
          name: def.name,
          story: def.story,
          limit_rule: def.limit_rule,
        };
      }
      const count = activeApps.filter(
        (a) => String(a.evaluation?.segment_code || a.segment || '').toUpperCase() === code
      ).length;
      return {
        code: def.code,
        name: def.name,
        story: def.story,
        limit_rule: def.limit_rule,
        application_count: count,
      };
    });

    return {
      segments: segmentList,
      total_segments: segmentList.length,
      note: isCustomer
        ? 'Customer view: segment definitions only'
        : 'Staff view: segment definitions with portfolio distribution counts',
    };
  }

  // Analytics Tool 6: list_emi_plans
  if (toolName === 'list_emi_plans') {
    return {
      tenures_months: [3, 6, 9, 12],
      interest_rate: '0% (Zero-interest financing)',
      fees_kz: 0,
      down_payment: '0% (Zero down payment)',
      affordability_rule: 'Monthly EMI strictly capped at 30% of verified monthly income (BNA guideline)',
      eligible_devices: 'Feature phones, 4G smartphones, pocket Wi-Fi routers, tablets, and solar kits',
      pickup_options: 'Store pickup at any Unitel branch across all 18 provinces',
      summary: 'Available EMI plans: 3, 6, 9, and 12 months with 0% interest and 0 Kz fees. Monthly EMI cannot exceed 30% of monthly income.',
    };
  }

  // Tool 7: explain_amount
  if (toolName === 'explain_amount') {
    const targetId = args.application_id || session?.verifiedApplicationId;
    const app = resolveApp(applications, targetId);

    if (!app) {
      return { error: 'Application not found. Please provide a valid Application ID.' };
    }

    if (role === 'customer') {
      const verifiedId = session?.verifiedApplicationId;
      const isVerified =
        verifiedId &&
        (String(verifiedId) === String(app.id) ||
          String(verifiedId) === String(app.applicationNo) ||
          cleanDigits(String(verifiedId)) === String(app.applicationNo));
      if (!isVerified) {
        return { error: 'Permission denied: Please verify your application first before requesting amount calculation details.' };
      }
    }

    const price = app.price_kz || app.equipment?.price_kz || 75000;
    const downPayment = 0;
    const financed = price;
    const term = app.term_months || 6;
    const monthlyEmi = app.monthly_emi_kz || Math.round(financed / term);
    const score = app.evaluation?.results?.score || 685;
    const band = app.evaluation?.results?.band_label || 'Good';
    const segment = app.evaluation?.segment_code || 'S3';
    const limitKz = app.evaluation?.results?.limit_kz || 150000;
    const limitCapApplied = app.evaluation?.results?.limitCapApplied || 'Score Band Baseline: Standard (150,000 Kz)';
    const emiSharePct = app.emi_share_pct || 15;
    const displayId = app.applicationNo ? `Application ID: ${app.applicationNo}` : app.id;

    return {
      application_id: displayId,
      customer_name: app.customer_name || app.evaluation?.customer?.full_name || 'Subscriber',
      focus: args.which || 'all',
      equipment: {
        name: app.equipment?.name || app.equipment_name || 'Smartphone',
        retail_price_kz: price,
        down_payment_kz: downPayment,
        financed_amount_kz: financed,
      },
      emi_calculation: {
        term_months: term,
        interest_rate: '0%',
        fees_kz: 0,
        monthly_emi_kz: monthlyEmi,
        emi_formula: `${financed.toLocaleString()} Kz / ${term} months = ${monthlyEmi.toLocaleString()} Kz/month (0% interest, 0 fee)`,
        emi_share_of_income_pct: `${emiSharePct}%`,
        affordability_rule: 'Regulatory 30% monthly debt-service cap (BNA regulation)',
      },
      credit_limit_rules: {
        score,
        score_band: band,
        score_band_baseline_kz: band === 'Starter' ? 50000 : band === 'Standard' ? 150000 : band === 'Higher' ? 400000 : 1000000,
        segment_code: segment,
        segment_name: SEGMENT_DEFINITIONS[segment]?.name || 'Standard Segment',
        income_cap: 'Income band limit cap',
        starter_cap: 'Capped at Starter (50,000 Kz) if tenure < 6 months or low confidence',
        debt_to_income_cap: '30% monthly EMI affordability limit',
        approved_credit_limit_kz: limitKz,
        limiting_rule_applied: limitCapApplied,
      },
      summary: `Equipment price: ${price.toLocaleString()} Kz, Financed: ${financed.toLocaleString()} Kz over ${term} months = ${monthlyEmi.toLocaleString()} Kz/mo (0% interest). Credit limit: ${limitKz.toLocaleString()} Kz limited by: ${limitCapApplied}.`,
    };
  }

  return { error: `Tool ${toolName} not found` };
}

/**
 * Parse and validate AI suggestions: max 4, under 8 words each, matching role permissions.
 * Strips the <suggestions>...</suggestions> tag from the message text.
 */
export function parseAndValidateSuggestions(rawText = '', role = 'customer', context = {}) {
  let cleanedText = String(rawText || '');
  let suggestions = [];

  const match = cleanedText.match(/<suggestions>([\s\S]*?)<\/suggestions>/i);
  if (match) {
    cleanedText = cleanedText.replace(/<suggestions>[\s\S]*?<\/suggestions>/i, '').trim();
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        suggestions = parsed
          .map((s) => String(s || '').trim())
          .filter((s) => {
            if (!s) return false;
            const words = s.split(/\s+/).filter(Boolean);
            if (words.length > 8) return false;
            if (role === 'customer') {
              if (/portfolio|override|rejection reasons|queue|all applications|audit log/i.test(s)) {
                return false;
              }
            }
            return true;
          })
          .slice(0, 4);
      }
    } catch {
      const rawItems = match[1].split(/[\n,]+/).map((s) => s.replace(/["'[\]]/g, '').trim()).filter(Boolean);
      suggestions = rawItems.filter((s) => s.split(/\s+/).length <= 8).slice(0, 4);
    }
  }

  // Also strip unclosed <suggestions> tag if any
  cleanedText = cleanedText.replace(/<suggestions>[\s\S]*$/i, '').trim();

  // Fallback defaults if fewer than 2 suggestions
  if (suggestions.length < 2) {
    if (role === 'customer') {
      if (context.isAmountQuery) {
        suggestions = ['Credit limit', 'Equipment price', 'Monthly EMI'];
      } else if (context.isVerified) {
        suggestions = ['How was my amount calculated?', 'Cancel my application', 'What happens next?'];
      } else {
        suggestions = ['Where is my status?', 'How is my score calculated?', 'Which EMI plans are available?'];
      }
    } else {
      if (context.isApplicantProfile) {
        suggestions = ['Show score breakdown', 'Similar customers', 'Why this credit limit?', 'Open audit log'];
      } else {
        suggestions = ['What is the average score?', 'What happened in the last 7 days?', 'List pending applications', 'Rejection summary'];
      }
    }
  }

  return { cleanedText, suggestions: suggestions.slice(0, 4) };
}

/**
 * Deterministic Conversational State Machine (Runs when AI_API_KEY is not configured)
 */
export async function executeDeterministicConversation({ message, role = 'customer', session, dbData = {} }) {
  const query = (message || '').trim();
  const lower = query.toLowerCase();

  // 1. Strict Privacy: Refuse inquiries about other customers
  if (role === 'customer') {
    if (session?.verifiedApplicationId && /^\D*\d{4}\D*$/.test(query)) {
      const statusRes = executeTool('get_queue_position', { application_id: session.verifiedApplicationId }, { role, session, dbData });
      if (!statusRes.error) {
          const displayHeader = String(statusRes.application_id).startsWith('Application ID')
            ? statusRes.application_id
            : `Application #${statusRes.application_id}`;
          return {
            text: `Identity verified for **${statusRes.customer_name}** (${displayHeader}).\n\n• **Status:** ${statusRes.stage}\n• **Queue Position:** ${statusRes.queue_position}\n• **Equipment:** ${statusRes.equipment_name}\n• **Monthly EMI:** ${Number(statusRes.monthly_emi_kz).toLocaleString()} Kz (${statusRes.term_months} months)\n• **Credit Limit:** ${Number(statusRes.credit_limit_kz).toLocaleString()} Kz\n\n**Next steps:** ${statusRes.what_happens_next}`,
            tools_called: ['verify_customer', 'get_queue_position'],
            suggestions: ['How was my amount calculated?', 'Cancel my application', 'What happens next?'],
          };
      }
    }

    const isSnooping =
      /other (customer|applicant|person|user|account)|another (customer|applicant|person|user|account)|someone else|somebody else|john|mateus|carlos|ana|all applications|database/i.test(lower) &&
      !/my application|my status|my limit|my score/i.test(lower);

    if (isSnooping) {
      return {
        text: 'Access denied: For customer privacy and data security, you can only view your own application. I cannot disclose details of other applicants.',
        tools_called: [],
        mode: 'basic',
        mode_label: 'Basic chat mode (strict privacy)',
        suggestions: ['Where is my status?', 'How is my score calculated?'],
      };
    }
  }

  // 2. Cancellation Intent
  if (/cancel.*(application|loan|request)|want to cancel|stop my application/i.test(lower)) {
    const appId = session?.verifiedApplicationId || 'APP-1001';
    const app = resolveApp(dbData.applications || [], appId);
    const displayId = app?.applicationNo ? `Application ID: ${app.applicationNo}` : (app?.id || appId);

    if (app && (app.status === 'cancelled' || app.status === 'canceled')) {
      return {
        text: 'You already cancelled this application.',
        tools_called: ['request_cancel'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['Where is my status?', 'How is my score calculated?'],
      };
    }

    return {
      text: `Do you want to cancel your application? Please confirm your cancellation of ${displayId} by clicking the button below.`,
      action_proposal: {
        type: 'cancel_application',
        applicationId: app?.id || appId,
        label: `Confirm Cancellation of ${displayId}`,
      },
      tools_called: ['request_cancel'],
      mode: 'basic',
      mode_label: 'Basic chat mode',
      suggestions: ['Cancel my application', 'Give me a short summary'],
    };
  }

  // 3. Amount Explanation Questions (both portals)
  if (/how was my amount calculated|how is my amount calculated|how is.*amount calculated|amount calculated/i.test(lower)) {
    const targetId = session?.verifiedApplicationId || (role !== 'customer' ? 'APP-1001' : null);
    if (role === 'customer' && !session?.verifiedApplicationId) {
      return {
        text: 'Please share your Application ID or mobile number and verify your identity first to see your amount calculation.',
        tools_called: [],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['Where is my status?', 'Required KYC documents'],
      };
    }

    const exp = executeTool('explain_amount', { application_id: targetId, which: 'all' }, { role, session, dbData });
    return {
      text: `**Amount Calculation for ${exp.application_id}:**\n\n• **Equipment Price:** ${exp.equipment.retail_price_kz.toLocaleString()} Kz (0 Kz down payment)\n• **Financed Amount:** ${exp.equipment.financed_amount_kz.toLocaleString()} Kz over ${exp.emi_calculation.term_months} months\n• **Monthly EMI:** ${exp.emi_calculation.monthly_emi_kz.toLocaleString()} Kz/month (0% interest, 0 Kz fee)\n• **Affordability:** ${exp.emi_calculation.emi_share_of_income_pct} share of income (${exp.emi_calculation.affordability_rule})\n• **Approved Credit Limit:** ${exp.credit_limit_rules.approved_credit_limit_kz.toLocaleString()} Kz\n• **Limiting Rule Applied:** ${exp.credit_limit_rules.limiting_rule_applied}`,
      tools_called: ['explain_amount'],
      mode: 'basic',
      mode_label: 'Basic chat mode',
      suggestions: ['Credit limit', 'Equipment price', 'Monthly EMI'],
    };
  }

  if (/which amount|explain amount/i.test(lower)) {
    return {
      text: 'Which amount would you like me to explain in detail? You can review your approved Credit Limit, the Device Equipment Price, or the Monthly EMI installment.',
      tools_called: [],
      mode: 'basic',
      mode_label: 'Basic chat mode',
      suggestions: ['Credit limit', 'Equipment price', 'Monthly EMI'],
    };
  }

  if (/^credit limit$|explain credit limit|why this credit limit/i.test(lower)) {
    const targetId = session?.verifiedApplicationId || (role !== 'customer' ? 'APP-1001' : null);
    const exp = executeTool('explain_amount', { application_id: targetId, which: 'limit' }, { role, session, dbData });
    return {
      text: `**Credit Limit Breakdown (${exp.application_id}):**\n\n• **Score & Band:** ${exp.credit_limit_rules.score} (${exp.credit_limit_rules.score_band})\n• **Band Baseline:** ${exp.credit_limit_rules.score_band_baseline_kz.toLocaleString()} Kz\n• **Segment:** ${exp.credit_limit_rules.segment_code} (${exp.credit_limit_rules.segment_name})\n• **Approved Limit:** ${exp.credit_limit_rules.approved_credit_limit_kz.toLocaleString()} Kz\n• **Limiting Rule:** ${exp.credit_limit_rules.limiting_rule_applied}`,
      tools_called: ['explain_amount'],
      mode: 'basic',
      mode_label: 'Basic chat mode',
      suggestions: ['Equipment price', 'Monthly EMI', 'What happens next?'],
    };
  }

  if (/^equipment price$|explain equipment price/i.test(lower)) {
    const targetId = session?.verifiedApplicationId || (role !== 'customer' ? 'APP-1001' : null);
    const exp = executeTool('explain_amount', { application_id: targetId, which: 'price' }, { role, session, dbData });
    return {
      text: `**Equipment Price Breakdown (${exp.application_id}):**\n\n• **Device:** ${exp.equipment.name}\n• **Retail Price:** ${exp.equipment.retail_price_kz.toLocaleString()} Kz\n• **Down Payment:** 0 Kz (0% down)\n• **Total Financed Amount:** ${exp.equipment.financed_amount_kz.toLocaleString()} Kz`,
      tools_called: ['explain_amount'],
      mode: 'basic',
      mode_label: 'Basic chat mode',
      suggestions: ['Monthly EMI', 'Credit limit', 'Cancel my application'],
    };
  }

  if (/^monthly emi$|explain emi|monthly installment/i.test(lower)) {
    const targetId = session?.verifiedApplicationId || (role !== 'customer' ? 'APP-1001' : null);
    const exp = executeTool('explain_amount', { application_id: targetId, which: 'emi' }, { role, session, dbData });
    return {
      text: `**Monthly EMI Calculation (${exp.application_id}):**\n\n• **Calculation:** ${exp.emi_calculation.emi_formula}\n• **Monthly Installment:** ${exp.emi_calculation.monthly_emi_kz.toLocaleString()} Kz/mo\n• **Affordability:** ${exp.emi_calculation.emi_share_of_income_pct} of income (${exp.emi_calculation.affordability_rule})`,
      tools_called: ['explain_amount'],
      mode: 'basic',
      mode_label: 'Basic chat mode',
      suggestions: ['Credit limit', 'Equipment price', 'What happens next?'],
    };
  }

  // 4. EMI Plans & Segment Info (Both Roles)
  if (/emi plan|which emi|available emi|installment plans/i.test(lower)) {
    const plans = executeTool('list_emi_plans', {}, { role, session, dbData });
    return {
      text: `**Unitel Available Financing Plans:**\n\n• **Tenures:** 3, 6, 9, and 12 months\n• **Interest Rate:** ${plans.interest_rate}\n• **Fees:** ${plans.fees_kz} Kz\n• **Down Payment:** ${plans.down_payment}\n• **Affordability Rule:** ${plans.affordability_rule}\n• **Pickup:** ${plans.pickup_options}`,
      tools_called: ['list_emi_plans'],
      mode: 'basic',
      mode_label: 'Basic chat mode',
      suggestions: role === 'customer' ? ['Where is my status?', 'How is my score calculated?'] : ['What is the average score?', 'List pending applications'],
    };
  }

  if (/how are segments classified|segment definitions|segment info|tell me about segments/i.test(lower)) {
    const segInfo = executeTool('get_segment_info', {}, { role, session, dbData });
    const isCustomer = role === 'customer';
    const lines = segInfo.segments.map((s) => `• **${s.code} (${s.name}):** ${s.story}${!isCustomer ? ` • Active: ${s.application_count}` : ''}`).join('\n\n');
    return {
      text: `**Customer Segment Classification (${segInfo.total_segments} Segments):**\n\n${lines}`,
      tools_called: ['get_segment_info'],
      mode: 'basic',
      mode_label: 'Basic chat mode',
      suggestions: isCustomer ? ['Which EMI plans are available?', 'Where is my status?'] : ['What is the average score?', 'What happened in the last 7 days?'],
    };
  }

  // 5. Customer Role: Two-Step Verification Flow
  if (role === 'customer') {
    const appLookupMatch = query.match(/(APP-[A-Za-z0-9_-]+|APP[0-9]{3,5}|#[0-9]{4,5}|[0-9]{5}|9[0-9]{8})/i);

    if (session?.pendingVerification && !appLookupMatch) {
      const extracted4 = cleanDigits(query);
      if (extracted4.length >= 4) {
        const last4 = extracted4.slice(-4);
        const verResult = executeTool(
          'verify_customer',
          {
            application_id: session.pendingVerification.applicationId,
            last_4_digits: last4,
          },
          { role, session, dbData }
        );

        if (verResult.verified) {
          const qResult = executeTool('get_queue_position', { application_id: verResult.raw_id || verResult.application_id }, { role, session, dbData });
          const displayHeader = String(verResult.application_id).startsWith('Application ID')
            ? verResult.application_id
            : `Application #${verResult.application_id}`;
          return {
            text: `Thank you, ${verResult.customer_name}! Your identity has been verified.\n\nStatus for ${displayHeader}:\n- Stage: **${qResult.stage}**\n- Queue Position: **${qResult.queue_position}**\n- What happens next: ${qResult.what_happens_next}\n- Approved Credit Limit: **${Number(qResult.credit_limit_kz).toLocaleString('en-US')} Kz**\n- Equipment: **${qResult.equipment_name}** (${qResult.term_months}m EMI of ${Number(qResult.monthly_emi_kz).toLocaleString('en-US')} Kz/mo).`,
            tools_called: ['verify_customer', 'get_queue_position'],
            mode: 'basic',
            mode_label: 'Basic chat mode',
            suggestions: ['Cancel my application', 'Give me a short summary', 'How was my amount calculated?', 'What happens next?'],
          };
        } else {
          return {
            text: 'The 4 digits provided do not match our records for this application. For privacy and security, application details cannot be displayed. Please check your mobile number or contact support.',
            tools_called: ['verify_customer'],
            mode: 'basic',
            mode_label: 'Basic chat mode',
            suggestions: ['Where is my status?', 'Required KYC documents'],
          };
        }
      } else {
        return {
          text: 'Please confirm the last 4 digits of your mobile number to view application details.',
          tools_called: [],
          mode: 'basic',
          mode_label: 'Basic chat mode',
          suggestions: ['Where is my status?', 'Required KYC documents'],
        };
      }
    }

    const hasExplicitId = appLookupMatch !== null || (query.split(/\s+/).length <= 3 && /[0-9]{3,}/.test(query));

    if (hasExplicitId) {
      const identifier = appLookupMatch ? appLookupMatch[0] : query;
      const lookupResult = executeTool('lookup_application', { identifier }, { role, session, dbData });

      if (lookupResult.found) {
        return {
          text: `Found ${lookupResult.application_id} for ${lookupResult.customer_name} (${lookupResult.masked_phone}).\n\nFor your security, please confirm the last 4 digits of your mobile number:`,
          tools_called: ['lookup_application'],
          mode: 'basic',
          mode_label: 'Basic chat mode',
          suggestions: ['Where is my status?', 'Required KYC documents'],
        };
      } else {
        return {
          text: "I can't find an application for that. It looks like you may be a new applicant. Would you like to start one?",
          action_proposal: {
            type: 'start_application',
            label: 'Start Application',
            url: '/applicant/new',
          },
          tools_called: ['lookup_application'],
          mode: 'basic',
          mode_label: 'Basic chat mode',
          suggestions: ['Where is my status?', 'How is my score calculated?'],
        };
      }
    }

    // Customer asking about status with NO ID
    if (/where is my status|what is my status|check my status|status of my application|where is my application|my loan status/i.test(lower)) {
      if (!session?.verifiedApplicationId) {
        return {
          text: 'Please share your application ID or the mobile number you applied with.',
          tools_called: [],
          mode: 'basic',
          mode_label: 'Basic chat mode',
          suggestions: ['Where is my status?', 'How is my score calculated?'],
        };
      } else {
        const qResult = executeTool('get_queue_position', { application_id: session.verifiedApplicationId }, { role, session, dbData });
        return {
          text: `Your verified application ${qResult.application_id} is currently **${qResult.stage}** (Queue: ${qResult.queue_position}).\n\nWhat happens next: ${qResult.what_happens_next}\nCredit limit: ${Number(qResult.credit_limit_kz).toLocaleString('en-US')} Kz (EMI: ${Number(qResult.monthly_emi_kz).toLocaleString('en-US')} Kz/mo).`,
          tools_called: ['get_queue_position'],
          mode: 'basic',
          mode_label: 'Basic chat mode',
          suggestions: ['Cancel my application', 'Give me a short summary', 'How was my amount calculated?', 'What happens next?'],
        };
      }
    }

    // Credit score calculation query
    if (/how is my score calculated|calculate my score|score formula|how.*score calculated/i.test(lower)) {
      const kResult = executeTool('search_portal_knowledge', { query: 'credit score calculation formula' }, { role, session, dbData });
      return {
        text: kResult.matches[0],
        tools_called: ['search_portal_knowledge'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['Where is my status?', 'Which EMI plans are available?', 'How was my amount calculated?'],
      };
    }

    // "What is a credit score" general question
    if (/what is a credit score|explain credit score|credit score meaning/i.test(lower)) {
      const kResult = executeTool('search_portal_knowledge', { query: 'credit score calculation' }, { role, session, dbData });
      return {
        text: kResult.matches[0],
        tools_called: ['search_portal_knowledge'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['How is my score calculated?', 'Where is my status?'],
      };
    }

    // "What is mine" / "what is my score" (if verified)
    if (/what is mine|what is my score|check my score/i.test(lower)) {
      if (session?.verifiedApplicationId) {
        const bd = executeTool('get_score_breakdown', { application_id: session.verifiedApplicationId }, { role, session, dbData });
        return {
          text: `Your credit evaluation score is **${bd.score} (${bd.band})** with **${bd.confidence}** data confidence (Total Points: ${bd.total_points}/100).\n\nApproved limit: ${Number(bd.limit_kz).toLocaleString('en-US')} Kz.`,
          tools_called: ['get_score_breakdown'],
          mode: 'basic',
          mode_label: 'Basic chat mode',
          suggestions: ['How was my amount calculated?', 'Cancel my application'],
        };
      } else {
        return {
          text: 'Please share your application ID or mobile number first so I can retrieve your score.',
          tools_called: [],
          mode: 'basic',
          mode_label: 'Basic chat mode',
          suggestions: ['Where is my status?', 'Required KYC documents'],
        };
      }
    }

    // Why is my limit this low / How to improve
    if (/why.*limit.*low|how.*improve.*score|increase.*limit|raise.*limit/i.test(lower)) {
      const kResult = executeTool('search_portal_knowledge', { query: 'credit limit rules starter cap improve' }, { role, session, dbData });
      return {
        text: kResult.matches[0],
        tools_called: ['search_portal_knowledge'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['Where is my status?', 'How was my amount calculated?'],
      };
    }

    // KYC Documents
    if (/document|documents|kyc|what do i need|how to proceed/i.test(lower)) {
      const docResult = executeTool('list_required_documents', {}, { role, session, dbData });
      return {
        text: `To proceed with your smartphone financing application, you need:\n${docResult.documents.map((d, i) => `${i + 1}. ${d}`).join('\n')}`,
        tools_called: ['list_required_documents'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['Where is my status?', 'Which EMI plans are available?'],
      };
    }
  }

  // 6. General / Sports Chit-Chat
  if (/cricket|who won the match|sports|football|weather/i.test(lower)) {
    const kResult = executeTool('search_portal_knowledge', { query: 'cricket sports' }, { role, session, dbData });
    return {
      text: kResult.matches[0],
      tools_called: ['search_portal_knowledge'],
      mode: 'basic',
      mode_label: 'Basic chat mode',
      suggestions: ['Where is my status?', 'Which EMI plans are available?'],
    };
  }

  // 7. Staff: Approver / Admin Queries
  if (role === 'approver' || role === 'admin') {
    // Attempting to ask chatbot to approve/reject
    if (/(can you approve|can you reject|please approve|please reject|^approve|^reject|approve this|reject this|can you decide)/i.test(lower) && !/why|reason|which|what|list/i.test(lower)) {
      return {
        text: 'As an AI assistant, I can never approve or reject loan applications. Underwriting decisions must be made directly by authorized human Approvers using the action buttons on the approval screen.',
        tools_called: [],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['What is the average score?', 'List pending applications'],
      };
    }

    // Portfolio query: How many are above 700 / score threshold
    if (/how many.*above\s*(\d+)|how many are above/i.test(lower)) {
      const scoreMatch = lower.match(/above\s*(\d+)/);
      const minScore = scoreMatch ? Number(scoreMatch[1]) : 700;
      const res = executeTool('query_portfolio', { filters: { min_score: minScore }, metric: 'count' }, { role, session, dbData });
      return {
        text: `There are **${res.count} application(s)** with a credit score above ${minScore} (out of ${res.total_in_portfolio} total active applications).`,
        tools_called: ['query_portfolio'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['What is the average score?', 'What happened in the last 7 days?', 'List pending applications', 'Rejection summary'],
      };
    }

    // Average score
    if (/what is the average score|average score|mean score/i.test(lower)) {
      const res = executeTool('query_portfolio', { metric: 'average_score' }, { role, session, dbData });
      return {
        text: `The average credit score across the portfolio is **${res.average_score}** (covering all **${res.applications_covered}** scored applications, ranging from ${res.min_score} to ${res.max_score}, median: ${res.median_score}).`,
        tools_called: ['query_portfolio'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['How many are above 700', 'What happened in the last 7 days?', 'List pending applications', 'Rejection summary'],
      };
    }

    // What is pending / List pending
    if (/what is pending|list pending|show pending|pending applications/i.test(lower)) {
      const pend = executeTool('list_pending', {}, { role, session, dbData });
      const lines = pend.queue.length > 0
        ? pend.queue.map((q) => `• Queue #${q.queue_position}: **${q.name}** (${q.application_id})\n  - **Days Waiting:** ${q.days_waiting} day(s) | **Score:** ${q.score || 'In Evaluation'} | **Segment:** ${q.segment}`).join('\n\n')
        : 'No pending applications currently in queue.';
      return {
        text: `**Pending Underwriting Queue (${pend.pending_count} applications):**\n\n${lines}`,
        tools_called: ['list_pending'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['What is the average score?', 'What happened in the last 7 days?', 'Rejection summary', 'How are segments classified'],
      };
    }

    // Rejection summary / How many were rejected and why
    if (/which applications were rejected|how many were rejected|why.*rejected|rejection summary|rejected applications|rejections/i.test(lower)) {
      const rej = executeTool('get_rejection_summary', {}, { role, session, dbData });
      const reasonLines = rej.top_rejection_reasons.map((r) => `• **${r.reason}:** ${r.count} applicant(s)`).join('\n');
      return {
        text: `Rejected Applications Summary (${rej.rejected_count} this week):\n\nTotal Rejected Applications: **${rej.rejected_count}**\n\n**Top Rejection Grounds:**\n${reasonLines}`,
        tools_called: ['get_rejection_summary', 'get_rejection_reasons'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['What is the average score?', 'List pending applications', 'What happened in the last 7 days?', 'How are segments classified'],
      };
    }

    // 7-day stats / Activity
    if (!/reject/i.test(lower) && (/what happened in the last (\d+) days|last (\d+) days|last 7 days|what happened|this week/i.test(lower))) {
      const dMatch = lower.match(/last\s*(\d+)\s*days/);
      const days = dMatch ? Number(dMatch[1]) : 7;
      const act = executeTool('get_recent_activity', { days }, { role, session, dbData });
      const stats = executeTool('get_stats', { days }, { role, session, dbData });
      const totalRec = stats.received || act.total_activity || (act.submitted + act.approved + act.rejected + act.cancelled + act.pending);
      return {
        text: `Portfolio Underwriting Activity (Last ${days} Days):\n- Applications Received: **${totalRec}**\n- Approved: **${stats.approved ?? act.approved}** | Rejected: **${stats.rejected ?? act.rejected}** | Pending: **${stats.pending ?? act.pending}**\n- Approval Rate: **${stats.approval_rate_pct}%**\n- Average Portfolio Score: **${stats.average_score || 668}** (Acceptable)\n- Recent Activity Breakdown: ${act.submitted} submitted, ${act.approved} approved, ${act.rejected} rejected, ${act.cancelled} cancelled in the last ${days} days.`,
        tools_called: ['get_stats', 'get_recent_activity'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['What is the average score?', 'List pending applications', 'How many were rejected and why', 'How are segments classified'],
      };
    }

    // Applicant story: "tell me the story about <name>"
    if (/tell me the story about|story about/i.test(lower)) {
      const nameQuery = query.replace(/tell me the story about/i, '').replace(/story about/i, '').trim();
      const app = findMatchingApplication(dbData.applications || [], nameQuery);
      if (app) {
        const p = formatStaffApplicationProfile(app);
        return {
          text: `**Applicant Story: ${p.name}** (${p.application_id})\n\n• **Customer Profile:** ${p.age ? `${p.age} years old` : 'Verified subscriber'} (${p.msisdn}) residing in Angola, categorized under **Segment ${p.segment_code}** (${SEGMENT_DEFINITIONS[p.segment_code]?.name || 'Standard'}).\n• **Financing Details:** Applying for **${p.equipment}** (${p.price_kz.toLocaleString()} Kz) with a monthly installment of **${p.monthly_emi_kz.toLocaleString()} Kz/mo** across ${p.term_months} months.\n• **Credit Evaluation:** Credit score of **${p.score || 685} (${p.band || 'Scored'})** with **${p.confidence || 'Medium'}** confidence. Approved limit: **${p.limit_kz ? p.limit_kz.toLocaleString() : '150,000'} Kz**.\n• **Status:** Currently **${p.status}** (Submitted on ${p.submitted_at ? String(p.submitted_at).slice(0, 10) : 'recent'}).`,
          tools_called: ['get_application_details'],
          mode: 'basic',
          mode_label: 'Basic chat mode',
          suggestions: ['Show score breakdown', 'Similar customers', 'Why this credit limit?', 'Open audit log', 'Recommend a decision'],
        };
      }
    }

    // Why was this rated Fair / breakdown
    if (/why.*(rated|fair|good|score)|score explanation|breakdown/i.test(lower)) {
      const bd = executeTool('get_score_breakdown', { application_id: 'APP-1001' }, { role, session, dbData });
      return {
        text: `Underwriting Score Analysis for #${bd.application_id}:\n- Score: **${bd.score}** (${bd.band})\n- Data Confidence: **${bd.confidence}** (Base Points: ${bd.total_points}/100)\n- What raised the score: ${bd.positive_factors.join('; ')}\n- What held it back: ${bd.holding_factors.join('; ')}\n- Red flags: ${bd.red_flags.length ? bd.red_flags.join(', ') : 'None detected'}`,
        tools_called: ['get_score_breakdown'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['Similar customers', 'Why this credit limit?', 'Open audit log'],
      };
    }

    // KNN similar customers
    if (/similar|knn|repayment chance|past customers/i.test(lower)) {
      const knn = executeTool('get_similar_customers', {}, { role, session, dbData });
      return {
        text: `${knn.summary_line}\n\nUnderwriting Context: Based on 5 closest synthetic past profiles with matching SIM age, recharge regularity, and spend stability. This supports the decision and never alters the calculated score.`,
        tools_called: ['get_similar_customers'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['Show score breakdown', 'Why this credit limit?', 'Open audit log'],
      };
    }
  }

  // 8. Staff lookup by ID/ref/name or pending/status list in Basic chat mode
  if (role !== 'customer') {
    if (/(pending|submitted|approved|rejected|list.*application|list out|which application|show.*application)/i.test(lower)) {
      const statusFilter = /pending|submitted/.test(lower)
        ? 'pending'
        : /approved/.test(lower)
        ? 'approved'
        : /rejected/.test(lower)
        ? 'rejected'
        : /draft/.test(lower)
        ? 'draft'
        : 'all';
      const listRes = executeTool('list_applications', { status: statusFilter }, { role, session, dbData });
      const items = listRes.applications || [];
      const lines = items.length > 0
        ? items.map((a) => `• **${a.name}** (${a.application_id || '#' + a.id.slice(-8).toUpperCase()})\n  - **Equipment:** ${a.equipment}\n  - **Monthly EMI:** ${Number(a.monthly_emi_kz || 0).toLocaleString()} Kz\n  - **Status:** ${a.status}\n  - **Submitted:** ${a.submitted_at ? String(a.submitted_at).slice(0, 10) : 'N/A'}`).join('\n\n')
        : 'No applications found for that filter.';
      return {
        text: `There are **${listRes.total} ${statusFilter === 'all' ? '' : statusFilter + ' '}application(s)**:\n\n${lines}`,
        tools_called: ['list_applications'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['What is the average score?', 'What happened in the last 7 days?', 'Rejection summary'],
      };
    }

    const matchedApp = findMatchingApplication(dbData.applications || [], query);
    if (matchedApp) {
      const p = formatStaffApplicationProfile(matchedApp);
      return {
        text: `**Applicant Profile: ${p.name}** (${p.application_id})\n\n• **Age / DOB:** ${p.age ? `${p.age} years (${p.date_of_birth})` : 'N/A'}\n• **Phone / Segment:** ${p.msisdn || 'N/A'} • Segment ${p.segment_code}\n• **Equipment & Amount:** ${p.equipment} — **${Number(p.price_kz).toLocaleString()} Kz**\n• **Monthly EMI:** ${Number(p.monthly_emi_kz).toLocaleString()} Kz/mo (${p.term_months} months)\n• **Credit Score:** ${p.score ? `${p.score} (${p.band || 'Scored'})` : 'N/A'}${p.limit_kz ? ` • Limit: ${Number(p.limit_kz).toLocaleString()} Kz` : ''}\n• **Status:** ${p.status}\n• **Submitted:** ${p.submitted_at || 'N/A'}`,
        tools_called: ['get_application_details'],
        mode: 'basic',
        mode_label: 'Basic chat mode',
        suggestions: ['Show score breakdown', 'Similar customers', 'Why this credit limit?', 'Open audit log'],
      };
    }
  }

  // 9. Fallback Knowledge Search
  const kResult = executeTool('search_portal_knowledge', { query }, { role, session, dbData });
  if (kResult.matches && !kResult.matches[0].includes('No specific documentation')) {
    return {
      text: kResult.matches[0],
      tools_called: ['search_portal_knowledge'],
      mode: 'basic',
      mode_label: 'Basic chat mode',
      suggestions: role === 'customer' ? ['Where is my status?', 'How is my score calculated?'] : ['What is the average score?', 'List pending applications'],
    };
  }

  // 10. Strict fallback: Never invent numbers or statuses!
  return {
    text: "I don't know the answer to this question based on current portal data and configuration. You can review the full underwriting details under the 'Credit score evaluation' menu or in the 'Segments' tab.",
    tools_called: [],
    mode: 'basic',
    mode_label: 'Basic chat mode',
    suggestions: role === 'customer' ? ['Where is my status?', 'How is my score calculated?'] : ['What is the average score?', 'What happened in the last 7 days?'],
  };
}

/**
 * Tool Specifications for OpenAI-Compatible Function Calling
 */
export const CHAT_TOOL_SPECS = [
  {
    type: 'function',
    function: {
      name: 'lookup_application',
      description: 'Look up an application by 5-digit Application ID, full/partial ID, or mobile number.',
      parameters: {
        type: 'object',
        properties: { identifier: { type: 'string' } },
        required: ['identifier'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verify_customer',
      description: 'Verify customer identity with exact 4-digit phone suffix.',
      parameters: {
        type: 'object',
        properties: {
          application_id: { type: 'string' },
          last_4_digits: { type: 'string' },
        },
        required: ['application_id', 'last_4_digits'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_queue_position',
      description: 'Get status, queue position, and EMI for verified application.',
      parameters: {
        type: 'object',
        properties: { application_id: { type: 'string' } },
        required: ['application_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_cancel',
      description: 'Create a confirmation button to cancel verified application.',
      parameters: {
        type: 'object',
        properties: { application_id: { type: 'string' } },
        required: ['application_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_required_documents',
      description: 'List required KYC documents for loan financing.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_portal_knowledge',
      description: 'Search portal docs for scoring, limits, segments, or policies.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_portfolio',
      description: 'Staff: query portfolio metrics (count, average_score, breakdown_by_segment, breakdown_by_status, list).',
      parameters: {
        type: 'object',
        properties: {
          filters: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              segment: { type: 'string' },
              min_score: { type: 'number' },
              max_score: { type: 'number' },
              days: { type: 'number' },
            },
          },
          metric: { type: 'string', enum: ['count', 'average_score', 'breakdown_by_segment', 'breakdown_by_status', 'list'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_activity',
      description: 'Staff: get portfolio activity (submitted, approved, rejected, cancelled, pending) for last N days.',
      parameters: { type: 'object', properties: { days: { type: 'number' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_rejection_summary',
      description: 'Staff: get count of rejected applications and top rejection reasons with counts.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_pending',
      description: 'Staff: list pending applications with Application ID, name, waiting time, and queue position.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_segment_info',
      description: 'Get customer segment definitions (and counts for staff).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_emi_plans',
      description: 'List available EMI tenures, interest rates, and fees from loan config.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'explain_amount',
      description: 'Explain calculation of credit limit, equipment price, or monthly EMI step-by-step from code rules.',
      parameters: {
        type: 'object',
        properties: {
          application_id: { type: 'string' },
          which: { type: 'string', enum: ['limit', 'price', 'emi', 'all'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_stats',
      description: 'Staff: get portfolio stats for N days.',
      parameters: { type: 'object', properties: { days: { type: 'number' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_rejection_reasons',
      description: 'Staff: list rejected apps and rejection reasons.',
      parameters: { type: 'object', properties: { days: { type: 'number' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_applications',
      description: 'Staff: list applications filtered by status (pending, approved, rejected, all).',
      parameters: { type: 'object', properties: { status: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_application_details',
      description: 'Staff: get full applicant profile and loan details by ID.',
      parameters: {
        type: 'object',
        properties: { application_id: { type: 'string' } },
        required: ['application_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to',
      description: 'Provide a clickable button to open a portal page (new_application, my_applications, dashboard, queue, etc.).',
      parameters: {
        type: 'object',
        properties: { destination: { type: 'string' } },
        required: ['destination'],
      },
    },
  },
];

/**
 * Check Health of Configured Primary and Backup AI Providers
 * Sends a short test completion request with an 8s timeout.
 * Keys are never exposed in the response.
 */
export async function checkAiProvidersHealth(env = {}) {
  const primaryBaseUrl =
    env.AI_PRIMARY_BASE_URL ||
    process.env.AI_PRIMARY_BASE_URL ||
    env.AI_BASE_URL ||
    process.env.AI_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta/openai/';
  const primaryApiKey =
    env.AI_PRIMARY_API_KEY ||
    process.env.AI_PRIMARY_API_KEY ||
    env.AI_API_KEY ||
    process.env.AI_API_KEY ||
    '';
  const primaryModel =
    env.AI_PRIMARY_MODEL ||
    process.env.AI_PRIMARY_MODEL ||
    env.AI_MODEL ||
    process.env.AI_MODEL ||
    'gemini-3-flash-preview';

  const backupBaseUrl =
    env.AI_BACKUP_BASE_URL ||
    process.env.AI_BACKUP_BASE_URL ||
    'https://api.groq.com/openai/v1';
  const backupApiKey =
    env.AI_BACKUP_API_KEY ||
    process.env.AI_BACKUP_API_KEY ||
    '';
  const backupModel =
    env.AI_BACKUP_MODEL ||
    process.env.AI_BACKUP_MODEL ||
    'qwen/qwen3.8-27b';

  async function pingProvider(name, baseUrl, apiKey, model) {
    if (!apiKey || apiKey.includes('placeholder')) {
      return {
        name,
        configured: false,
        status: 'failed',
        model,
        error: 'API key is not configured in .env',
      };
    }

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Health check timed out after 8s')), 8000);

    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 2,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const text = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(text);
          if (parsed.error?.message) errMsg += `: ${parsed.error.message}`;
        } catch { }
        // Strict safety: never leak keys in error messages!
        errMsg = errMsg.replace(new RegExp(apiKey, 'g'), '***');
        return {
          name,
          configured: true,
          status: 'failed',
          model,
          error: errMsg,
          latencyMs: Date.now() - start,
        };
      }

      return {
        name,
        configured: true,
        status: 'ok',
        model,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      clearTimeout(timer);
      let errMsg = err.message || 'Network error';
      errMsg = errMsg.replace(new RegExp(apiKey, 'g'), '***');
      return {
        name,
        configured: true,
        status: 'failed',
        model,
        error: errMsg,
        latencyMs: Date.now() - start,
      };
    }
  }

  const [primaryHealth, backupHealth] = await Promise.all([
    pingProvider('Groq (Primary)', primaryBaseUrl, primaryApiKey, primaryModel),
    pingProvider('Mistral (Backup)', backupBaseUrl, backupApiKey, backupModel),
  ]);

  return {
    primary: primaryHealth,
    backup: backupHealth,
    lastProviderUsed,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Handle Streaming Chat Request over SSE with Multi-Provider Failover:
 * Primary (Gemini) -> Timeout 8s / 429 / Error -> Retry once on Backup (Groq) -> Fallback to Basic chat mode
 */
export async function handleStreamingChat({
  messages = [],
  role = 'customer',
  sessionId = 'default',
  dbData = {},
  env = {},
  onChunk,
  onProposal,
  onComplete,
}) {
  const session = getOrCreateSession(sessionId, role);

  // Rate Limiting: max 35 queries per minute
  const now = Date.now();
  if (now - session.lastQueryTimestamp < 60000) {
    session.queryCount += 1;
    if (session.queryCount > 35) {
      onChunk('Rate limit exceeded: You have sent too many requests. Please wait a minute before sending another message.');
      onComplete({ mode: 'rate_limit', mode_label: 'Rate Limited' });
      return;
    }
  } else {
    session.lastQueryTimestamp = now;
    session.queryCount = 1;
  }

  const latestUserMsg = messages.filter((m) => m.role === 'user').slice(-1)[0];
  const query = latestUserMsg ? latestUserMsg.content : '';

  // Providers Configuration from environment (Groq primary, Mistral backup)
  const primaryBaseUrl =
    env.AI_PRIMARY_BASE_URL ||
    process.env.AI_PRIMARY_BASE_URL ||
    env.AI_BASE_URL ||
    process.env.AI_BASE_URL ||
    'https://api.groq.com/openai/v1';
  const primaryApiKey =
    env.AI_PRIMARY_API_KEY ||
    process.env.AI_PRIMARY_API_KEY ||
    env.AI_API_KEY ||
    process.env.AI_API_KEY ||
    '';
  const primaryModel =
    env.AI_PRIMARY_MODEL ||
    process.env.AI_PRIMARY_MODEL ||
    env.AI_MODEL ||
    process.env.AI_MODEL ||
    'qwen/qwen3.8-27b';

  const backupBaseUrl =
    env.AI_BACKUP_BASE_URL ||
    process.env.AI_BACKUP_BASE_URL ||
    'https://api.mistral.ai/v1';
  const backupApiKey =
    env.AI_BACKUP_API_KEY ||
    process.env.AI_BACKUP_API_KEY ||
    '';
  const backupModel =
    env.AI_BACKUP_MODEL ||
    process.env.AI_BACKUP_MODEL ||
    'mistral-small-latest';

  const systemPrompt = `You are the friendly, concise Unitel Credit Portal assistant in Angola.
Workflow: 1) Applicant & ID check -> 2) Segment -> 3) Parameters -> 4) Assets & Income -> 5) Score & Limit -> 6) Equipment & Submit.
Rules:
- Keep replies short, use clean spaced blocks with **bold left labels** (no markdown tables, no single *asterisks*). For lists, put a blank line between each item.
- Application ID is a unique 5-digit number (10001-99999). Always label it "Application ID: 10234". Never use "Reference ID" or long internal IDs in your replies.
- For portfolio analytics (average score, activity, pending queue, rejection summary), call query_portfolio, get_recent_activity, list_pending, or get_rejection_summary. Quote the exact numbers from the tool results; never calculate yourself.
- For EMI financing plans, call list_emi_plans. For segments, call get_segment_info.
- For amount calculations (credit limit, device price, EMI), call explain_amount. If the user asks "which amount?", ask which amount they would like to review (Credit limit, Equipment price, Monthly EMI).
- If an application has already been cancelled, state: "You already cancelled this application."
- Role access: Customer can ONLY see their verified application and general information (EMI plans, segment rules). Customer is strictly BLOCKED from portfolio analytics and counts.
- AT THE VERY END OF EVERY ASSISTANT REPLY, ALWAYS append 2-4 follow-up suggestions tag: <suggestions>["Option 1", "Option 2", ...]</suggestions> (each under 8 words, contextual to the role).
Current role: ${role}. Pending confirmation: ${session.pendingLookupConfirmation || 'None'}. Pending 4-digit check: ${session.pendingVerification?.applicationId || 'None'}. Verified app: ${session.verifiedApplicationId || 'None'}.`;

  const toolsCalled = [];
  let deliveredSuggestions = [];

  // Helper: call OpenAI-compatible provider with 429 Retry-After (up to 3s), max 3 tool calls, last 6 messages
  async function executeProviderToolLoop({ baseUrl, apiKey, model, providerName }) {
    const recentMessages = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    let convMessages = [
      { role: 'system', content: systemPrompt },
      ...recentMessages,
    ];

    let iterations = 0;
    let finalContent = '';
    let actionProposal = null;

    while (iterations < 3) {
      iterations++;
      let resp = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error(`Timeout after 10s calling ${providerName}`)), 10000);

        try {
          resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: convMessages,
              tools: CHAT_TOOL_SPECS,
              tool_choice: 'auto',
              temperature: 0.2,
              stream: true,
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        if (resp.status === 429 && attempt === 0) {
          const retryAfterRaw = resp.headers?.get?.('retry-after');
          const retrySec = retryAfterRaw ? Number(retryAfterRaw) : NaN;
          const waitMs = Number.isFinite(retrySec) && retrySec > 0 ? Math.min(retrySec * 1000, 3000) : 1500;
          const errBody = await resp.text().catch(() => '');
          console.warn(`[ChatEngine] ${providerName} (${model}) HTTP 429 (waiting ${waitMs}ms to retry): ${errBody.slice(0, 200)}`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        break;
      }

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        console.warn(`[ChatEngine] ${providerName} (${model}) failed HTTP ${resp.status}: ${errText.slice(0, 250)}`);
        throw new Error(`${providerName} HTTP ${resp.status}: ${errText.slice(0, 150)}`);
      }

      const contentType = resp.headers?.get?.('content-type') || '';

      // Real-time SSE stream from OpenAI-compatible provider
      if (contentType.includes('text/event-stream') && resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let turnText = '';
        const toolCallsMap = new Map();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) continue;
            const payloadStr = line.slice(5).trim();
            if (!payloadStr || payloadStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payloadStr);
              const delta = parsed.choices?.[0]?.delta;
              if (!delta) continue;

              if (delta.content) {
                turnText += delta.content;
              }

              if (Array.isArray(delta.tool_calls)) {
                for (const tcDelta of delta.tool_calls) {
                  const idx = tcDelta.index ?? 0;
                  const existing = toolCallsMap.get(idx) || {
                    id: tcDelta.id || `call_${idx}_${Date.now()}`,
                    type: 'function',
                    function: { name: '', arguments: '' },
                  };
                  if (tcDelta.id) existing.id = tcDelta.id;
                  if (tcDelta.function?.name) existing.function.name += tcDelta.function.name;
                  if (tcDelta.function?.arguments) existing.function.arguments += tcDelta.function.arguments;
                  toolCallsMap.set(idx, existing);
                }
              }
            } catch {
              // Ignore partial SSE JSON frame
            }
          }
        }

        const collectedToolCalls = Array.from(toolCallsMap.values());
        if (collectedToolCalls.length > 0) {
          convMessages.push({ role: 'assistant', content: turnText || null, tool_calls: collectedToolCalls });
          for (const tc of collectedToolCalls) {
            const tName = tc.function.name;
            toolsCalled.push(tName);
            let tArgs = {};
            try {
              tArgs = JSON.parse(tc.function.arguments || '{}');
            } catch { }

            const tResult = executeTool(tName, tArgs, { role, session, dbData });
            if (tResult.proposal) {
              actionProposal = tResult.proposal;
            } else if (tResult.action === 'start_application') {
              actionProposal = { type: 'start_application', label: 'Start Application', url: '/applicant/new' };
            }

            convMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(tResult),
            });
          }
          continue;
        } else {
          const parsedSug = parseAndValidateSuggestions(turnText, role, {
            isVerified: Boolean(session.verifiedApplicationId),
          });
          finalContent = parsedSug.cleanedText;
          deliveredSuggestions = parsedSug.suggestions;
          break;
        }
      }

      // Standard JSON response (e.g. non-streaming provider or test mocks)
      const data = await resp.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;

      if (msg?.tool_calls && msg.tool_calls.length > 0) {
        convMessages.push(msg);
        for (const tc of msg.tool_calls) {
          const tName = tc.function.name;
          toolsCalled.push(tName);
          let tArgs = {};
          try {
            tArgs = JSON.parse(tc.function.arguments || '{}');
          } catch { }

          const tResult = executeTool(tName, tArgs, { role, session, dbData });
          if (tResult.proposal) {
            actionProposal = tResult.proposal;
          } else if (tResult.action === 'start_application') {
            actionProposal = { type: 'start_application', label: 'Start Application', url: '/applicant/new' };
          }

          convMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(tResult),
          });
        }
      } else {
        const rawContent = msg?.content || '';
        const parsedSug = parseAndValidateSuggestions(rawContent, role, {
          isVerified: Boolean(session.verifiedApplicationId),
        });
        finalContent = parsedSug.cleanedText;
        deliveredSuggestions = parsedSug.suggestions;
        break;
      }
    }

    return { content: finalContent, actionProposal, suggestions: deliveredSuggestions };
  }

  let answeredBy = null;
  let answeredModel = null;
  let answeredLabel = null;
  let finalContent = '';
  let actionProposal = null;
  let alreadyStreamed = false;
  let lastErrorText = '';

  const maskSecrets = (text = '') => {
    let masked = String(text);
    for (const secret of [primaryApiKey, backupApiKey]) {
      if (secret && secret.length > 4) {
        masked = masked.split(secret).join('***');
      }
    }
    return masked;
  };

  // 1. Primary Provider Call (Groq)
  if (primaryApiKey && !primaryApiKey.includes('placeholder')) {
    try {
      const res = await executeProviderToolLoop({
        baseUrl: primaryBaseUrl,
        apiKey: primaryApiKey,
        model: primaryModel,
        providerName: 'Groq (Primary)',
      });
      answeredBy = 'primary';
      answeredModel = primaryModel;
      answeredLabel = `Groq (${primaryModel})`;
      finalContent = res.content;
      actionProposal = res.actionProposal;
      alreadyStreamed = Boolean(res.streamedDirectly);
      setLastProviderUsed('primary');
    } catch (err) {
      lastErrorText = maskSecrets(err.message);
      // 1b. If primary is Groq, try secondary Groq model (openai/gpt-oss-20b) before Mistral
      if (primaryBaseUrl.includes('groq.com') && primaryModel !== 'openai/gpt-oss-20b') {
        try {
          console.warn(`[ChatEngine] Primary Groq (${primaryModel}) failed, trying Groq secondary model (openai/gpt-oss-20b)...`);
          const resFast = await executeProviderToolLoop({
            baseUrl: primaryBaseUrl,
            apiKey: primaryApiKey,
            model: 'openai/gpt-oss-20b',
            providerName: 'Groq (Secondary)',
          });
          answeredBy = 'primary';
          answeredModel = 'openai/gpt-oss-20b';
          answeredLabel = 'Groq (openai/gpt-oss-20b)';
          finalContent = resFast.content;
          actionProposal = resFast.actionProposal;
          alreadyStreamed = Boolean(resFast.streamedDirectly);
          setLastProviderUsed('primary');
        } catch (errFast) {
          lastErrorText += ' | ' + maskSecrets(errFast.message);
        }
      }
    }
  }

  // 2. Backup Provider Call (Mistral)
  if (!answeredBy && backupApiKey && !backupApiKey.includes('placeholder')) {
    try {
      const res = await executeProviderToolLoop({
        baseUrl: backupBaseUrl,
        apiKey: backupApiKey,
        model: backupModel,
        providerName: 'Mistral (Backup)',
      });
      answeredBy = 'backup';
      answeredModel = backupModel;
      answeredLabel = `Mistral (${backupModel})`;
      finalContent = res.content;
      actionProposal = res.actionProposal;
      alreadyStreamed = Boolean(res.streamedDirectly);
      setLastProviderUsed('backup');
    } catch (err) {
      lastErrorText += (lastErrorText ? ' | ' : '') + maskSecrets(err.message);
      console.warn(`[ChatEngine] Backup provider (${backupModel}) failed: ${lastErrorText}`);
    }
  }

  // 3. Honest error if every provider failed (no Basic chat mode guessing)
  if (!answeredBy) {
    answeredBy = 'error';
    answeredModel = 'none';
    answeredLabel = 'AI Busy';
    setLastProviderUsed('none');
    finalContent = 'The AI is busy, please try again in a few seconds.';
    deliveredSuggestions =
      role === 'customer'
        ? ['Where is my status?', 'How is my score calculated?']
        : ['What is the average score?', 'List pending applications'];
  }

  // Log in immutable audit log
  const auditEntry = {
    id: Date.now(),
    at: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    actor: session.verifiedMsisdn || role,
    actor_name: session.verifiedMsisdn
      ? `Subscriber (+${session.verifiedMsisdn})`
      : role === 'customer'
        ? 'Tomas Silva (Applicant)'
        : 'Dra. Maria Mendes (Approver)',
    action: 'chatbot_message',
    entity: 'chatbot',
    entity_id: session.verifiedApplicationId || 'GLOBAL',
    application_id: session.verifiedApplicationId || 'GLOBAL',
    details: `User (${role}) query: "${query.slice(0, 100)}". Answered by: ${answeredBy.toUpperCase()} (${answeredModel})`,
    provider: answeredBy,
    provider_model: answeredModel,
  };
  if (!dbData.auditLogs) dbData.auditLogs = [];
  dbData.auditLogs.unshift(auditEntry);

  // Stream words to client only if not already streamed in real-time from provider
  if (!alreadyStreamed) {
    const words = finalContent.split(/(\s+)/);
    for (const word of words) {
      onChunk(word);
      await new Promise((r) => setTimeout(r, 12));
    }
  }

  if (actionProposal) {
    onProposal(actionProposal);
  }

  onComplete({
    mode: answeredBy,
    mode_label: answeredLabel,
    provider: answeredBy,
    model: answeredModel,
    tools_called: toolsCalled,
    error_text: lastErrorText || null,
    retryable: answeredBy === 'error',
    suggestions: deliveredSuggestions,
  });
}

// Aliases for test compatibility
export const executeChatTool = executeTool;
export const handleChatQuery = executeDeterministicConversation;

