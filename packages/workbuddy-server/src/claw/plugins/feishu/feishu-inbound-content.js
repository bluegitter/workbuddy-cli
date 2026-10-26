'use strict';

const LOCALE_PRIORITY = ['zh_cn', 'en_us', 'ja_jp'];
const isRecord = (value) => value !== null && typeof value === 'object';
const asText = (value) => typeof value === 'string' ? value : '';
const firstString = (record, keys) => keys.map((key) => asText(record?.[key])).find(Boolean);

function convertFeishuMessageContent(messageType, content = {}, rawContent) {
  switch (messageType) {
    case 'text': return compactSegments([{ type: 'text', text: asText(content.text) }]);
    case 'image': return resourceContent('image', content, ['image_key', 'img_key', 'file_key']);
    case 'file': return resourceContent('file', content, ['file_key']);
    case 'post': return convertPostContent(content);
    default: return compactSegments([{ type: 'text', text: `[${messageType}] ${rawContent ?? JSON.stringify(content)}` }]);
  }
}
function resourceContent(type, content, keys) {
  const fileKey = firstString(content, keys); if (!fileKey) return { segments: [] };
  return { segments: [{ type: 'resource', resource: { type, fileKey, fileName: firstString(content, ['file_name', 'name']), ...(type === 'file' ? { mimeType: firstString(content, ['mime_type', 'content_type']) || undefined } : {}) } }] };
}
function convertPostContent(content) {
  const post = unwrapPostBody(content); if (!post) return { segments: [] };
  const segments = []; addTextSegment(segments, asText(post.title));
  for (const paragraph of Array.isArray(post.content) ? post.content : []) {
    if (!Array.isArray(paragraph)) continue; let text = '';
    const flush = () => { addTextSegment(segments, text); text = ''; };
    for (const raw of paragraph) {
      const element = isRecord(raw) ? raw : {}; const tag = asText(element.tag);
      if (tag === 'text' || tag === 'md') text += applyStyle(asText(element.text), element.style);
      else if (tag === 'a') { const label = asText(element.text) || asText(element.href); text += element.href && label ? `[${label}](${element.href})` : label; }
      else if (tag === 'at') text += asText(element.text) || asText(element.user_name) || asText(element.name);
      else if (tag === 'img' || tag === 'image' || tag === 'media' || tag === 'file') { const result = resourceContent(tag === 'file' || tag === 'media' ? 'file' : 'image', element, tag === 'file' || tag === 'media' ? ['file_key'] : ['image_key', 'img_key', 'file_key']); if (result.segments.length) { flush(); segments.push(...result.segments); } }
      else if (tag === 'code_block') text += `\n\`\`\`${asText(element.language)}\n${asText(element.text)}\n\`\`\`\n`;
      else if (tag === 'hr') text += '\n---\n';
      else text += asText(element.text) || asText(element.content) || asText(element.name);
    }
    flush();
  }
  return compactSegments(segments);
}
function unwrapPostBody(content) {
  if (isPostBody(content)) return content;
  if (isRecord(content?.post)) { const nested = unwrapPostBody(content.post); if (nested) return nested; }
  for (const locale of LOCALE_PRIORITY) if (isPostBody(content?.[locale])) return content[locale];
  return Object.values(content || {}).find(isPostBody);
}
function compactSegments(segments) { const result = []; for (const segment of segments) segment.type === 'text' ? addTextSegment(result, segment.text) : result.push(segment); return { segments: result }; }
function addTextSegment(segments, text) { const normalized = asText(text).trim(); if (!normalized) return; const last = segments.at(-1); if (last?.type === 'text') last.text += `\n${normalized}`; else segments.push({ type: 'text', text: normalized }); }
function applyStyle(text, style) { if (!Array.isArray(style) || !text) return text; let result = text; if (style.includes('bold')) result = `**${result}**`; if (style.includes('italic')) result = `*${result}*`; if (style.includes('lineThrough')) result = `~~${result}~~`; if (style.includes('codeInline')) result = `\`${result}\``; return result; }
function isPostBody(value) { return isRecord(value) && ('title' in value || 'content' in value); }

module.exports = { LOCALE_PRIORITY, convertFeishuMessageContent, convertImageContent: (content) => resourceContent('image', content, ['image_key', 'img_key', 'file_key']), convertFileContent: (content) => resourceContent('file', content, ['file_key']), convertPostContent, applyStyle, compactSegments };
