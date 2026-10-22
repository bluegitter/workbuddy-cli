'use strict';

function normalizeOAuthBaseUrl(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (!parsed.protocol || !parsed.host) return '';
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch { return ''; }
}

function isOAuthCallbackUrl(url, baseUrl) {
  if (!baseUrl) return false;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.startsWith(`${baseUrl}/`) && parsed.pathname.endsWith('/oauth/callback');
  } catch { return false; }
}

function extractConfigIdFromCallbackUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    if (!pathname.endsWith('/oauth/callback')) return undefined;
    const head = pathname.slice(0, -'/oauth/callback'.length);
    const lastSlash = head.lastIndexOf('/');
    if (lastSlash < 0 || lastSlash === head.length - 1) return undefined;
    return decodeURIComponent(head.slice(lastSlash + 1)) || undefined;
  } catch { return undefined; }
}

function parseOAuthCallbackUrl(url, stateToConfigId = new Map()) {
  const parsed = new URL(url);
  const error = parsed.searchParams.get('error');
  const state = parsed.searchParams.get('state');
  const code = parsed.searchParams.get('code');
  if (error) {
    const configId = state ? stateToConfigId.get(state) : undefined;
    if (state) stateToConfigId.delete(state);
    const description = parsed.searchParams.get('error_description');
    return { success: false, configId, error: description ? `${error}: ${description}` : error };
  }
  if (!code || !state) return { success: false, configId: extractConfigIdFromCallbackUrl(url), error: 'Missing code or state' };
  return { success: true, state, code, configId: extractConfigIdFromCallbackUrl(url) };
}

module.exports = { normalizeOAuthBaseUrl, isOAuthCallbackUrl, extractConfigIdFromCallbackUrl, parseOAuthCallbackUrl };
