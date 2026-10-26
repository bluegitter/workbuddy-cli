'use strict';

const fs = require('fs');
const path = require('path');

function readPersistedLocale(configDir) {
  try {
    const configPath = path.join(configDir, 'app', 'app-config.json');
    if (!fs.existsSync(configPath)) return undefined;
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return typeof raw?.locale === 'string' ? raw.locale : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the connector display language using the same precedence as the
 * desktop menu locale: persisted app setting, product configuration, then
 * the runtime/system locale.
 */
function isEnglishConnectorLocale(deps = {}) {
  const getProductIsOversea = deps.getProductIsOversea || (() => undefined);
  const getProductLocale = deps.getProductLocale || (() => undefined);
  const getSystemLocale = deps.getSystemLocale || (() => process.env.LANG || 'en');
  const persistedLocale = readPersistedLocale(deps.configDir);
  if (persistedLocale) return !persistedLocale.toLowerCase().startsWith('zh');
  const productLocale = getProductLocale();
  if (productLocale) return !productLocale.toLowerCase().startsWith('zh');
  const productIsOversea = getProductIsOversea();
  if (productIsOversea === true) return true;
  if (productIsOversea === false) return false;
  return !String(getSystemLocale() || 'en').toLowerCase().startsWith('zh');
}

function parseLocalizedMapKey(key) {
  return String(key).split(/[;,]/).map((part) => part.trim()).filter(Boolean);
}

function resolveLocalizedMapText(map, isEnglish, candidateKeys = []) {
  if (!map || typeof map !== 'object') return undefined;
  const targetLocale = isEnglish ? 'en' : 'zh';
  for (const candidateKey of candidateKeys) {
    for (const [rawKey, text] of Object.entries(map)) {
      if (!parseLocalizedMapKey(rawKey).includes(candidateKey)) continue;
      const value = text?.[targetLocale];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return undefined;
}

function resolveConnectorDisplayText(entry = {}, options = {}) {
  const isEnglish = options.isEnglish === true;
  const name = resolveLocalizedMapText(entry.name_map, isEnglish, options.candidateKeys)
    || (isEnglish ? entry.name_en || entry.name : entry.name_zh || entry.name);
  const description = resolveLocalizedMapText(entry.description_map, isEnglish, options.candidateKeys)
    || (isEnglish ? entry.description_en || entry.description : entry.description_zh || entry.description);
  return { name, description };
}

module.exports = Object.freeze({
  isEnglishConnectorLocale,
  parseLocalizedMapKey,
  readPersistedLocale,
  resolveLocalizedMapText,
  resolveConnectorDisplayText,
});
