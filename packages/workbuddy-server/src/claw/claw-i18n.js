'use strict';

const runtimeContext = require('../server/runtime-context');

const catalogs = {
  'zh-CN': {
    artifactDone: '已处理完成，请查收附件。', noReplyGenerated: '我暂时无法生成可发送内容，请换个问法再试一次。', taskCancelled: '本次任务已取消。', requestFailedWithDetail: '抱歉，请求处理失败：{error}', requestFailedGeneric: '抱歉，这个请求我暂时无法处理。', busyRetryLater: '正在处理其他消息，请稍后再试。', clearFailed: '清空会话失败，请稍后再试', newSessionStarted: '新会话已开始 {time}', noCompactableContext: '暂无可压缩的会话上下文。', compactingInProgress: '—— 正在压缩上下文 ——', compactCompleted: '—— 上下文已压缩 ——', compactFailed: '上下文压缩失败，请稍后再试。', wecomNotSupported: '当前账号不支持企业微信集成，请切换到支持的账号后重试。', channelNotSupported: '当前账号不支持该通道，请切换到支持的账号后重试。', localPushDisabledWecom: '本地消息推送已关闭，请在「Claw 设置」中开启「企业微信集成」开关后重试。', channelNotConfigured: '该通道尚未配置，请先在「Claw 设置」中完成配置后重试。', systemPromptLine1: '你正在通过 WorkBuddy Desktop 的 Claw 通道回复外部用户消息。', systemPromptLine2: '所有 IM 渠道（如元宝、QQ、钉钉、微信等）的消息共享同一个会话。', systemPromptLine3: '请直接输出最终要发送给用户的回复文本。', systemPromptRequirement: '要求：', systemPromptRule1: '1. 结合当前工作区上下文和用户消息直接回答；', systemPromptRule2: '2. 保持简洁自然，不要暴露内部实现、工具调用或思考过程；', systemPromptRule3: '3. 不要添加 Markdown 标题；', approvalConfirmHeader: '⚠️ 需要你的确认', approvalAboutToExecute: '我即将执行以下操作：', approvalAction: '【操作】{description}', approvalCommand: '【命令】{command}', approvalReplyPrompt: '请回复：', approvalRunHint: '✅ 回复「允许」执行该命令', approvalAlwaysAllowHint: '🔓 回复「始终允许」在本会话内始终执行该类命令', approvalRejectHint: '❌ 回复「拒绝」终止整个任务', approvalApproved: '✅ 命令已确认执行（来源：{source}）\n操作：{description}', approvalApprovedAlways: '🔓 已设为本会话始终允许（来源：{source}）\n操作：{description}', approvalRejected: '❌ 任务已终止（来源：{source}）\n操作：{description}', approvalSourceLocal: '本地 IDE', approvalSourceIM: 'IM', approvalFallbackLine1: '抱歉，我没理解你的意思。', approvalFallbackLine2: '请回复以下关键词之一：', approvalFallbackRun: '✅「允许」- 执行该命令', approvalFallbackAlwaysAllow: '🔓「始终允许」- 本会话内始终执行该类命令', approvalFallbackReject: '❌「拒绝」- 终止整个任务', automationSuccess: '✅ 定时任务「{name}」执行成功', automationFailed: '❌ 定时任务「{name}」执行失败'
  },
  'en-US': {
    artifactDone: 'Done. Please check the attachment.', noReplyGenerated: 'Sorry, I was unable to generate a reply. Please try rephrasing your question.', taskCancelled: 'This task has been cancelled.', requestFailedWithDetail: 'Sorry, the request failed: {error}', requestFailedGeneric: 'Sorry, I am unable to process this request right now.', busyRetryLater: 'Processing another message, please try again later.', clearFailed: 'Failed to clear the session. Please try again later.', newSessionStarted: 'New session started {time}', noCompactableContext: 'No compactable conversation context.', compactingInProgress: '—— Compacting context ——', compactCompleted: '—— Context compacted ——', compactFailed: 'Context compaction failed. Please try again later.', wecomNotSupported: 'Your account does not support WeCom integration. Please switch to a supported account and try again.', channelNotSupported: 'Your account does not support this channel. Please switch to a supported account and try again.', localPushDisabledWecom: 'Local message push is disabled. Please enable the WeCom integration toggle in Claw Settings and try again.', channelNotConfigured: 'This channel is not configured. Please complete the setup in Claw Settings and try again.', systemPromptLine1: 'You are replying to external users via the WorkBuddy Desktop Claw channel.', systemPromptLine2: 'All IM channels (YuanBao, QQ, DingTalk, WeChat, etc.) share the same conversation session.', systemPromptLine3: 'Please output only the final reply text to be sent to the user.', systemPromptRequirement: 'Requirements:', systemPromptRule1: '1. Answer directly using the workspace context and the user message;', systemPromptRule2: '2. Keep it concise and natural — do not expose internal implementation, tool calls, or thinking process;', systemPromptRule3: '3. Do not add Markdown headings;', approvalConfirmHeader: '⚠️ Confirmation Required', approvalAboutToExecute: 'I am about to execute the following:', approvalAction: '[Action] {description}', approvalCommand: '[Command] {command}', approvalReplyPrompt: 'Please reply:', approvalRunHint: '✅ Reply "Allow" to execute this command', approvalAlwaysAllowHint: '🔓 Reply "Always Allow" to always allow this command for this session', approvalRejectHint: '❌ Reply "Reject" to terminate the entire task', approvalApproved: '✅ Command approved and executed (source: {source})\nAction: {description}', approvalApprovedAlways: '🔓 Always allowed for this session (source: {source})\nAction: {description}', approvalRejected: '❌ Task terminated (source: {source})\nAction: {description}', approvalSourceLocal: 'Local IDE', approvalSourceIM: 'IM', approvalFallbackLine1: "Sorry, I didn't understand that.", approvalFallbackLine2: 'Please reply with one of the following keywords:', approvalFallbackRun: '✅ "Allow" — execute this command', approvalFallbackAlwaysAllow: '🔓 "Always Allow" — always allow for this session', approvalFallbackReject: '❌ "Reject" — terminate the entire task', automationSuccess: '✅ Scheduled task "{name}" succeeded', automationFailed: '❌ Scheduled task "{name}" failed'
  }
};

let hostLocaleProvider;
function setClawLocaleProviderForHost(provider) { hostLocaleProvider = provider; }
function normalizeLocale(locale) {
  if (!locale) return undefined;
  const normalized = String(locale).toLowerCase();
  if (normalized.startsWith('zh') || normalized.startsWith('cn')) return 'zh-CN';
  if (normalized.startsWith('en')) return 'en-US';
  return undefined;
}
function isChineseLocale(locale) { return /^(zh|cn)/i.test(String(locale || '')); }
function getClawLocale() {
  const hostLocale = normalizeLocale(hostLocaleProvider?.());
  if (hostLocale) return hostLocale;
  const envLocale = normalizeLocale(process.env.WORKBUDDY_MENU_LOCALE);
  if (envLocale) return envLocale;
  return isChineseLocale(runtimeContext.getWorkbuddyRuntimeLocale()) ? 'zh-CN' : 'en-US';
}
function t(key, params) {
  let text = catalogs[getClawLocale()]?.[key] ?? catalogs['en-US'][key] ?? key;
  for (const [name, value] of Object.entries(params || {})) text = text.replace(`{${name}}`, String(value));
  return text;
}

module.exports = { catalogs, setClawLocaleProviderForHost, getClawLocale, t, normalizeLocale, isChineseLocale };
