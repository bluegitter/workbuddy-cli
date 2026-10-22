'use strict';

function resolveCliSettingsLanguage(deps = {}) {
  let configuredLocale;
  try { const value = deps.readAppConfigValue?.('locale'); if (typeof value === 'string' && value.trim()) configuredLocale = value.trim(); } catch {}
  let systemLocale = '';
  try { systemLocale = deps.getSystemLocale?.() || ''; } catch {}
  if (!configuredLocale && !systemLocale) return undefined;
  const isZh = deps.resolveResponseLocaleIsZh
    ? deps.resolveResponseLocaleIsZh(configuredLocale, systemLocale)
    : /^(zh|cn)/i.test(configuredLocale || systemLocale);
  return isZh ? '简体中文' : 'English';
}

module.exports = Object.freeze({ resolveCliSettingsLanguage });
