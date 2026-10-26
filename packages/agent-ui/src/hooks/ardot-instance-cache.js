'use strict';

function selectArdotLruEvictionVictims(entries, protectedSessionIds, maxEntries = 3) {
  if (entries.length <= maxEntries) return [];
  const protectedSet = new Set([...protectedSessionIds || []].filter((id) => typeof id === 'string' && id.length > 0));
  return entries.filter((entry) => !protectedSet.has(entry.sessionId)).sort((a, b) => a.lastUsedAt - b.lastUsedAt).slice(0, entries.length - maxEntries);
}

module.exports = { selectArdotLruEvictionVictims };
