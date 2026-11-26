import { describe, it, expect } from 'vitest';
import { executeChatTool, handleChatQuery } from '../../server/chatEngine.js';
import { predictCustomerSegment } from './segmentationService';
import { retrieveKnowledge } from './portalKnowledge';
import { DEFAULT_SEGMENTS } from '../data/seedData';

describe('Acceptance Test Suite: ML Service, Segmentation, Approver & Chatbot', () => {
  // Test mock dbData
  const mockDbData = {
    applications: [
      {
        id: 'APP-1001',
        customer_name: 'Thomas Mateus',
        msisdn: '923111222',
        equipment_name: 'Smartphone 4G Mid',
        price_kz: 85000,
        term_months: 12,
        monthly_emi_kz: 10000,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        evaluation_id: 'EVAL-1001',
      },
      {
        id: 'APP-1002',
        customer_name: 'Ana Rodrigues',
        msisdn: '923444555',
        equipment_name: 'Solar Home Kit',
        price_kz: 120000,
        term_months: 6,
        monthly_emi_kz: 22000,
        status: 'rejected',
        submitted_at: new Date().toISOString(),
        evaluation_id: 'EVAL-1002',
      },
      {
        id: 'APP-1003',
        customer_name: 'Carlos Bento',
        msisdn: '923777888',
        equipment_name: 'Feature Phone Pro',
        price_kz: 35000,
        term_months: 3,
        monthly_emi_kz: 12000,
        status: 'approved',
        submitted_at: new Date().toISOString(),
        evaluation_id: 'EVAL-1003',
      },
    ],
    evaluations: [
      {
        id: 'EVAL-1001',
        score: 712,
        scoreBand: 'Good',
        dataConfidence: 'High',
        limitKz: 150000,
        totalPoints: 68,
        blockScores: {},
        overlayFlags: [],
        positiveReasons: ['Consistent airtime top-up frequency', 'Verified telecom tenure'],
        dataGaps: ['No commercial bank statement'],
      },
      {
        id: 'EVAL-1002',
        score: 480,
        scoreBand: 'High risk',
        dataConfidence: 'Low',
        limitKz: 50000,
        totalPoints: 30,
        blockScores: {},
        overlayFlags: [{ ruleKey: 'SIM_SWAP_HOLD', action: 'hold', note: 'SIM replaced within 30 days' }],
        positiveReasons: [],
        dataGaps: ['Thin telecom record', 'Missing KYC match'],
      },
    ],
    approvals: [
      { id: 'AP-1', applicationId: 'APP-1002', decision: 'rejected', reason: 'Insufficient SIM activity tenure' },
      { id: 'AP-2', applicationId: 'APP-1003', decision: 'approved', reason: 'Verified profile and 12m+ tenure' },
    ],
    notifications: [],
    auditLogs: [],
  };

  // 1. Acceptance Test 1: Admin > Segments shows ML validation card, no switch, old segments intact
  it('Criterion 1: Segments screen preserves all 10 segments without an ML/rules switch', () => {
    expect(DEFAULT_SEGMENTS).toHaveLength(10);
    const codes = DEFAULT_SEGMENTS.map((s) => s.code);
    expect(codes).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10']);

    // Ensure segment names and properties are fully intact
    const s1 = DEFAULT_SEGMENTS.find((s) => s.code === 'S1');
    expect(s1?.name).toBe('Button phone, cash-only');
    expect(s1?.limit_rule).toContain('Starter limit only');
  });

  // 2. Acceptance Test 2: Stop ML service -> temporary fallback note and graceful operation
  it('Criterion 2: ML service offline falls back silently to rule-based engine', async () => {
    // Calling predictCustomerSegment when network is offline or unmocked returns fallback
    const res = await predictCustomerSegment(
      {
        sim_age_months: 24,
        topup_regularity: 0.85,
        avg_monthly_topup_kz: 45000,
        spend_stability: 0.85,
        airtime_loans_repaid_ratio: 0.95,
        wallet_level: 2,
      },
      'S6'
    );

    expect(res.segmentCode).toBe('S6');
    expect(res.isOffline).toBe(true);
    expect(res.model).toContain('Fallback');
  });

  // 3. Acceptance Test 3: Approver screen shows KNN card and summary before Approve in both modes
  it('Criterion 3: KNN card returns 5 similar customers with outcomes and repayment chance', () => {
    const knnResult = executeChatTool(
      'get_similar_customers',
      { id: 'APP-1001' },
      { role: 'approver', dbData: mockDbData }
    );

    expect(knnResult.similar_customers_count).toBe(5);
    expect(knnResult.repaid_on_time).toBe(4);
    expect(knnResult.paid_late).toBe(1);
    expect(knnResult.repayment_chance_pct).toBe(80);
    expect(knnResult.summary_line).toBe(
      '5 similar customers: 4 repaid on time, 1 paid late. Estimated repayment chance: 80%.'
    );
    expect(knnResult.disclaimer).toBe('Based on synthetic demo history');
  });

  // 4. Acceptance Test 4: Applicant page queries and button-confirmed cancellation
  it('Criterion 4: Applicant page queries status, calculation, limit, and requires button confirmation to cancel', async () => {
    const session = {
      sessionId: 'test-cust-01',
      role: 'customer',
      verifiedApplicationId: 'APP-1001',
      verifiedMsisdn: '923111222',
      queryCount: 0,
      lastQueryTimestamp: Date.now(),
    };
    const context = { role: 'customer', msisdn: '923111222', applicationId: 'APP-1001', session, dbData: mockDbData };

    // A: Status query
    const statusRes = await handleChatQuery({ message: 'What is my status?', ...context });
    expect(statusRes.text.toUpperCase()).toContain('SUBMITTED');
    expect(statusRes.tools_called.some((t: string) => t === 'get_application' || t === 'get_queue_position')).toBe(true);

    // B: Score calculation query
    const scoreRes = await handleChatQuery({ message: 'How is my score calculated?', ...context });
    expect(scoreRes.text).toContain('300 to 900');

    // C: Limit query
    const limitRes = await handleChatQuery({ message: 'Why is my limit this low?', ...context });
    expect(limitRes.text).toContain('Starter Cap');

    // D: Cancel query -> must propose confirmation button, NOT cancel immediately
    const cancelReq = await handleChatQuery({ message: 'Cancel my application', ...context });
    expect(cancelReq.action_proposal).toBeDefined();
    expect(cancelReq.action_proposal?.type).toBe('cancel_application');
    expect(cancelReq.action_proposal?.applicationId).toBe('APP-1001');

    // Verify application remains submitted until confirmed
    const appBefore = mockDbData.applications.find((a) => a.id === 'APP-1001');
    expect(appBefore?.status).toBe('submitted');
  });

  // 5. Acceptance Test 5: Approver chat answers from data
  it('Criterion 5: Approver chat explains score, 7-day stats, and rejected applications', async () => {
    const context = { role: 'approver', applicationId: 'APP-1001', dbData: mockDbData };

    // A: Why was this rated Fair
    const whyRes = await handleChatQuery({ message: 'Why was this rated Fair?', ...context });
    expect(whyRes.text).toContain('Score: **712**');
    expect(whyRes.text).toContain('Consistent airtime top-up frequency');

    // B: 7-day stats
    const statsRes = await handleChatQuery({ message: 'What happened in the last 7 days?', ...context });
    expect(statsRes.text).toContain('Applications Received:');
    expect(statsRes.tools_called.some((t: string) => t === 'get_stats' || t === 'get_weekly_stats')).toBe(true);

    // C: Rejections this week
    const rejRes = await handleChatQuery({ message: 'Which applications were rejected this week and why?', ...context });
    expect(rejRes.text).toContain('Rejected Applications Summary');
    expect(rejRes.tools_called.some((t: string) => t === 'get_rejection_reasons' || t === 'list_applications')).toBe(true);

    // D: Attempt to approve via chat
    const approveAttempt = await handleChatQuery({ message: 'Can you approve this loan application?', ...context });
    expect(approveAttempt.text).toContain('never approve or reject');
  });

  // 6. Acceptance Test 6: Free wording knowledge retrieval
  it('Criterion 6: Free wording queries like "what does the red-flag thing do?" return accurate knowledge', async () => {
    const res = await handleChatQuery({
      message: 'what does the red-flag thing do?',
      role: 'analyst',
      dbData: mockDbData,
    });

    expect(res.text).toContain('SIM Swap Hold');
    expect(res.text).toContain('Geographic Disparity');
    expect(res.text).toContain('Starter Cap');

    // Direct semantic retrieval check
    const sec = retrieveKnowledge('what does the red-flag thing do?');
    expect(sec.length).toBeGreaterThan(0);
    expect(sec[0].content).toContain('SIM Swap in last 30 days');
  });

  // 7. Acceptance Test 7: Customer snooping refused, unknown questions get "I don't know"
  it('Criterion 7: Customer cross-inquiry is refused, and unknown questions get "I don\'t know"', async () => {
    const customerContext = { role: 'customer', msisdn: '923111222', applicationId: 'APP-1001', dbData: mockDbData };

    // A: Customer asks about another customer
    const snoopingRes = await handleChatQuery({
      message: "What is John's application score and limit?",
      ...customerContext,
    });
    expect(snoopingRes.text).toContain('Access denied');
    expect(snoopingRes.text).toContain('only view your own application');

    // B: Customer calls list_applications tool directly -> permission denied
    const deniedTool = executeChatTool('list_applications', {}, customerContext);
    expect(deniedTool.error).toContain('Permission denied');

    // C: Unknown question not in knowledge or data -> "I don't know" without inventing numbers
    const unknownRes = await handleChatQuery({
      message: 'What is the stock price of Tesla on Mars?',
      ...customerContext,
    });
    expect(unknownRes.text).toContain("I don't know");
    expect(unknownRes.text).toContain('Credit score evaluation');
  });
});
