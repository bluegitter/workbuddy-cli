'use strict';

function parseUrl(value) {
  try { return typeof value === 'string' && value.trim() ? new URL(value) : undefined; } catch { return undefined; }
}

function normalizePendingOpenUrlPayload(payload) {
  if (typeof payload === 'string') return payload;
  return typeof payload?.url === 'string' ? payload.url : null;
}

function classifyDesktopOpenUrl(rawUrl, {
  isTaskDeepLink = () => false,
  readSkillInstallIntent = () => null,
  readExpertInstallIntent = () => null,
  readSwitchModelIntent = () => null,
  isKnownDeepLinkHost = () => false,
  mapRoute = () => null,
} = {}) {
  const parsed = parseUrl(rawUrl);
  if (!parsed) return { type: 'invalid', rawUrl };
  if (isTaskDeepLink(rawUrl, parsed)) return { type: 'task', rawUrl, parsed };
  const skill = readSkillInstallIntent(parsed);
  if (skill) return { type: 'skill-install', rawUrl, parsed, intent: skill };
  const expert = readExpertInstallIntent(parsed);
  if (expert) return { type: 'expert-install', rawUrl, parsed, intent: expert };
  const modelId = readSwitchModelIntent(parsed);
  if (modelId) return { type: 'switch-model', rawUrl, parsed, modelId };
  if (isKnownDeepLinkHost(parsed.host)) return { type: 'business', rawUrl, parsed };
  const route = mapRoute(parsed);
  return route ? { type: 'route', rawUrl, parsed, route } : { type: 'ignored', rawUrl, parsed };
}

function createDesktopOpenUrlHandler(options = {}) {
  const {
    onInvalid = () => {}, onTask = () => {}, onSkillInstall = () => {}, onExpertInstall = () => {},
    onSwitchModel = () => {}, onBusiness = () => {}, onRoute = () => {}, onIgnored = () => {},
  } = options;
  const classify = options.classify || ((rawUrl) => classifyDesktopOpenUrl(rawUrl, options));
  return (rawUrl) => {
    const result = classify(rawUrl);
    switch (result.type) {
      case 'invalid': onInvalid(result); break;
      case 'task': onTask(result); break;
      case 'skill-install': onSkillInstall(result); break;
      case 'expert-install': onExpertInstall(result); break;
      case 'switch-model': onSwitchModel(result); break;
      case 'business': onBusiness(result); break;
      case 'route': onRoute(result); break;
      default: onIgnored(result); break;
    }
    return result;
  };
}

async function consumePendingDesktopOpenUrls(fetchPending, handleOpenUrl, onError = () => {}) {
  let pending;
  try { pending = await fetchPending?.() || []; } catch (error) { onError(error); return 0; }
  let handled = 0;
  for (const payload of pending) {
    const url = normalizePendingOpenUrlPayload(payload);
    if (!url) continue;
    handleOpenUrl(url);
    handled += 1;
  }
  return handled;
}

module.exports = { classifyDesktopOpenUrl, consumePendingDesktopOpenUrls, createDesktopOpenUrlHandler, normalizePendingOpenUrlPayload, parseUrl };
