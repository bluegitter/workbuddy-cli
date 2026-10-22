'use strict';

const PTY_PATH_RE = /^\/pty\/([a-zA-Z0-9_-]+)/;
function extractSessionId(url) { return url ? PTY_PATH_RE.exec(url.split('?')[0])?.[1] : undefined; }
function extractToken(url) { if (!url) return undefined; try { return new URL(url, 'http://localhost').searchParams.get('token') || undefined; } catch { return undefined; } }

module.exports = Object.freeze({ PTY_PATH_RE, extractSessionId, extractToken });
