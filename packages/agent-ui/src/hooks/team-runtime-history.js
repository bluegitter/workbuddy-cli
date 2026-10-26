'use strict';

function cloneMemberHistories(histories) {
  return Object.fromEntries(Object.entries(histories || {}).map(([name, history]) => [name, (history || []).map((entry) => ({ ...entry }))]));
}

function mergeTeamRuntimeMemberHistories(previousHistories, incomingHistories) {
  const merged = cloneMemberHistories(previousHistories);
  for (const [name, history] of Object.entries(incomingHistories || {})) {
    const next = (history || []).map((entry) => ({ ...entry }));
    const previous = merged[name];
    if (next.length > 0 || !previous || previous.length === 0) merged[name] = next;
  }
  return merged;
}

module.exports = { cloneMemberHistories, mergeTeamRuntimeMemberHistories };
