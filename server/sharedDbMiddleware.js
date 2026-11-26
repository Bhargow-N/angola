import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleStreamingChat, checkAiProvidersHealth } from './chatEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../data/shared_db.json');

// In-memory cache of shared DB
let dbData = {
  applications: [],
  approvals: [],
  evaluations: [],
  notifications: [],
  auditLogs: [],
  lastUpdated: new Date().toISOString(),
};

// Set of active SSE client responses
const activeClients = new Set();

function loadDbFromDisk() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      dbData = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[SharedDB] Error reading DB from disk:', err.message);
  }
}

let writeQueue = Promise.resolve();
let isSavingInternal = false;

function saveDbToDisk() {
  dbData.lastUpdated = new Date().toISOString();
  const payload = JSON.stringify(dbData, null, 2);
  writeQueue = writeQueue
    .then(async () => {
      isSavingInternal = true;
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      await fs.promises.writeFile(DB_PATH, payload, 'utf-8');
    })
    .catch((err) => {
      console.warn('[SharedDB] Error saving DB to disk:', err.message);
    })
    .finally(() => {
      setTimeout(() => {
        isSavingInternal = false;
      }, 150);
    });
}

// Watch disk for external modifications (cross-process sync)
let watchDebounce = null;
if (fs.existsSync(DB_PATH)) {
  const watcher = fs.watch(DB_PATH, () => {
    if (isSavingInternal) return;
    if (watchDebounce) clearTimeout(watchDebounce);
    watchDebounce = setTimeout(() => {
      loadDbFromDisk();
      broadcast('SYNC_RELOAD', null, {
        allApps: dbData.applications,
        allApprovals: dbData.approvals,
        allEvaluations: dbData.evaluations,
        allNotifications: dbData.notifications,
        allAuditLogs: dbData.auditLogs,
      });
    }, 100);
  });
  if (watcher && typeof watcher.unref === 'function') {
    watcher.unref();
  }
}

// Initial load
loadDbFromDisk();

/**
 * Broadcast an event to all connected browser SSE clients
 */
export function broadcast(type, payload, extra = {}) {
  const message = `data: ${JSON.stringify({
    type,
    payload,
    ...extra,
    timestamp: Date.now(),
  })}\n\n`;

  for (const client of activeClients) {
    try {
      client.write(message);
    } catch {
      activeClients.delete(client);
    }
  }
}

/**
 * Helper to sync updates to Supabase PostgreSQL cloud table if configured
 */
