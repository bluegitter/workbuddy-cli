'use strict';

function normalizeSessionOwnerUserId(userId) {
  return typeof userId === 'string' && userId.trim().length > 0
    ? userId.trim()
    : undefined;
}

function isSessionVisibleForOwnerScope({
  sessionUserId,
  currentUserId,
  accountInitialized,
}) {
  const normalizedSessionUserId = normalizeSessionOwnerUserId(sessionUserId);
  if (!normalizedSessionUserId || !accountInitialized) return true;

  const normalizedCurrentUserId = normalizeSessionOwnerUserId(currentUserId);
  if (!normalizedCurrentUserId) return false;
  return normalizedSessionUserId === normalizedCurrentUserId;
}

module.exports = Object.freeze({
  normalizeSessionOwnerUserId,
  isSessionVisibleForOwnerScope,
});
