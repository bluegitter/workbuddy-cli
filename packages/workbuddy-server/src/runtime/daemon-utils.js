'use strict';

function resolveStoredSessionTitle(database, sessionId) {
  const row = database.getSession(sessionId);
  const customTitle = row?.customTitle?.trim();
  return customTitle || row?.title?.trim() || undefined;
}

async function resolveProductName(celljs, { env = process.env, fallback = 'WorkBuddy' } = {}) {
  const fromEnv = env.WORKBUDDY_PRODUCT_NAME?.trim();
  if (fromEnv) return fromEnv;
  try {
    const productName = (await celljs?.productManager?.waitConfiguration?.())?.productName ?? celljs?.productManager?.configuration?.productName;
    if (typeof productName === 'string' && productName.trim()) return productName;
  } catch {}
  return fallback;
}

function markDaemon(id, { marks, getPerfLogger, flow, logger } = {}) {
  try {
    const definition = marks?.[id];
    if (!definition) return false;
    getPerfLogger?.(flow)?.mark(definition.key, { id: definition.id, phase: definition.phase });
    return true;
  } catch (error) {
    logger?.(error);
    return false;
  }
}

module.exports = { markDaemon, resolveProductName, resolveStoredSessionTitle };
