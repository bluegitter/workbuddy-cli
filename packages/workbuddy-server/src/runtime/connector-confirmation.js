'use strict';

function buildQqMailConfirmationInstruction({ token, expiresAt, originalName, originalText }) {
  return [
    'QQ Mail requires explicit user confirmation before this operation can continue.', '',
    'Your NEXT action MUST be to call the AskUserQuestion tool.',
    'Do NOT ask for confirmation in plain chat text.', 'Do NOT produce a final answer yet.',
    'Do NOT say the email operation has completed.', 'Do NOT retry this QQ Mail tool automatically.', '',
    'AskUserQuestion requirements:', '- Use one question.', '- Provide exactly two options: "确认发送" and "取消".',
    '- Summarize the operation from the server response below.', '- Wait for the user to select an option in the confirmation card.', '',
    `After the user selects "确认发送", retry the same QQ Mail tool (${originalName})`,
    'with the same arguments plus:', `confirmation_token: ${token}`,
    '', expiresAt ? `The confirmation token expires at: ${expiresAt}.` : '', '',
    'Original QQ Mail confirmation response:', originalText,
  ].filter(Boolean).join('\n');
}

function markQqMailConfirmationRequired(configId, originalName, firstResult, now = Date.now, logger = { warn() {}, info() {} }) {
  if (!String(configId).includes('qq-mail')) return null;
  const firstContent = firstResult?.content?.[0];
  if (!firstContent || firstContent.type !== 'text' || typeof firstContent.text !== 'string') return null;
  let parsed; try { parsed = JSON.parse(firstContent.text); } catch { return null; }
  const error = parsed?.error;
  if (!error || error.code !== 42801 || typeof error.details?.confirmation_token !== 'string' || error.details.confirmation_token.length === 0 || error._hints?.suggested_action !== 'confirm_with_token') return null;
  const token = error.details.confirmation_token; const expiresAt = error.details.expires_at;
  if (expiresAt) { const expiresMs = Date.parse(expiresAt); if (!Number.isFinite(expiresMs) || expiresMs <= now()) logger.warn(`[ConnectorConfirmation] expired confirmation token for ${configId}`); }
  return { content: [{ type: 'text', text: buildQqMailConfirmationInstruction({ token, expiresAt, originalName, originalText: firstContent.text }) }], isError: true };
}

module.exports = { buildQqMailConfirmationInstruction, markQqMailConfirmationRequired };
