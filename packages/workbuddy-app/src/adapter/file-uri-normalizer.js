'use strict';

function hasWindowsDriveLetter(input) { return /^[a-zA-Z]:[\\/]?/.test(input); }
function safeDecode(input) { try { return decodeURIComponent(input); } catch { return input; } }
function fileUriToPath(uri) {
  if (!uri.startsWith('file:')) return uri;
  const repaired = uri.replace(/^file:\/\/([a-zA-Z]:)/, 'file:///$1');
  let pathname;
  try { pathname = new URL(repaired).pathname; } catch { pathname = repaired.replace(/^file:\/{0,2}/, ''); }
  if (/^\/[a-zA-Z]:[\\/]/.test(pathname)) pathname = pathname.slice(1);
  return safeDecode(pathname);
}
function normalizeFilePath(input) {
  if (!input) return '';
  let path = input.startsWith('file:') ? fileUriToPath(input) : safeDecode(input);
  path = path.replace(/\\/g, '/');
  const unc = path.startsWith('//');
  path = path.replace(/\/+/g, '/');
  if (unc) path = `/${path}`;
  if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '');
  return hasWindowsDriveLetter(path) ? path[0].toUpperCase() + path.slice(1) : path;
}
function pathToFileUri(input) {
  const normalized = normalizeFilePath(input);
  if (!normalized) return 'file:///';
  if (/^[a-zA-Z]:\//.test(normalized)) { const [drive, ...segments] = normalized.split('/'); return `file:///${drive}/${segments.map(encodeURIComponent).join('/')}`; }
  return `file://${normalized.split('/').map(encodeURIComponent).join('/')}`;
}
function pathsEqual(a, b) { return Boolean(a && b && normalizeFilePath(a) === normalizeFilePath(b)); }

module.exports = Object.freeze({ hasWindowsDriveLetter, safeDecode, fileUriToPath, normalizeFilePath, pathToFileUri, pathsEqual });