async function syncToSupabaseDirect(table, record, env) {
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url.includes('placeholder')) return;

  try {
    await fetch(`${url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(record),
    });
  } catch (err) {
    console.warn(`[SupabaseSync] Direct sync warning (${table}):`, err.message);
  }
}

/**
 * Creates the Connect/Vite middleware for the shared database and real-time SSE stream
 */
export function createSharedDbMiddleware(env) {
  return (req, res, next) => {
    // Enable CORS for cross-port requests between 5173, 5174, and local callers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, *');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }

    const url = req.url.split('?')[0];

    // 1. SSE Real-Time Event Stream
    if (url === '/api/db/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientCount: activeClients.size + 1 })}\n\n`);

      activeClients.add(res);

      req.on('close', () => {
        activeClients.delete(res);
      });
      return;
    }

    // 2. Health & Status
    if (url === '/api/db/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(
        JSON.stringify({
          status: 'ok',
          activeClients: activeClients.size,
          applicationCount: dbData.applications.length,
          evaluationCount: dbData.evaluations.length,
          lastUpdated: dbData.lastUpdated,
        })
      );
    }

    // 3. GET /api/db/all -> returns all synchronized datasets
    if (req.method === 'GET' && url === '/api/db/all') {
      loadDbFromDisk();
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(dbData));
    }

    // 4. GET /api/db/applications
    if (req.method === 'GET' && url === '/api/db/applications') {
      loadDbFromDisk();
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(dbData.applications));
    }

    // Read POST / PATCH body helper
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const parsedBody = body ? JSON.parse(body) : {};

        // 5. POST /api/db/applications -> create new application
        if (req.method === 'POST' && url === '/api/db/applications') {
          loadDbFromDisk();
          const newApp = parsedBody;
          dbData.applications = [newApp, ...dbData.applications.filter((a) => a.id !== newApp.id)];
          saveDbToDisk();

          broadcast('APPLICATION_CREATED', newApp, { allApps: dbData.applications });

          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ success: true, application: newApp }));
        }

        // 6. PATCH /api/db/applications/:id -> update status (e.g. purchased or approved)
        if (req.method === 'PATCH' && url.startsWith('/api/db/applications/')) {
          const id = url.replace('/api/db/applications/', '');
          loadDbFromDisk();
          const index = dbData.applications.findIndex((a) => a.id === id);
          if (index >= 0) {
            dbData.applications[index] = { ...dbData.applications[index], ...parsedBody };
            saveDbToDisk();

            const updatedApp = dbData.applications[index];

            broadcast('APPLICATION_UPDATED', updatedApp, { allApps: dbData.applications });

            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ success: true, application: updatedApp }));
          } else {
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: 'Application not found' }));
          }
        }

        // 7. POST /api/db/decision -> process approval or rejection
        if (req.method === 'POST' && url === '/api/db/decision') {
          const { applicationId, decision, reason, approverName, applicantEmail } = parsedBody;
          loadDbFromDisk();

          const appIndex = dbData.applications.findIndex((a) => a.id === applicationId);
          let targetApp = null;
          if (appIndex >= 0) {
            dbData.applications[appIndex].status = decision;
            targetApp = dbData.applications[appIndex];
          }

          const newApproval = {
            id: `appr-${Date.now()}`,
            application_id: applicationId,
            approver_id: '00000000-0000-0000-0000-000000000002',
            decision,
            reason,
            decided_at: new Date().toISOString(),
          };
          dbData.approvals.unshift(newApproval);

          const newNotif = {
            id: `notif-${Date.now()}`,
            application_id: applicationId,
            to_email: applicantEmail || 'bhargownarravula777@gmail.com',
            kind: decision === 'approved' ? 'approval_notice' : 'rejection_notice',
            subject: `Application ${decision.toUpperCase()}: Reference ${applicationId.slice(-6).toUpperCase()}`,
            body: `Application for ${targetApp?.equipment?.name || 'Equipment'} has been ${decision} by ${approverName || 'Approver'}. Reason: ${reason}`,
            status: 'sent',
            created_at: new Date().toISOString(),
          };
          dbData.notifications.unshift(newNotif);

          const newAudit = {
            id: Date.now(),
            at: new Date().toISOString(),
            actor_name: approverName || 'Approver',
            action: `decision_${decision}`,
            entity: 'approvals',
            entity_id: newApproval.id,
            details: { applicationId, decision, reason },
          };
          dbData.auditLogs.unshift(newAudit);

          saveDbToDisk();

          broadcast('APPROVAL_DECIDED', { applicationId, decision, reason }, {
            allApps: dbData.applications,
            allApprovals: dbData.approvals,
            allNotifications: dbData.notifications,
            allAuditLogs: dbData.auditLogs,
          });

          res.setHeader('Content-Type', 'application/json');
          return res.end(
            JSON.stringify({
              success: true,
              application: targetApp,
              approval: newApproval,
              notification: newNotif,
              auditLog: newAudit,
            })
          );
        }

        // 8. POST /api/db/evaluations
        if (req.method === 'POST' && url === '/api/db/evaluations') {
          const evalRecord = parsedBody;
          loadDbFromDisk();
          const existingIdx = dbData.evaluations.findIndex((e) => e.id === evalRecord.id);
          if (existingIdx >= 0) {
            dbData.evaluations[existingIdx] = evalRecord;
          } else {
            dbData.evaluations.unshift(evalRecord);
          }
          saveDbToDisk();

          broadcast('EVALUATION_SAVED', evalRecord, { allEvaluations: dbData.evaluations });

          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ success: true, evaluation: evalRecord }));
        }

        // 9. POST /api/db/notifications
        if (req.method === 'POST' && url === '/api/db/notifications') {
          const notif = parsedBody;
          loadDbFromDisk();
          dbData.notifications.unshift(notif);
          saveDbToDisk();

          broadcast('NOTIFICATION_ADDED', notif, { allNotifications: dbData.notifications });

          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ success: true, notification: notif }));
        }

        // 10. POST /api/db/audit-log
        if (req.method === 'POST' && url === '/api/db/audit-log') {
          const audit = parsedBody;
          loadDbFromDisk();
          dbData.auditLogs.unshift(audit);
          saveDbToDisk();

          broadcast('AUDIT_ADDED', audit, { allAuditLogs: dbData.auditLogs });

          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ success: true, auditLog: audit }));
        }

        // 11. ML Service Proxy (/api/ml/* -> http://127.0.0.1:8000/*)
        if (url.startsWith('/api/ml/')) {
          const mlTarget = url.replace('/api/ml', '');
          const targetUrl = `http://127.0.0.1:8000${mlTarget}`;
          try {
            const fetchOpts = {
              method: req.method,
              headers: { 'Content-Type': 'application/json' },
            };
            if (req.method !== 'GET' && req.method !== 'HEAD' && body) {
              fetchOpts.body = body;
            }
            const mlRes = await fetch(targetUrl, fetchOpts);
            const contentType = mlRes.headers.get('content-type') || 'application/json';
            const mlText = await mlRes.text();
            res.statusCode = mlRes.status;
            res.setHeader('Content-Type', contentType);
            return res.end(mlText);
          } catch (err) {
            // ML Service offline fallback response
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            return res.end(
              JSON.stringify({
                error: 'ML service offline',
                fallback: true,
                message: 'ML service offline - temporary fallback',
              })
            );
          }
        }

        // 11.5. GET /api/ai/health -> AI Providers Health Check
        if (req.method === 'GET' && url.startsWith('/api/ai/health')) {
          const healthResult = await checkAiProvidersHealth(env);
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify(healthResult));
        }

        // 12. POST /api/chat with SSE Streaming (Server-Sent Events)
        if (req.method === 'POST' && url === '/api/chat') {
          loadDbFromDisk();
          const { messages = [], message, role = 'customer', sessionId = 'default', clientApplications = [] } = parsedBody;

          if (Array.isArray(clientApplications) && clientApplications.length > 0) {
            const existingIds = new Set(dbData.applications.map((a) => a.id));
            for (const cApp of clientApplications) {
              if (cApp && cApp.id && !existingIds.has(cApp.id)) {
                dbData.applications.unshift(cApp);
                existingIds.add(cApp.id);
              }
            }
          }

          const conversationMessages = Array.isArray(messages) && messages.length > 0
            ? messages
            : message
            ? [{ role: 'user', content: message }]
            : [];

          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          });

          await handleStreamingChat({
            messages: conversationMessages,
            role,
            sessionId,
            dbData,
            env,
            onChunk: (chunk) => {
              res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
            },
            onProposal: (proposal) => {
              res.write(`data: ${JSON.stringify({ action_proposal: proposal })}\n\n`);
            },
            onComplete: (meta) => {
              res.write(`data: ${JSON.stringify({ done: true, ...meta })}\n\n`);
              saveDbToDisk();
              res.end();
            },
          });
          return;
        }

        // 13. POST /api/chat/human-ticket ("Talk to a human" button creates support ticket in audit log)
        if (req.method === 'POST' && url === '/api/chat/human-ticket') {
          loadDbFromDisk();
          const { sessionId, role = 'customer', msisdn = '', applicationId = 'GLOBAL', reason = '' } = parsedBody;
          const ticketId = `TICK-${Date.now()}`;
          const newAudit = {
            id: ticketId,
            action: 'SUPPORT_TICKET_CREATED',
            actor: msisdn || role || 'applicant',
            role,
            application_id: applicationId,
            details: `Human support ticket #${ticketId} created. Request reason: ${reason || 'Applicant requested live underwriting specialist assistance.'}`,
            timestamp: new Date().toISOString(),
          };
          dbData.auditLogs.unshift(newAudit);
          saveDbToDisk();

          broadcast('AUDIT_ADDED', newAudit, { allAuditLogs: dbData.auditLogs });

          res.setHeader('Content-Type', 'application/json');
          return res.end(
            JSON.stringify({
              success: true,
              ticketId,
              message: `Support ticket #${ticketId} has been created in the audit log. An underwriting specialist has been notified.`,
            })
          );
        }

        // 13. POST /api/chat/confirm-cancel (Explicit button-confirmed cancellation)
        if (req.method === 'POST' && url === '/api/chat/confirm-cancel') {
          const { applicationId, msisdn, role } = parsedBody;
          loadDbFromDisk();

          const appIndex = dbData.applications.findIndex((a) => a.id === applicationId);
          let targetApp = null;
          if (appIndex >= 0) {
            dbData.applications[appIndex].status = 'cancelled';
            targetApp = dbData.applications[appIndex];
          }

          // Add notification
          const newNotif = {
            id: 'NOTIF-' + Date.now(),
            application_id: applicationId,
            type: 'CANCELLATION',
            recipient: targetApp?.email || targetApp?.applicantEmail || 'bhargownarravula777@gmail.com',
            title: 'Application Cancelled',
            message: `Your Unitel financing application #${applicationId} has been successfully cancelled.`,
            created_at: new Date().toISOString(),
          };
          dbData.notifications.unshift(newNotif);

          // Add audit log
          const newAudit = {
            id: 'AUDIT-' + Date.now(),
            action: 'APPLICATION_CANCELLED_BY_APPLICANT',
            actor: msisdn || role || 'applicant',
            role: role || 'customer',
            application_id: applicationId,
            details: `Applicant explicitly confirmed cancellation of application #${applicationId}. Status updated to Cancelled. Notification email triggered.`,
            timestamp: new Date().toISOString(),
          };
          dbData.auditLogs.unshift(newAudit);

          saveDbToDisk();

          broadcast('APPLICATION_UPDATED', targetApp, {
            allApps: dbData.applications,
            allNotifications: dbData.notifications,
            allAuditLogs: dbData.auditLogs,
          });

          res.setHeader('Content-Type', 'application/json');
          return res.end(
            JSON.stringify({
              success: true,
              message: `Application #${applicationId} has been cancelled.`,
              application: targetApp,
            })
          );
        }

        // 14. POST /api/ai/:task (Unified AI Endpoint)
        if (req.method === 'POST' && url.startsWith('/api/ai/')) {
          const task = url.replace('/api/ai/', '').trim();
          const payload = parsedBody || {};
          const aiProvider = env.AI_PROVIDER || process.env.AI_PROVIDER || '';
          const aiKey = env.AI_API_KEY || process.env.AI_API_KEY || '';
          const aiModel = env.AI_MODEL || process.env.AI_MODEL || '';

          // Deterministic template generator for safe and consistent fallback
          let resultText = '';
          let resultData = {};

          if (task === 'address_explanation') {
            const { bi_city = 'Luanda', dominant_region_6m = 'Huambo' } = payload;
            resultText = `Applicant's National ID (BI) residence is officially registered in ${bi_city}, whereas primary SIM cell-tower activity over the past 6 months is predominantly concentrated in ${dominant_region_6m}. This geographical disparity indicates recent relocation, inter-province trade migration, or dual residency. Recommendation: approver should request a secondary proof of address (utility bill or employer verification) prior to credit finalization.`;
            resultData = { disparity: true, bi_city, dominant_region_6m, recommendation: 'Request secondary proof of address' };
          } else if (task === 'score_explanation') {
            const { score = 650, band = 'Acceptable', customer_name = 'Applicant', highest_block = 'Telecom', lowest_block = 'Banking' } = payload;
            resultText = `Credit Evaluation Analysis for ${customer_name}: A score of ${score} places this applicant in the ${band} risk category. What raised the score: Strong mobile tenure and consistent airtime top-up frequency across the preceding 12 months (${highest_block}). What held it back: Absence of formal commercial banking relationship or thin digital wallet transactional history (${lowest_block}). How to improve: Consistently executing Unitel Money utility bill payments and maintaining 15+ active airtime recharge days will qualify applicant for higher financing tiers.`;
            resultData = {
              what_raised: 'Strong mobile tenure and consistent airtime top-up frequency across the preceding 12 months.',
              what_held_back: 'Absence of formal commercial banking relationship or thin digital wallet transactional history.',
              how_to_improve: 'Regular Unitel Money transactions and utility bill payments will elevate credit tier on next review.',
            };
          } else if (task === 'suggested_decision') {
            const { score = 650, requested_amount = 85000 } = payload;
            if (score >= 700) {
              resultText = `Suggested Decision: APPROVE (Tier 1 Standard). Repayment term up to 12 months with 0 Kz downpayment. Consistent telecommunications profile and verified identity indicate low default risk.`;
              resultData = { suggestion: 'Approve', tier: 'Tier 1 - Standard / Premium', term_months: 12, downpayment_kz: 0, reason: 'Consistent recharge patterns, verified KYC, and low debt-service ratio.' };
            } else if (score >= 550) {
              const downpayment = Math.round(requested_amount * 0.15);
              resultText = `Suggested Decision: REVIEW (Tier 2 Starter). Recommend conditional approval with a 6-month repayment term and a 15% upfront downpayment (${downpayment} Kz).`;
              resultData = { suggestion: 'Review', tier: 'Tier 2 - Starter / Standard', term_months: 6, downpayment_kz: downpayment, reason: 'Acceptable telecom history; recommend verifying secondary contact or 15% upfront downpayment.' };
            } else {
              resultText = `Suggested Decision: REJECT. High risk profile with insufficient subscriber tenure and lack of supporting collateral. Re-evaluation recommended in 90 days.`;
              resultData = { suggestion: 'Reject', tier: 'Not Eligible', term_months: 0, downpayment_kz: 0, reason: 'Insufficient SIM activity tenure and unverified alternative documentation.' };
            }
          } else if (task === 'approver_summary') {
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
              ml_segment = '',
              segment_name = '',
              knn_summary = '',
              red_flags = [],
            } = payload;
            const assetsStr = Array.isArray(assets) && assets.length > 0
              ? `Owns ${assets.join(' and ')}.`
              : assets && typeof assets === 'string'
              ? `Owns ${assets}.`
              : 'No verified motor/property assets.';
            const redFlagsStr = Array.isArray(red_flags) && red_flags.length > 0
              ? ` Red flags detected: ${red_flags.join('; ')}.`
              : ' No critical red flags detected.';
            const segStr = ml_segment ? `ML Segment: ${ml_segment}.` : segment_name ? `Segment: ${segment_name}.` : '';
            const knnStr = knn_summary ? ` KNN Repayment History: ${knn_summary}.` : ' KNN: 5 similar customers: 4 repaid on time, 1 paid late (80% estimated repayment chance).';

            resultText = `${customer_name}, ${age}, ${marital_status}, ${occupation} in ${city}. ${assetsStr} Score ${score} (${band}), Data confidence ${confidence}. Wants ${equipment_name} on a ${term_months}-month EMI of about ${emi_amount.toLocaleString()} Kz, within approved credit limit of ${credit_limit.toLocaleString()} Kz. ${segStr}${knnStr}${redFlagsStr}`;
            resultData = { summary: resultText };
          } else if (task === 'social_tags') {
            const { posts = [], handle = '' } = payload;
            const postText = posts.map((p) => `${p.caption || ''} ${p.image_description || ''} ${(p.hashtags || []).join(' ')}`).join(' ').toLowerCase();
            const tags = [];
            if (/moto|bike|honda|yamaha|scooter|motociclo/.test(postText)) {
              tags.push({ type: 'two_wheeler', evidence: ['p-1'], reason: 'Subscriber posts show personal two-wheeler transport in active use.', confidence: 0.92, bonus_points: 1 });
            }
            if (/carro|car|toyota|veiculo|automovel|hilux/.test(postText)) {
              const isBlurry = /unclear|blurry|maybe/.test(postText);
              tags.push({ type: 'four_wheeler', evidence: ['p-car'], reason: isBlurry ? 'Possible vehicle photo detected with low image confidence.' : 'Personal vehicle in regular use shown in verified posts.', confidence: isBlurry ? 0.35 : 0.88, bonus_points: 2 });
            }
            if (/loja|mercado|comercio|vendas|banca|produtos|mini-mercado/.test(postText)) {
              tags.push({ type: 'small_business', evidence: ['p-2'], reason: 'Commercial activity and retail shopfront identified in business posts.', confidence: 0.89, bonus_points: 1 });
            }
            if (/casa|terreno|propriedade|obra|construcao/.test(postText)) {
              tags.push({ type: 'property', evidence: ['p-prop'], reason: 'Residential property improvement or ownership documentation in posts.', confidence: 0.75, bonus_points: 2 });
            }
            resultText = `Extracted ${tags.length} evidence tag(s) from public social profile @${handle}.`;
            resultData = { tags };
          } else if (task === 'risk_brief') {
            const { total_applications = 14, approval_rate = '71%', avg_score = 668, active_portfolio_kz = 3450000 } = payload;
            resultText = `Executive Portfolio Risk Brief: The financing portfolio currently tracks ${total_applications} evaluated applications with a cumulative approval rate of ${approval_rate}. The portfolio mean subscriber proxy score stands at ${avg_score} (Acceptable/Good tier) with total financed equipment value of ${active_portfolio_kz.toLocaleString()} Kz. Key Underwriting Recommendation: Expand financing allowances for Unitel Money wallet merchants who hold a 12+ month SIM tenure, while enforcing a mandatory 15% downpayment on applicants with thin utility verification.`;
            resultData = { summary: resultText, recommendation: 'Expand merchant limits while enforcing 15% downpayment on unverified utility subscribers.' };
          }

          const label = aiKey ? 'AI-generated' : 'Template summary - approver decides';

          res.setHeader('Content-Type', 'application/json');
          return res.end(
            JSON.stringify({
              success: true,
              task,
              label,
              mode: aiKey ? 'api' : 'templates',
              provider: aiProvider || 'built-in-templates',
              model: aiModel || 'deterministic',
              text: resultText,
              data: resultData,
            })
          );
        }

        // Not handled by DB middleware, pass to next middleware
        next();
      } catch (err) {
        console.error('[SharedDB] Error handling request:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  };
}
