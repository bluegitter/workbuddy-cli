'use strict';

function parseDeepLink(value) {
  if (value instanceof URL) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try { return new URL(value); } catch { return undefined; }
}

function getDeepLinkPath(url) {
  if (!url) return '/';
  if (url.host && (!url.pathname || url.pathname === '/')) return `/${url.host}`;
  if (url.host) return `/${url.host}${url.pathname}`;
  return url.pathname || '/';
}

function withSearchAndHash(pathname, url) { return `${pathname}${url.search}${url.hash}`; }
function toQueryString(searchParams) {
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function summarizeOpenUrl(value) {
  if (!value) return { hasUrl: false };
  try {
    const url = parseDeepLink(value);
    if (!url) throw new Error('invalid URL');
    return {
      hasUrl: true,
      scheme: url.protocol.replace(/:$/, ''),
      host: url.host,
      pathname: url.pathname,
      searchKeys: Array.from(url.searchParams.keys()),
      hash: url.hash ? '<present>' : '',
      urlLength: typeof value === 'string' ? value.length : url.toString().length,
    };
  } catch {
    return { hasUrl: true, parseError: true, urlLength: typeof value === 'string' ? value.length : undefined };
  }
}

function mapDeepLinkToRoute(url) {
  const parsed = parseDeepLink(url);
  if (!parsed) return null;
  const path = getDeepLinkPath(parsed);
  const params = new URLSearchParams(parsed.search);
  const callback = path.match(/^\/(?:agents\/)?callback\/([^/]+)\/?$/);
  if (callback) {
    if (!params.has('name')) params.set('name', decodeURIComponent(callback[1]));
    return `/callback${toQueryString(params)}`;
  }
  if (path === '/callback' || path === '/agents/callback') return `/callback${toQueryString(params)}`;
  const connector = path.match(/^\/console\/as\/connector\/oauth\/([^/]+)\/connect\/?$/);
  if (connector) {
    if (!params.has('name')) params.set('name', decodeURIComponent(connector[1]));
    return `/callback${toQueryString(params)}`;
  }
  if (path.startsWith('/task/')) return withSearchAndHash(path, parsed);
  return null;
}

function isSkillInstallDeepLink(url) {
  const parsed = parseDeepLink(url);
  return Boolean(parsed && parsed.host === 'codebuddy-ide' && parsed.pathname.replace(/\/+$/, '') === '/skill/install');
}
function readSkillInstallIntent(url) {
  const parsed = parseDeepLink(url);
  if (!isSkillInstallDeepLink(parsed)) return null;
  const skillName = parsed.searchParams.get('skillname')?.trim();
  const downloadUrl = parsed.searchParams.get('downloadurl')?.trim() || '';
  if (!skillName || !downloadUrl) return null;
  return { skillName, downloadUrl, channelType: parsed.searchParams.get('channelType') || parsed.searchParams.get('source') || undefined };
}

function readExpertInstallIntent(url) {
  const parsed = parseDeepLink(url);
  if (!parsed || parsed.host !== 'codebuddy-ide' || parsed.pathname.replace(/\/+$/, '') !== '/expert/install') return null;
  const expertName = parsed.searchParams.get('expertname')?.trim();
  const shareCode = parsed.searchParams.get('sharecode')?.trim() || '';
  return expertName && shareCode ? { expertName, shareCode } : null;
}

function readSwitchModelIntent(url) {
  const parsed = parseDeepLink(url);
  if (!parsed || getDeepLinkPath(parsed) !== '/switch-model') return null;
  const modelId = parsed.searchParams.get('modelId')?.trim();
  return modelId || null;
}

function getOpenUrlFromCommandLine(commandLine, isWorkbuddyDeepLink = (value) => Boolean(parseDeepLink(value))) {
  return (Array.isArray(commandLine) ? commandLine : []).find((arg) => isWorkbuddyDeepLink(arg));
}

function isTaskDeepLink(value) {
  const parsed = parseDeepLink(value);
  return Boolean(parsed && (parsed.host === 'task' || getDeepLinkPath(parsed).startsWith('/task/')));
}

module.exports = { getDeepLinkPath, getOpenUrlFromCommandLine, isSkillInstallDeepLink, isTaskDeepLink, mapDeepLinkToRoute, parseDeepLink, readExpertInstallIntent, readSkillInstallIntent, readSwitchModelIntent, summarizeOpenUrl, toQueryString, withSearchAndHash };
