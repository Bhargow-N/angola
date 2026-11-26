import { describe, it, expect, beforeEach } from 'vitest';
import {
  executeTool,
  executeDeterministicConversation,
  findMatchingApplication,
  resolveApp,
  parseAndValidateSuggestions,
  getOrCreateSession,
} from '../../server/chatEngine.js';
import { getNextApplicationNo, createSeedLoanData } from './loans';
import { LoanApplication } from '../types';

describe('5-Digit Application ID & Chatbot Analytics Tools Verification', () => {
  let mockApplications: LoanApplication[];
  let dbData: any;

  beforeEach(() => {
    const seed: any = createSeedLoanData();
    mockApplications = seed.applications;
    dbData = {
      applications: mockApplications,
      evaluations: seed.evaluations || [],
      approvals: seed.approvals,
      auditLogs: seed.auditLogs,
    };
  });

  // 1. 5-Digit Application ID Generation & Migration
  it('Requirement 1 & 3: Seed applications have 5-digit applicationNo (10001-10008) and next gets 10009', () => {
    expect(mockApplications.length).toBe(8);
    const nos = mockApplications.map((a) => a.applicationNo);
    expect(nos).toEqual([10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008]);

    const nextNo = getNextApplicationNo(mockApplications);
    expect(nextNo).toBe(10009);
    expect(nextNo).toBeGreaterThanOrEqual(10001);
    expect(nextNo).toBeLessThanOrEqual(99999);
  });

  // 2. Chatbot lookup accepts 5-digit number in any form & legacy IDs resolve
  it('Requirement 4: Chatbot lookup resolves 5-digit number in any form ("10002", "#10002", "APP-10002", "app 10002") and legacy IDs', () => {
    // Exact digits
    const m1 = findMatchingApplication(mockApplications, '10002');
    expect(m1).toBeDefined();
    expect(m1?.applicationNo).toBe(10002);
    expect(m1?.evaluation?.customer?.full_name).toContain('Esperança');

    // With hash
    const m2 = findMatchingApplication(mockApplications, '#10002');
    expect(m2).toBeDefined();
    expect(m2?.applicationNo).toBe(10002);

    // With APP- prefix
    const m3 = findMatchingApplication(mockApplications, 'APP-10002');
    expect(m3).toBeDefined();
    expect(m3?.applicationNo).toBe(10002);

    // With lowercase "app 10002"
    const m4 = findMatchingApplication(mockApplications, 'app 10002');
    expect(m4).toBeDefined();
    expect(m4?.applicationNo).toBe(10002);

    // Legacy seed ID resolves
    const legacy = findMatchingApplication(mockApplications, 'app-seed-005');
    expect(legacy).toBeDefined();
    expect(legacy?.applicationNo).toBe(10005);

    // resolveApp helper resolves
    const resolved = resolveApp(mockApplications, '#10002');
    expect(resolved).toBeDefined();
    expect(resolved?.applicationNo).toBe(10002);
  });

  // 3. New Application Created gets 10009 and is lookable by 5-digit number
  it('Requirement 5: Create a new application, check that it gets 10009, and look it up by only the number', () => {
    const nextNo = getNextApplicationNo(mockApplications);
    const newApp: any = {
      id: `app-${Date.now()}`,
      applicationNo: nextNo,
      customer_id: 'cust-test-999',
      customer_name: 'António Luanda',
      msisdn: '+244 923 888 777',
      status: 'submitted',
      price_kz: 90000,
      monthly_emi_kz: 15000,
      term_months: 6,
      submitted_at: new Date().toISOString(),
      evaluation: {
        customer: { full_name: 'António Luanda', msisdn: '+244 923 888 777' },
        results: { score: 735, band_label: 'Good', limit_kz: 150000, confidence: 'high' },
        segment_code: 'S7',
      },
    };
    mockApplications.push(newApp);

    expect(newApp.applicationNo).toBe(10009);

    // Lookup using only the number
    const lookedUp = findMatchingApplication(mockApplications, '10009');
    expect(lookedUp).toBeDefined();
    expect(lookedUp?.customer_name).toBe('António Luanda');

    // Tool lookup_application returns "Application ID: 10009"
    const toolRes = executeTool('lookup_application', { identifier: '10009' }, { role: 'customer', dbData });
    expect(toolRes.found).toBe(true);
    expect(toolRes.application_id).toBe('Application ID: 10009');
    expect(toolRes.customer_name).toBe('António Luanda');
  });

  // 4. Staff Analytics Tool: query_portfolio
  it('Analytics Tool 1: query_portfolio calculates count, average score, median, min, max, and covers scored apps; blocked for customer', () => {
    // Score threshold: above 700
    const countAbove700 = executeTool(
      'query_portfolio',
      { filters: { min_score: 700 }, metric: 'count' },
      { role: 'approver', dbData }
    );
    expect(countAbove700.error).toBeUndefined();
    expect(countAbove700.metric).toBe('count');
    // Scores in seed: 796 (S1), 846 (S3), 846 (S7), 424 (Mateus), 770 (Rosa), 809 (Alberto), 672 (Teresa), 882 (Manuel)
    // Above 700: 796, 846, 846, 770, 809, 882 => exactly 6 applications!
    expect(countAbove700.count).toBe(6);
    expect(countAbove700.total_in_portfolio).toBe(8);

    // Average score
    const avgScore = executeTool(
      'query_portfolio',
      { metric: 'average_score' },
      { role: 'approver', dbData }
    );
    expect(avgScore.error).toBeUndefined();
    expect(avgScore.metric).toBe('average_score');
    expect(avgScore.applications_covered).toBe(8);
    // (796 + 846 + 846 + 424 + 770 + 809 + 672 + 882) / 8 = 6045 / 8 = 755.6
    expect(avgScore.average_score).toBe(755.6);
    expect(avgScore.min_score).toBe(424);
    expect(avgScore.max_score).toBe(882);
    expect(avgScore.median_score).toBe(802.5); // (796 + 809) / 2

    // Blocked for customer role
    const custBlock = executeTool(
      'query_portfolio',
      { metric: 'average_score' },
      { role: 'customer', dbData }
    );
    expect(custBlock.error).toContain('Permission denied');
  });

  // 5. Staff Analytics Tool: get_recent_activity
  it('Analytics Tool 2: get_recent_activity returns per-day breakdown and counts; blocked for customer', () => {
    const act = executeTool('get_recent_activity', { days: 7 }, { role: 'approver', dbData });
    expect(act.error).toBeUndefined();
    expect(act.days).toBe(7);
    expect(Array.isArray(act.per_day)).toBe(true);
    expect(act.per_day.length).toBe(7);
    expect(typeof act.submitted).toBe('number');
    expect(typeof act.approved).toBe('number');
    expect(typeof act.rejected).toBe('number');
    expect(typeof act.cancelled).toBe('number');

    // Blocked for customer role
    const custBlock = executeTool('get_recent_activity', { days: 7 }, { role: 'customer', dbData });
    expect(custBlock.error).toContain('Permission denied');
  });

  // 6. Staff Analytics Tool: get_rejection_summary
  it('Analytics Tool 3: get_rejection_summary returns rejected count and top rejection reasons with counts; blocked for customer', () => {
    const rej = executeTool('get_rejection_summary', {}, { role: 'approver', dbData });
    expect(rej.error).toBeUndefined();
    expect(typeof rej.rejected_count).toBe('number');
    expect(Array.isArray(rej.top_rejection_reasons)).toBe(true);
    expect(rej.top_rejection_reasons.length).toBeGreaterThan(0);
    expect(rej.top_rejection_reasons[0].reason).toBeDefined();
    expect(typeof rej.top_rejection_reasons[0].count).toBe('number');

    // Blocked for customer role
    const custBlock = executeTool('get_rejection_summary', {}, { role: 'customer', dbData });
    expect(custBlock.error).toContain('Permission denied');
  });

  // 7. Staff Analytics Tool: list_pending
  it('Analytics Tool 4: list_pending returns pending applications with Application ID, name, days waiting, queue position; blocked for customer', () => {
    const pending = executeTool('list_pending', {}, { role: 'approver', dbData });
    expect(pending.error).toBeUndefined();
    expect(typeof pending.pending_count).toBe('number');
    expect(Array.isArray(pending.queue)).toBe(true);
    if (pending.queue.length > 0) {
      const first = pending.queue[0];
      expect(first.application_id).toContain('Application ID:');
      expect(first.name).toBeDefined();
      expect(typeof first.days_waiting).toBe('number');
      expect(first.queue_position).toBe(1);
    }

    // Blocked for customer role
    const custBlock = executeTool('list_pending', {}, { role: 'customer', dbData });
    expect(custBlock.error).toContain('Permission denied');
  });

  // 8. Analytics Tool: get_segment_info
  it('Analytics Tool 5: get_segment_info returns segment definitions; staff gets counts while customer gets definitions only without counts', () => {
    // Staff view: includes application counts
    const staffSeg = executeTool('get_segment_info', {}, { role: 'approver', dbData });
    expect(staffSeg.error).toBeUndefined();
    expect(staffSeg.segments.length).toBe(10);
    expect(typeof staffSeg.segments[0].application_count).toBe('number');

    // Customer view: blocked from counts
    const custSeg = executeTool('get_segment_info', {}, { role: 'customer', dbData });
    expect(custSeg.error).toBeUndefined();
    expect(custSeg.segments.length).toBe(10);
    expect(custSeg.segments[0].application_count).toBeUndefined();
    expect(custSeg.segments[0].story).toBeDefined();
    expect(custSeg.segments[0].limit_rule).toBeDefined();
  });

  // 9. Analytics Tool: list_emi_plans
  it('Analytics Tool 6: list_emi_plans returns tenures [3, 6, 9, 12], 0% rate, 0 fees from config for both roles', () => {
    const plans = executeTool('list_emi_plans', {}, { role: 'customer', dbData });
    expect(plans.error).toBeUndefined();
    expect(plans.tenures_months).toEqual([3, 6, 9, 12]);
    expect(plans.interest_rate).toContain('0%');
    expect(plans.fees_kz).toBe(0);
    expect(plans.down_payment).toContain('0%');
  });

  // 10. Amount Explanation Tool: explain_amount
  it('Amount Explanation Tool: explain_amount returns step-by-step numbers & rules; customer requires verification first', () => {
    const session = getOrCreateSession('session-test-exp', 'customer');

    // Customer not verified -> blocked
    const unverified = executeTool('explain_amount', { application_id: '10001' }, { role: 'customer', session, dbData });
    expect(unverified.error).toContain('verify your application first');

    // Customer verified -> gets full explanation
    session.verifiedApplicationId = 'app-seed-001';
    session.verifiedApplicationNo = 10001;

    const exp = executeTool('explain_amount', { application_id: '10001' }, { role: 'customer', session, dbData });
    expect(exp.error).toBeUndefined();
    expect(exp.application_id).toBe('Application ID: 10001');
    expect(exp.equipment.retail_price_kz).toBeDefined();
    expect(exp.equipment.down_payment_kz).toBe(0);
    expect(exp.equipment.financed_amount_kz).toBe(exp.equipment.retail_price_kz);
    expect(exp.emi_calculation.monthly_emi_kz).toBeDefined();
    expect(exp.emi_calculation.interest_rate).toBe('0%');
    expect(exp.emi_calculation.fees_kz).toBe(0);
    expect(exp.credit_limit_rules.approved_credit_limit_kz).toBeDefined();
    expect(exp.credit_limit_rules.limiting_rule_applied).toBeDefined();

    // Staff does not require verification
    const staffExp = executeTool('explain_amount', { application_id: '10003' }, { role: 'approver', session: null, dbData });
    expect(staffExp.error).toBeUndefined();
    expect(staffExp.application_id).toBe('Application ID: 10003');
  });

  // 11. Follow-up suggestions validation & extraction
  it('Requirement A: parseAndValidateSuggestions extracts <suggestions>, validates max 4, under 8 words, strips tag from text', () => {
    const rawAiResponse = `Your application is currently being reviewed by underwriting. We will complete the verification shortly.\n\n<suggestions>["Cancel my application", "How was my amount calculated?", "Give me a short summary", "What happens next?"]</suggestions>`;

    const parsed = parseAndValidateSuggestions(rawAiResponse, 'customer');
    expect(parsed.cleanedText).not.toContain('<suggestions>');
    expect(parsed.cleanedText).not.toContain('</suggestions>');
    expect(parsed.cleanedText).toContain('reviewed by underwriting');
    expect(parsed.suggestions).toEqual([
      'Cancel my application',
      'How was my amount calculated?',
      'Give me a short summary',
      'What happens next?',
    ]);
    expect(parsed.suggestions.length).toBeLessThanOrEqual(4);
    parsed.suggestions.forEach((s: string) => {
      expect(s.split(/\s+/).length).toBeLessThanOrEqual(8);
    });

    // Customer role filters out staff-only suggestions
    const staffLeaked = `Here is your reply.\n\n<suggestions>["Review audit log", "Override rejection reasons", "What happens next?"]</suggestions>`;
    const parsedCustomer = parseAndValidateSuggestions(staffLeaked, 'customer');
    expect(parsedCustomer.suggestions).not.toContain('Review audit log');
    expect(parsedCustomer.suggestions).not.toContain('Override rejection reasons');
  });

  // 12. Already Cancelled Notice & Confirmation Step
  it('Requirement A: Cancel stays confirm step; if already cancelled, says "You already cancelled this application."', async () => {
    const session = getOrCreateSession('session-test-cancel', 'customer');
    session.verifiedApplicationId = 'app-seed-001';
    session.verifiedApplicationNo = 10001;

    // First cancel request: offers confirmation button
    const cancelRes = await executeDeterministicConversation({
      message: 'Cancel my application',
      role: 'customer',
      session,
      dbData,
    });
    expect(cancelRes.text).toContain('Do you want to cancel your application?');
    expect(cancelRes.action_proposal?.type).toBe('cancel_application');

    // Simulate application is now cancelled
    const app = mockApplications.find((a) => a.applicationNo === 10001);
    if (app) app.status = 'cancelled';

    // Second cancel request: reports already cancelled
    const alreadyCancelledRes = await executeDeterministicConversation({
      message: 'Cancel my application',
      role: 'customer',
      session,
      dbData,
    });
    expect(alreadyCancelledRes.text).toContain('You already cancelled this application.');
    expect(alreadyCancelledRes.action_proposal).toBeUndefined();
  });

  // 13. Questions in any wording work in chat
  it('Requirement: Portfolio questions in any wording calculate exact numbers without hallucinating', async () => {
    const session = getOrCreateSession('session-staff-questions', 'approver');

    // "how many are above 700"
    const q1 = await executeDeterministicConversation({ message: 'how many are above 700', role: 'approver', session, dbData });
    expect(q1.text).toContain('6 application(s)');

    // "what is the average score"
    const q2 = await executeDeterministicConversation({ message: 'what is the average score', role: 'approver', session, dbData });
    expect(q2.text).toContain('755.6');
    expect(q2.text).toContain('8');

    // "what is pending"
    const q3 = await executeDeterministicConversation({ message: 'what is pending', role: 'approver', session, dbData });
    expect(q3.text).toContain('Pending Underwriting Queue');

    // "how many were rejected and why"
    const q4 = await executeDeterministicConversation({ message: 'how many were rejected and why', role: 'approver', session, dbData });
    expect(q4.text).toContain('Rejected');
    expect(q4.text).toContain('Top Rejection Grounds:');

    // "how are segments classified"
    const q5 = await executeDeterministicConversation({ message: 'how are segments classified', role: 'approver', session, dbData });
    expect(q5.text).toContain('Customer Segment Classification');

    // "which EMI plans are available"
    const q6 = await executeDeterministicConversation({ message: 'which EMI plans are available', role: 'approver', session, dbData });
    expect(q6.text).toContain('3, 6, 9, and 12 months');
    expect(q6.text).toContain('0%');

    // "which amount?"
    const q7 = await executeDeterministicConversation({ message: 'which amount?', role: 'customer', session, dbData });
    expect(q7.suggestions).toEqual(['Credit limit', 'Equipment price', 'Monthly EMI']);
  });
});
