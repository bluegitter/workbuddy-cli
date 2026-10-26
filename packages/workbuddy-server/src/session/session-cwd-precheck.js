'use strict';

const fs = require('node:fs');

const SESSION_CWD_UNAVAILABLE = 'SESSION_CWD_UNAVAILABLE';

class SessionCwdUnavailableError extends Error {
  constructor(message, data) {
    super(message);
    this.name = 'SessionCwdUnavailableError';
    this.code = SESSION_CWD_UNAVAILABLE;
    this.data = data;
  }
}

function classifyErrno(errno) {
  switch (errno) {
    case 'ENOENT':
    case 'ENOTDIR':
      return 'missing';
    case 'EACCES':
    case 'EPERM':
      return 'permission_denied';
    default:
      return 'unknown';
  }
}

async function assertSessionCwdUsable(cwd) {
  let stat;
  try {
    stat = await fs.promises.stat(cwd);
  } catch (error) {
    const errno = error?.code;
    const reason = classifyErrno(errno);
    throw new SessionCwdUnavailableError(messageForStatFailure(cwd, reason, errno), {
      cwd,
      reason,
      errno,
      systemMessage: error instanceof Error ? error.message : String(error),
    });
  }

  if (!stat.isDirectory()) {
    throw new SessionCwdUnavailableError(
      `Session working directory path is not a directory: ${cwd}`,
      { cwd, reason: 'not_a_directory' },
    );
  }

  try {
    await fs.promises.access(cwd, fs.constants.R_OK | fs.constants.X_OK);
  } catch (error) {
    const errno = error?.code;
    throw new SessionCwdUnavailableError(
      `Permission denied for session working directory: ${cwd}`,
      {
        cwd,
        reason: 'permission_denied',
        errno,
        systemMessage: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

function messageForStatFailure(cwd, reason, errno) {
  if (reason === 'missing') {
    return `Session working directory does not exist or was removed: ${cwd}`;
  }
  if (reason === 'permission_denied') {
    return `Permission denied for session working directory: ${cwd}`;
  }
  return `Cannot access session working directory: ${cwd} (${errno ?? 'unknown'})`;
}

module.exports = Object.freeze({
  SESSION_CWD_UNAVAILABLE,
  SessionCwdUnavailableError,
  assertSessionCwdUsable,
  classifyErrno,
  messageForStatFailure,
});
