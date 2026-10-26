'use strict';

function extractQueueItemPlainText(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return '';
  const parts = [];
  for (const block of contentBlocks) {
    if (typeof block === 'string') {
      parts.push(block);
    } else if (block && typeof block === 'object' && typeof block.text === 'string' && block.text.length > 0) {
      parts.push(block.text);
    }
  }
  return parts.join('');
}

function containsTeammateMessageMarkupFragment(text) {
  return text.includes('<teammate-message') || text.includes('</teammate-message>');
}

function isCliInjectedTeammateQueueItem(item) {
  const text = extractQueueItemPlainText(item.contentBlocks);
  return Boolean(text && containsTeammateMessageMarkupFragment(text));
}

function filterCliInjectedTeammateQueueItems(data) {
  if (!data || !Array.isArray(data.items) || data.items.length === 0) return data;
  const items = data.items.filter((item) => !isCliInjectedTeammateQueueItem(item));
  if (items.length === data.items.length) return data;
  return { ...data, items };
}

module.exports = Object.freeze({
  extractQueueItemPlainText,
  containsTeammateMessageMarkupFragment,
  isCliInjectedTeammateQueueItem,
  filterCliInjectedTeammateQueueItems,
});
