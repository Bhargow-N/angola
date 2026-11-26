import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, *');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const dbPath = path.join(process.cwd(), 'data', 'shared_db.json');
    if (fs.existsSync(dbPath)) {
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      return res.status(200).json(data);
    }
  } catch (err) {
    console.warn('[api/db/all] Error loading shared_db.json:', err.message);
  }

  return res.status(200).json({
    applications: [],
    approvals: [],
    evaluations: [],
    notifications: [],
    auditLogs: [],
  });
}
