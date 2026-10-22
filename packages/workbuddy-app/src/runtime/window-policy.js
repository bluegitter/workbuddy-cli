'use strict';

const DOCS_QQ_EXTERNAL_PATH_PREFIXES = Object.freeze(['/policy', '/about', '/agreement', '/privacy', '/help', '/feedback', '/doc']);

function clampBoundsToWorkArea(bounds, workArea) {
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  let x = bounds.x, y = bounds.y;
  if (x < workArea.x) x = workArea.x;
  if (y < workArea.y) y = workArea.y;
  if (x + width > workArea.x + workArea.width) x = workArea.x + workArea.width - width;
  if (y + height > workArea.y + workArea.height) y = workArea.y + workArea.height - height;
  return { x, y, width, height };
}

function isVisibleOnAnyDisplay(bounds, displays = []) {
  return displays.some((display) => {
    const area = display.workArea || display;
    return bounds.x < area.x + area.width && bounds.x + bounds.width > area.x && bounds.y < area.y + area.height && bounds.y + bounds.height > area.y;
  });
}

function centerOnWorkArea(bounds, workArea) {
  return { x: Math.round(workArea.x + (workArea.width - bounds.width) / 2), y: Math.round(workArea.y + (workArea.height - bounds.height) / 2), width: bounds.width, height: bounds.height };
}

function stripFrameEmbeddingHeaders(responseHeaders) {
  if (!responseHeaders) return {};
  const cleaned = {};
  for (const key of Object.keys(responseHeaders)) {
    const lower = key.toLowerCase();
    if (lower === 'x-frame-options') continue;
    if (lower === 'content-security-policy' || lower === 'content-security-policy-report-only') {
      const values = responseHeaders[key];
      if (!values || !values.length) continue;
      const stripped = values.map((value) => value.split(';').map((part) => part.trim()).filter((part) => part && !/^frame-ancestors\b/i.test(part)).join('; ')).filter(Boolean);
      if (stripped.length) cleaned[key] = stripped;
    } else cleaned[key] = responseHeaders[key];
  }
  return cleaned;
}

function isHostOrSubdomain(hostname, domain) { return hostname === domain || hostname.endsWith(`.${domain}`); }
function isCodeBuddyOAuthRedirectHost(hostname) { return hostname === 'www.codebuddy.cn' || hostname === 'staging.codebuddy.cn'; }
function pathMatchesPrefix(pathname, prefix) { return pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}.`); }
function isDocsQqExternalPath(pathname) { const lower = pathname.toLowerCase(); return lower === '' || lower === '/' || DOCS_QQ_EXTERNAL_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(lower, prefix)); }
function isPtlogin2ExternalPath(pathname) { const lower = pathname.toLowerCase(); return lower === '/j_newreg_url' || lower.startsWith('/j_newreg_url/') || lower.startsWith('/j_newreg_url?'); }

function isTencentDocsUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'docs.qq.com' || url.hostname.endsWith('.docs.qq.com')); } catch { return false; }
}
function isCodeBuddyLexiangOAuthConnectUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && isCodeBuddyOAuthRedirectHost(url.hostname) && url.pathname.startsWith('/console/as/p/connector/oauth/lexiang-ol/connect'); } catch { return false; }
}
function isAllowedGuestWebviewRedirect(value) {
  try {
    const url = new URL(value), { hostname, pathname, protocol } = url;
    if (protocol !== 'https:') return false;
    if (isCodeBuddyOAuthRedirectHost(hostname) && (pathname.startsWith('/console/as/p/connector/oauth/lexiang-ol/connect') || pathname.startsWith('/console/as/p/connector/oauth/tdocs-app/connect'))) return true;
    const callbackName = url.searchParams.get('name');
    if (isCodeBuddyOAuthRedirectHost(hostname) && pathname === '/agents/callback' && (callbackName === 'tdocs-app' || callbackName === 'lexiang-ol')) return true;
    if (hostname === 'mcp.lexiang-app.com' && pathname.startsWith('/oauth/')) return true;
    if (hostname === 'docs.qq.com' && pathname.startsWith('/oauth/')) return true;
    if (hostname === 'graph.qq.com' && pathname.startsWith('/oauth2.0/')) return true;
    if (isHostOrSubdomain(hostname, 'tencentciam.com')) return true;
    const lex = isHostOrSubdomain(hostname, 'lexiangla.com') || isHostOrSubdomain(hostname, 'lexiangla.net');
    if (lex && (pathname === '/c/mcp-auth' || pathname === '/c/auth-callback')) return true;
    return lex && pathname === '/sapi/oauth/authorize' && isCodeBuddyLexiangOAuthConnectUrl(url.searchParams.get('redirect_uri') || '');
  } catch { return false; }
}

function isSameDocumentNavigation(currentUrl, targetUrl, isDownload = () => false) {
  if (!isTencentDocsUrl(currentUrl) || !isTencentDocsUrl(targetUrl) || isDownload(targetUrl)) return false;
  try { const current = new URL(currentUrl), target = new URL(targetUrl); return current.origin === target.origin && current.pathname === target.pathname; } catch { return false; }
}
function getGuestInPlaceNavigationReason(currentUrl, targetUrl, isDownload) {
  if (isSameDocumentNavigation(currentUrl, targetUrl, isDownload)) return 'same-document';
  if (isAllowedGuestWebviewRedirect(targetUrl)) return 'allowed oauth redirect';
  return null;
}
function getTrafficLightPosition(height = 52) { const y = Math.floor((height - 12) / 2); return y > 0 ? { x: y + 1, y } : undefined; }
function isEnabledEnv(value) { return value === '1' || value?.toLowerCase() === 'true'; }

module.exports = { clampBoundsToWorkArea, centerOnWorkArea, getGuestInPlaceNavigationReason, getTrafficLightPosition, isAllowedGuestWebviewRedirect, isCodeBuddyLexiangOAuthConnectUrl, isCodeBuddyOAuthRedirectHost, isDocsQqExternalPath, isEnabledEnv, isHostOrSubdomain, isPtlogin2ExternalPath, isSameDocumentNavigation, isTencentDocsUrl, isVisibleOnAnyDisplay, stripFrameEmbeddingHeaders };
