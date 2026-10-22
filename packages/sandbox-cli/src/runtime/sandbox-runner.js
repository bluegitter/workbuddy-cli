'use strict';

const { spawn } = require('child_process');

function runCommand(command, { cwd, env, policy, targetPath, signal } = {}) {
  const decision = policy?.check(command, targetPath);
  if (decision && !decision.allowed) return Promise.reject(new Error(decision.reason));
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-lc', command], { cwd, env, signal });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, reason) => resolve({ code, reason, stdout, stderr }));
  });
}

module.exports = { runCommand };
