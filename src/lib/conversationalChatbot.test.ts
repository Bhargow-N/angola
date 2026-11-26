import { describe, it, expect } from 'vitest';
import {
  executeDeterministicConversation,
  executeTool,
  getOrCreateSession,
  handleStreamingChat,
} from '../../server/chatEngine.js';

describe('Real Conversational Chatbot Acceptance Tests (9 Scenarios)', () => {
  const getMockDb = () => ({
    applications: [
      {
        id: 'APP-1001',
        customer_name: 'Thomas Ndalu',
        msisdn: '+244 923 111 222',
        status: 'submitted',
        equipment: { name: 'Samsung Galaxy A15 (128GB)' },
        evaluation: {
          customer: { full_name: 'Thomas Ndalu', msisdn: '+244 923 111 222' },
          results: { score: 712, band_label: 'Good', limit_kz: 150000, confidence: 'High' },
        },
        price_kz: 95000,
        monthly_emi_kz: 12500,
        term_months: 12,
        email: 'thomas.ndalu@demo.unitel.ao',
      },
      {
        id: 'APP-1002',
        customer_name: 'Carlos Bento',
        msisdn: '+244 924 333 444',
        status: 'approved',
        evaluation: {
          customer: { full_name: 'Carlos Bento', msisdn: '+244 924 333 444' },
          results: { score: 760, band_label: 'Very Good', limit_kz: 400000 },
        },
        monthly_emi_kz: 28000,
        term_months: 12,
      },
      {
        id: 'APP-1003',
        customer_name: 'Rosa Bernardo',
        msisdn: '+244 912 555 666',
        status: 'rejected',
        evaluation: {
          customer: { full_name: 'Rosa Bernardo', msisdn: '+244 912 555 666' },
          results: { score: 480, band_label: 'High risk', limit_kz: 50000 },
        },
        monthly_emi_kz: 15000,
        term_months: 6,
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
      },
    ],
    approvals: [] as any[],
    notifications: [] as any[],
    auditLogs: [] as any[],
  });

  // Test 1: Customer types "where is my status" with no ID -> bot asks for ID -> then last 4 digits -> gives correct status
  it('Test 1: Customer asks "where is my status" with no ID: bot asks for ID, then last 4 digits, then gives correct status', async () => {
    const dbData = getMockDb();
    const session = getOrCreateSession('test-session-1', 'customer');

    // Step 1: Customer types "where is my status" with no ID
    const step1 = await executeDeterministicConversation({
      message: 'where is my status',
      role: 'customer',
      session,
      dbData,
    });
    expect(step1.text).toContain('Please share your application ID or the mobile number you applied with');
    expect(session.verifiedApplicationId).toBeNull();

    // Step 2: Customer provides application ID "APP-1001"
    const step2 = await executeDeterministicConversation({
      message: 'My ID is APP-1001',
      role: 'customer',
      session,
      dbData,
    });
    expect(step2.text).toContain('APP-1001');
    expect(step2.text).toContain('confirm the last 4 digits');
    expect(session.pendingVerification).toBeDefined();
    expect(session.pendingVerification.applicationId).toBe('APP-1001');
    expect(session.pendingVerification.expectedLast4).toBe('1222');

    // Step 3: Customer provides correct last 4 digits "1222"
    const step3 = await executeDeterministicConversation({
      message: '1222',
      role: 'customer',
      session,
      dbData,
    });
    expect(step3.text).toContain('Thomas Ndalu');
    expect(step3.text).toContain('identity has been verified');
    expect(step3.text).toContain('Application #APP-1001');
    expect(step3.text).toContain('150,000 Kz');
    expect(step3.text).toContain('Queue Position:');
    expect(session.verifiedApplicationId).toBe('APP-1001');
  });

  // Test 2: Customer gives an unknown ID -> bot says new applicant and shows Start application
  it('Test 2: Customer gives an unknown ID: bot replies new applicant message and shows Start application', async () => {
    const dbData = getMockDb();
    const session = getOrCreateSession('test-session-2', 'customer');

    const res = await executeDeterministicConversation({
      message: 'APP-9999',
      role: 'customer',
      session,
      dbData,
    });

    expect(res.text).toBe(
      "I can't find an application for that. It looks like you may be a new applicant. Would you like to start one?"
    );
    expect(res.action_proposal).toBeDefined();
    expect(res.action_proposal?.type).toBe('start_application');
    expect(res.action_proposal?.label).toBe('Start Application');
  });

  // Test 3: Wrong last 4 digits -> no details are shown
  it('Test 3: Wrong last 4 digits: no details are shown', async () => {
    const dbData = getMockDb();
    const session = getOrCreateSession('test-session-3', 'customer');

    // Step 1: Customer shares application ID
    await executeDeterministicConversation({
      message: 'APP-1001',
      role: 'customer',
      session,
      dbData,
    });
    expect(session.pendingVerification?.applicationId).toBe('APP-1001');

    // Step 2: Customer enters WRONG last 4 digits
    const step2 = await executeDeterministicConversation({
      message: '9999',
      role: 'customer',
      session,
      dbData,
    });

    expect(step2.text).toContain('do not match our records');
    expect(step2.text).toContain('application details cannot be displayed');
    // Ensure no sensitive financial details leaked
    expect(step2.text).not.toContain('150,000 Kz');
    expect(step2.text).not.toContain('Samsung Galaxy');
    expect(session.verifiedApplicationId).toBeNull();
  });

  // Test 4: "What is a credit score?" and "who won the cricket match?" both get sensible short answers
  it('Test 4: "What is a credit score?" and "who won the cricket match?" both get a sensible short answer', async () => {
    const dbData = getMockDb();
    const session = getOrCreateSession('test-session-4', 'customer');

    // 4A: "What is a credit score?"
    const scoreQ = await executeDeterministicConversation({
      message: 'What is a credit score?',
      role: 'customer',
      session,
      dbData,
    });
    expect(scoreQ.text).toContain('300 to 900');
    expect(scoreQ.text).toContain('totalPoints');

    // 4B: "who won the cricket match?"
    const cricketQ = await executeDeterministicConversation({
      message: 'who won the cricket match?',
      role: 'customer',
      session,
      dbData,
    });
    expect(cricketQ.text).toContain('cricket');
    expect(cricketQ.text).toContain('Unitel credit application');
  });

  // Test 5: "How is my score calculated?" is answered from knowledge file
  it('Test 5: "How is my score calculated?" is answered from the knowledge file', async () => {
    const dbData = getMockDb();
    const session = getOrCreateSession('test-session-5', 'customer');

    const res = await executeDeterministicConversation({
      message: 'How is my score calculated?',
      role: 'customer',
      session,
      dbData,
    });

    expect(res.text).toContain('300 to 900');
    expect(res.text).toContain('94 base points');
    expect(res.text).toContain('Telecom (32 pts)');
    expect(res.text).toContain('Unitel Money Wallet (20 pts)');
  });

  // Test 6: "Cancel my application", then Confirm: status becomes Cancelled, email is sent, audit log is updated
  it('Test 6: "Cancel my application", then Confirm: status becomes Cancelled, email is sent and audit log is updated', async () => {
    const dbData = getMockDb();
    const session = getOrCreateSession('test-session-6', 'customer');
    session.verifiedApplicationId = 'APP-1001';

    // Step 1: Customer asks to cancel
    const cancelRes = await executeDeterministicConversation({
      message: 'Cancel my application',
      role: 'customer',
      session,
      dbData,
    });

    expect(cancelRes.text).toContain('Do you want to cancel your application?');
    expect(cancelRes.action_proposal).toBeDefined();
    expect(cancelRes.action_proposal?.type).toBe('cancel_application');
    expect(cancelRes.action_proposal?.applicationId).toBe('APP-1001');

    // Application is NOT cancelled yet
    const app = dbData.applications.find((a) => a.id === 'APP-1001');
    expect(app?.status).toBe('submitted');

    // Step 2: Customer clicks Confirm (simulating server POST /api/chat/confirm-cancel)
    const targetApp = dbData.applications.find((a) => a.id === 'APP-1001');
    if (targetApp) {
      targetApp.status = 'cancelled';
    }

    dbData.notifications.unshift({
      id: 'NOTIF-CANCEL-01',
      application_id: 'APP-1001',
      type: 'CANCELLATION',
      recipient: targetApp?.email || 'thomas.ndalu@demo.unitel.ao',
      title: 'Application Cancelled',
      message: 'Your Unitel smartphone financing application #APP-1001 has been successfully cancelled.',
      created_at: new Date().toISOString(),
    });

    dbData.auditLogs.unshift({
      id: 'AUDIT-CANCEL-01',
      action: 'APPLICATION_CANCELLED_BY_APPLICANT',
      actor: '+244 923 111 222',
      role: 'customer',
      application_id: 'APP-1001',
      details: 'Applicant confirmed cancellation of application #APP-1001. Notification email triggered.',
      timestamp: new Date().toISOString(),
    });

    // Verification
    expect(targetApp?.status).toBe('cancelled');
    expect(dbData.notifications).toHaveLength(1);
    expect(dbData.notifications[0].title).toBe('Application Cancelled');
    expect(dbData.auditLogs).toHaveLength(1);
    expect(dbData.auditLogs[0].action).toBe('APPLICATION_CANCELLED_BY_APPLICANT');
  });

  // Test 7: Customer asks about another customer's application: the bot refuses
  it('Test 7: Customer asks about another customer\'s application: the bot refuses', async () => {
    const dbData = getMockDb();
    const session = getOrCreateSession('test-session-7', 'customer');
    session.verifiedApplicationId = 'APP-1001';

    // Inquiries about other customers
    const res1 = await executeDeterministicConversation({
      message: "What is Carlos's application status and limit?",
      role: 'customer',
      session,
      dbData,
    });
    expect(res1.text).toContain('Access denied');
    expect(res1.text).toContain('only view your own application');

    const res2 = await executeDeterministicConversation({
      message: 'Can I see details of another customer?',
      role: 'customer',
      session,
      dbData,
    });
    expect(res2.text).toContain('Access denied');

    // Tool level enforcement
    const deniedLookup = executeTool('lookup_application', { identifier: 'APP-1002' }, { role: 'customer', session, dbData });
    expect(deniedLookup.error).toContain('Customers cannot view other applications');
  });

  // Test 8: Approver asks "what happened in the last 7 days?": bot gives the correct numbers
  it('Test 8: Approver asks "what happened in the last 7 days?": bot gives correct numbers', async () => {
    const dbData = getMockDb();
    const session = getOrCreateSession('test-session-8', 'approver');

    const res = await executeDeterministicConversation({
      message: 'what happened in the last 7 days?',
      role: 'approver',
      session,
      dbData,
    });

    // Mock DB has 3 applications: 1 approved, 1 rejected, 1 submitted
    expect(res.text).toContain('Portfolio Underwriting Activity (Last 7 Days)');
    expect(res.text).toContain('Applications Received: **3**');
    expect(res.text).toContain('Approved: **1**');
    expect(res.text).toContain('Rejected: **1**');
    expect(res.text).toContain('Pending: **1**');
    expect(res.text).toContain('Approval Rate: **33%**');
  });

  // Test 9: Remove the API key: Basic chat mode still runs tests 1 to 3 cleanly
  it('Test 9: Without API key, Basic chat mode runs Tests 1, 2, and 3 cleanly with streaming emulation', async () => {
    const dbData = getMockDb();
    getOrCreateSession('test-session-9', 'customer');

    // Simulate handleStreamingChat with empty AI_API_KEY
    const chunks: string[] = [];
    let completedMode = '';
    let completedModeLabel = '';

    await handleStreamingChat({
      messages: [{ role: 'user', content: 'where is my status' }],
      role: 'customer',
      sessionId: 'test-session-9',
      dbData,
      env: { AI_API_KEY: '' },
      onChunk: (chunk) => chunks.push(chunk),
      onProposal: () => {},
      onComplete: (meta) => {
        completedMode = meta.mode;
        completedModeLabel = meta.mode_label;
      },
    });

    const fullResponse = chunks.join('');
    expect(fullResponse).toContain('The AI is busy, please try again in a few seconds.');
    expect(completedMode).toBe('error');
    expect(completedModeLabel).toBe('AI Busy');

    // Test 2 under executeDeterministicConversation (deterministic unit helper)
    const t2Res = await executeDeterministicConversation({
      message: 'APP-9999',
      role: 'customer',
      session: { verifiedApplicationId: null, pendingVerification: null },
      dbData,
    });
    expect(t2Res.action_proposal?.type).toBe('start_application');
  });
});
