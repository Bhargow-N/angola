import { spawn } from 'child_process';
import process from 'process';
import path from 'path';

console.log('================================================================');
console.log(' Starting Unitel Full Stack POC (Web + Email + ML Service) ');
console.log('----------------------------------------------------------------');
console.log(' 1. ML Service (FastAPI + scikit-learn) -> http://127.0.0.1:8000');
console.log(' 2. Applicant Portal (Vite Dev Server)  -> http://localhost:5173');
console.log(' 3. Approver & Admin Portal (Vite)      -> http://localhost:5174');
console.log(' 4. Shared DB & Real-Time Sync (SSE)    -> data/shared_db.json');
console.log('================================================================\n');

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';
const pythonExe = isWin && process.env.PYTHON_PATH ? process.env.PYTHON_PATH : 'C:\\Python311\\python.exe';

// 1. Spawn Python ML FastAPI Service on port 8000
console.log('[ML] Spawning Python FastAPI service on port 8000...');
const mlProc = spawn(pythonExe, ['-m', 'uvicorn', 'ml.main:app', '--host', '127.0.0.1', '--port', '8000'], {
  shell: true,
  env: { ...process.env },
});

mlProc.stdout?.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.log('\x1b[35m[ML Service 8000]\x1b[0m ' + line.trimEnd());
    }
  }
});

mlProc.stderr?.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.log('\x1b[35m[ML Service 8000]\x1b[0m ' + line.trimEnd());
    }
  }
});

// 2. Spawn Applicant Portal on Port 5173
console.log('[Vite] Spawning Applicant Portal on port 5173...');
const applicantProc = spawn(npxCmd, ['vite', '--port', '5173', '--strictPort'], {
  shell: true,
  env: { ...process.env, PORT: '5173' },
});

applicantProc.stdout?.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.log('\x1b[33m[Applicant 5173]\x1b[0m ' + line.trimEnd());
    }
  }
});

applicantProc.stderr?.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.error('\x1b[31m[Applicant 5173 ERR]\x1b[0m ' + line.trimEnd());
    }
  }
});

// 3. Spawn Approver & Admin Portal on Port 5174
console.log('[Vite] Spawning Approver & Admin Portal on port 5174...');
const approverProc = spawn(npxCmd, ['vite', '--port', '5174', '--strictPort'], {
  shell: true,
  env: { ...process.env, PORT: '5174' },
});

approverProc.stdout?.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.log('\x1b[36m[Approver 5174]\x1b[0m ' + line.trimEnd());
    }
  }
});

approverProc.stderr?.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.error('\x1b[31m[Approver 5174 ERR]\x1b[0m ' + line.trimEnd());
    }
  }
});

function cleanup() {
  console.log('\nShutting down all Unitel services (ML + Web portals)...');
  try {
    mlProc.kill();
  } catch {}
  try {
    applicantProc.kill();
  } catch {}
  try {
    approverProc.kill();
  } catch {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
