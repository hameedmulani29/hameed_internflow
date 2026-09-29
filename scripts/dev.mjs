import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const shellCommand = isWindows ? (process.env.ComSpec || 'cmd.exe') : npmCommand;
const children = [];
let shuttingDown = false;

function start(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });
  children.push({ name, child });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code !== 0) {
      console.error(`${name} stopped with code ${code ?? signal}.`);
      shutdown(code || 1);
    }
  });
  child.on('error', (error) => {
    console.error(`Unable to start ${name}: ${error.message}`);
    shutdown(1);
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (isWindows) {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 150);
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

console.log('Starting InternFlow frontend and backend...');

async function backendIsReady() {
  try {
    const response = await fetch('http://127.0.0.1:8000/api/health');
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (await backendIsReady()) {
    console.log('Backend already running on http://127.0.0.1:8000; reusing it.');
  } else {
    start('Backend', 'python', ['-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8000']);
  }

  const frontendArgs = isWindows
    ? ['/d', '/s', '/c', `${npmCommand} run dev:frontend -- --host 0.0.0.0 --port 5173`]
    : ['run', 'dev:frontend', '--', '--host', '0.0.0.0', '--port', '5173'];
  start('Frontend', shellCommand, frontendArgs);
}

main().catch((error) => {
  console.error(`Unable to start InternFlow: ${error.message}`);
  shutdown(1);
});
