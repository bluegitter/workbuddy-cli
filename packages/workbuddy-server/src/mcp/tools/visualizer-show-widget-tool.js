'use strict';

function parseLoadingMessages(raw) {
  if (Array.isArray(raw)) return raw.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const value = raw.trim();
  if (value.startsWith('[')) try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean); } catch {}
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
function sanitizeTitle(title) { return title.replace(/[\s-]+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '').replace(/^_+|_+$/g, '').replace(/_{2,}/g, '_') || 'widget'; }
function validateInputs(title, widgetCode, loadingMessages) {
  if (!title || !title.trim()) return 'title is required.';
  if (!widgetCode || !widgetCode.trim()) return 'widget_code is required.';
  if (!loadingMessages.length) return 'loading_messages must contain at least one message.';
  if (loadingMessages.length > 4) return 'loading_messages can contain at most four messages.';
  const code = widgetCode.trim();
  if (/<(!DOCTYPE|html|head|body)\b/i.test(code)) return 'widget_code must be a raw SVG or HTML fragment without document wrapper tags.';
  if (/\b(localStorage|sessionStorage)\b/.test(code)) return 'widget_code cannot use localStorage or sessionStorage in the widget sandbox.';
  if (/position\s*:\s*fixed/i.test(code)) return 'widget_code cannot use position: fixed because the widget height is auto-sized from in-flow content.';
  if (/<form[\s>]/i.test(code)) return 'widget_code cannot use <form> tags. Use normal controls and event handlers instead.';
  if (code.startsWith('<svg')) { if ((code.match(/<svg[\s>]/gi) || []).length !== 1) return 'widget_code must contain exactly one <svg> element.'; if (!/viewBox\s*=\s*["']0\s+0\s+680\s+\d+["']/i.test(code)) return 'SVG widget_code must use a 680px-wide viewBox.'; }
  return null;
}
function buildErrorPayload(message) { return { type: 'visualizer_show_widget_result', success: false, title: '', loading_messages: [], render_mode: 'html', message }; }
function createVisualizerShowWidgetTool() {
  return { name: 'show_widget', description: 'Show visual content such as SVG graphics, diagrams, charts, or interactive HTML widgets.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, widget_code: { type: 'string' }, loading_messages: { type: 'string' } }, required: ['title', 'widget_code', 'loading_messages'] }, handler: async (args) => { try { const title = typeof args?.title === 'string' ? args.title : undefined; const widgetCode = typeof args?.widget_code === 'string' ? args.widget_code : undefined; const loadingMessages = parseLoadingMessages(args?.loading_messages); const error = validateInputs(title, widgetCode, loadingMessages); if (error) return { content: [{ type: 'text', text: JSON.stringify(buildErrorPayload(error)) }], isError: true }; return { content: [{ type: 'text', text: JSON.stringify({ type: 'visualizer_show_widget_result', success: true, title: sanitizeTitle(title), widget_code: widgetCode, loading_messages: loadingMessages, render_mode: widgetCode.trim().startsWith('<svg') ? 'svg' : 'html', message: 'Widget payload prepared for inline rendering.' }) }] }; } catch (error) { return { content: [{ type: 'text', text: JSON.stringify(buildErrorPayload(String(error))) }], isError: true }; } } };
}

module.exports = Object.freeze({ buildErrorPayload, createVisualizerShowWidgetTool, parseLoadingMessages, sanitizeTitle, validateInputs });
