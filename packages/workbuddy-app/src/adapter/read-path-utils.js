'use strict';

function getParentDirForRead(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) return undefined;
  const normalized = filePath.replace(/^file:\/\//, '');
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (index < 0) return undefined;
  const separator = normalized[index];
  if (index === 2 && /^[a-zA-Z]:$/.test(normalized.slice(0, 2))) return normalized.slice(0, 2) + separator;
  if (index === 0) return separator;
  return normalized.slice(0, index);
}

module.exports = Object.freeze({ getParentDirForRead });
