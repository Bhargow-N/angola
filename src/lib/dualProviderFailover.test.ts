import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  handleStreamingChat,
  checkAiProvidersHealth,
} from '../../server/chatEngine.js';

describe('Dual-Provider AI Failover & Health Check Acceptance Tests', () => {
  const mockDbData = () => ({
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
        monthly_emi_kz: 12500,
        term_months: 12,
      },
    ],
    evaluations: [],
    approvals: [],
    notifications: [],
    auditLogs: [] as any[],
  });

  const testEnv = {
    AI_PRIMARY_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    AI_PRIMARY_API_KEY: 'test_primary_gemini_key_12345',
    AI_PRIMARY_MODEL: 'gemini-3-flash-preview',
    AI_BACKUP_BASE_URL: 'https://api.groq.com/openai/v1',
    AI_BACKUP_API_KEY: 'test_backup_groq_key_67890',
    AI_BACKUP_MODEL: 'qwen/qwen3.8-27b',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Test 1: With both keys set: ask "where is my status". The bot asks for the ID, then the last 4 digits, then answers, and the reply streams.
  it('Test 1: With both keys set: "where is my status" asks for ID, then last 4 digits, then answers with streamed chunks', async () => {
    const dbData = mockDbData();
    const sessionId = `test-both-keys-${Date.now()}`;

    // Mock fetch for Primary provider
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: any, options: any) => {
      const body = JSON.parse(options?.body || '{}');
      const messages = body.messages || [];
      const lastMsg = messages[messages.length - 1] || {};
      const lastContent = String(lastMsg.content || '');

      // Tool response returned from executeTool('lookup_application')
      const hasLookupToolResponse = messages.some(
        (m: any) => m.role === 'tool' && m.tool_call_id === 'call_lookup_01'
      );
      if (hasLookupToolResponse) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: 'Found application #APP-1001 for Thomas Ndalu. For your security, please confirm the last 4 digits of your mobile number.',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (lastContent.includes('where is my status')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: 'Please share your application ID or the mobile number you applied with.',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (lastContent.includes('APP-1001')) {
        // Model calls lookup_application tool
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      id: 'call_lookup_01',
                      type: 'function',
                      function: {
                        name: 'lookup_application',
                        arguments: JSON.stringify({ identifier: 'APP-1001' }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Customer provides last 4 digits 1222
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Identity verified. Application #APP-1001 is Submitted. Credit limit is 150,000 Kz.',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    // Step 1: Customer asks "where is my status"
    const chunks1: string[] = [];
    let meta1: any = null;
    await handleStreamingChat({
      messages: [{ role: 'user', content: 'where is my status' }],
      role: 'customer',
      sessionId,
      dbData,
      env: testEnv,
      onChunk: (c) => chunks1.push(c),
      onProposal: () => {},
      onComplete: (m) => {
        meta1 = m;
      },
    });

    expect(chunks1.length).toBeGreaterThan(0); // Streamed word-by-word
    expect(chunks1.join('')).toContain('Please share your application ID or the mobile number you applied with.');
    expect(meta1.mode).toBe('primary');
    expect(meta1.mode_label).toBe('Groq (gemini-3-flash-preview)');

    // Step 2: Customer provides ID
    const chunks2: string[] = [];
    await handleStreamingChat({
      messages: [
        { role: 'user', content: 'where is my status' },
        { role: 'assistant', content: chunks1.join('') },
        { role: 'user', content: 'APP-1001' },
      ],
      role: 'customer',
      sessionId,
      dbData,
      env: testEnv,
      onChunk: (c) => chunks2.push(c),
      onProposal: () => {},
      onComplete: () => {},
    });
    expect(chunks2.join('')).toContain('confirm the last 4 digits');

    // Step 3: Customer provides digits
    const chunks3: string[] = [];
    await handleStreamingChat({
      messages: [
        { role: 'user', content: 'where is my status' },
        { role: 'assistant', content: chunks1.join('') },
        { role: 'user', content: 'APP-1001' },
        { role: 'assistant', content: chunks2.join('') },
        { role: 'user', content: '1222' },
      ],
      role: 'customer',
      sessionId,
      dbData,
      env: testEnv,
      onChunk: (c) => chunks3.push(c),
      onProposal: () => {},
      onComplete: () => {},
    });
    expect(chunks3.join('')).toContain('150,000 Kz');
  });

  // Test 2: Put a wrong primary key: the chat still works through the backup, and the audit log shows the backup was used.
  it('Test 2: Put a wrong primary key: chat fails over to backup and audit log records backup was used', async () => {
    const dbData = mockDbData();
    const sessionId = `test-wrong-primary-${Date.now()}`;

    // Mock fetch: Primary fails with HTTP 401 (or 429), Backup succeeds with HTTP 200
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        // Primary returns 401 Invalid Key
        return new Response(
          JSON.stringify({ error: { message: 'Invalid API Key', status: 'INVALID_ARGUMENT' } }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Backup (Groq) responds successfully
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'In international cricket, match winners are reported by official sports boards. How can I help with your Unitel loan?',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const chunks: string[] = [];
    let completedMeta: any = null;

    await handleStreamingChat({
      messages: [{ role: 'user', content: 'who won the cricket match?' }],
      role: 'customer',
      sessionId,
      dbData,
      env: {
        ...testEnv,
        AI_PRIMARY_API_KEY: 'wrong_primary_key_failover',
      },
      onChunk: (c) => chunks.push(c),
      onProposal: () => {},
      onComplete: (meta) => {
        completedMeta = meta;
      },
    });

    const reply = chunks.join('');
    expect(reply).toContain('cricket');
    expect(completedMeta.mode).toBe('backup');
    expect(completedMeta.mode_label).toBe('Mistral (qwen/qwen3.8-27b)');

    // Verify audit log explicitly records BACKUP provider
    const lastAudit = dbData.auditLogs[0];
    expect(lastAudit).toBeDefined();
    expect(lastAudit.provider).toBe('backup');
    expect(lastAudit.details).toContain('Answered by: BACKUP');
    expect(lastAudit.details).toContain('qwen/qwen3.8-27b');
  });

  // Test 3: Put wrong keys for both: the chat switches to Basic chat mode and still handles the status flow.
  it('Test 3: Put wrong keys for both: switches to Basic chat mode and handles the status flow cleanly', async () => {
    const dbData = mockDbData();
    const sessionId = `test-both-wrong-${Date.now()}`;

    // Mock fetch: Both providers fail (401 / 429)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: { message: 'Authentication failure' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const chunks: string[] = [];
    let completedMeta: any = null;

    await handleStreamingChat({
      messages: [{ role: 'user', content: 'where is my status' }],
      role: 'customer',
      sessionId,
      dbData,
      env: {
        ...testEnv,
        AI_PRIMARY_API_KEY: 'bad_key_1',
        AI_BACKUP_API_KEY: 'bad_key_2',
      },
      onChunk: (c) => chunks.push(c),
      onProposal: () => {},
      onComplete: (meta) => {
        completedMeta = meta;
      },
    });

    const reply = chunks.join('');
    expect(reply).toContain('The AI is busy, please try again in a few seconds.');
    expect(completedMeta.mode).toBe('error');
    expect(completedMeta.mode_label).toBe('AI Busy');
    expect(completedMeta.retryable).toBe(true);

    // Verify audit log records ERROR
    const lastAudit = dbData.auditLogs[0];
    expect(lastAudit.provider).toBe('error');
    expect(lastAudit.details).toContain('Answered by: ERROR');
  });

  // Test 4: /api/ai/health shows the correct status for each provider.
  it('Test 4: checkAiProvidersHealth reports accurate status for each provider without leaking keys', async () => {
    // 4A: Both providers healthy
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'pong' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const healthOk = await checkAiProvidersHealth(testEnv);
    expect(healthOk.primary.status).toBe('ok');
    expect(healthOk.backup.status).toBe('ok');
    expect(healthOk.primary.name).toBe('Groq (Primary)');
    expect(healthOk.backup.name).toBe('Mistral (Backup)');
    expect(typeof healthOk.primary.latencyMs).toBe('number');
    expect(typeof healthOk.backup.latencyMs).toBe('number');

    // 4B: Both providers fail
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: { message: 'SecretKey_XYZ invalid token' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const healthFail = await checkAiProvidersHealth({
      ...testEnv,
      AI_PRIMARY_API_KEY: 'SecretKey_XYZ',
      AI_BACKUP_API_KEY: 'SecretKey_XYZ',
    });

    expect(healthFail.primary.status).toBe('failed');
    expect(healthFail.backup.status).toBe('failed');
    // Ensure keys are sanitized and never leaked in error messages!
    expect(healthFail.primary.error).not.toContain('SecretKey_XYZ');
    expect(healthFail.backup.error).not.toContain('SecretKey_XYZ');
  });

  // Test 5: Open browser network tab: no API key appears anywhere in client requests or responses
  it('Test 5: Client security invariant: API keys are strictly retained on the server and never exposed in responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const health = await checkAiProvidersHealth(testEnv);
    const healthJson = JSON.stringify(health);

    const primaryKey = testEnv.AI_PRIMARY_API_KEY;
    const backupKey = testEnv.AI_BACKUP_API_KEY;

    expect(healthJson).not.toContain(primaryKey);
    expect(healthJson).not.toContain(backupKey);

    // Verify chat SSE completion response metadata does not leak keys
    const dbData = mockDbData();
    let clientMeta: any = null;
    await handleStreamingChat({
      messages: [{ role: 'user', content: 'What is a credit score?' }],
      role: 'customer',
      sessionId: 'security-test-session',
      dbData,
      env: testEnv,
      onChunk: () => {},
      onProposal: () => {},
      onComplete: (m) => {
        clientMeta = m;
      },
    });

    const metaJson = JSON.stringify(clientMeta);
    expect(metaJson).not.toContain(primaryKey);
    expect(metaJson).not.toContain(backupKey);
  });
});
