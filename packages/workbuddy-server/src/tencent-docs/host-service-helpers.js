'use strict';

const TDOCS_DEV_ENV_NAME_DEFAULT = 'feature/saas_tdocs_wb';
const TDOCS_DEV_ENV_ID_DEFAULT = 'sit-eb191526';
function isAllowed(deps) { return deps?.isDevEnvCookieAllowed?.() === true; }
function buildDevEnvCookieString(deps = {}) { if (!isAllowed(deps)) return ''; const name = deps.getDevEnvName?.() ?? TDOCS_DEV_ENV_NAME_DEFAULT; const id = deps.getDevEnvId?.() ?? TDOCS_DEV_ENV_ID_DEFAULT; return [[name && `env_name=${name}`], [id && `env_id=${id}`]].flat().filter(Boolean).join('; '); }
async function ensureDevEnvCookiesInJar(deps, url) {
  if (!isAllowed(deps)) return;
  const session = deps.getMainSession?.(); if (!session?.cookies?.set || !url) return;
  let parsed; try { parsed = new URL(url); } catch { return; }
  const name = deps.getDevEnvName?.() ?? TDOCS_DEV_ENV_NAME_DEFAULT; const id = deps.getDevEnvId?.() ?? TDOCS_DEV_ENV_ID_DEFAULT;
  for (const [key, value] of [['env_name', name], ['env_id', id]]) if (value) try { await session.cookies.set({ url: parsed.origin, name: key, value: String(value), domain: parsed.hostname, path: '/', secure: parsed.protocol === 'https:', sameSite: 'no_restriction', httpOnly: false }); } catch (error) { deps.logger?.warn?.(`[TencentDocs] cookie injection failed: ${error}`); }
}
module.exports = { TDOCS_DEV_ENV_NAME_DEFAULT, TDOCS_DEV_ENV_ID_DEFAULT, isAllowed, buildDevEnvCookieString, ensureDevEnvCookiesInJar };
