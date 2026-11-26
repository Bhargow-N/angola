export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { summary, role, sessionId, msisdn, applicationId } = body;
  const ticketId = 'TICK-' + Date.now().toString().slice(-6);

  return res.status(200).json({
    success: true,
    ticketId,
    message: `Support ticket #${ticketId} has been created. An underwriting specialist has been notified.`,
  });
}
