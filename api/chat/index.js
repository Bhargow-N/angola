import { handleStreamingChat } from '../../server/chatEngine.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { messages = [], role = 'customer', sessionId = 'default', clientApplications = [] } = body;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    await handleStreamingChat({
      messages,
      role,
      sessionId,
      dbData: {
        applications: clientApplications || [],
        approvals: [],
        evaluations: [],
        notifications: [],
        auditLogs: [],
      },
      env: process.env,
      onChunk: (chunk) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      },
      onProposal: (proposal) => {
        res.write(`data: ${JSON.stringify({ action_proposal: proposal })}\n\n`);
      },
      onComplete: (meta) => {
        res.write(`data: ${JSON.stringify({ done: true, ...meta })}\n\n`);
        res.end();
      },
    });
  } catch (err) {
    console.error('[Vercel API Chat Error]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  }
}
