'use strict';

function normalizeAgentPath(value) {
  const segments = String(value).split('/');
  const result = [];
  for (const segment of segments) {
    if (segment === '..') { if (result.length && result[result.length - 1] !== '') result.pop(); }
    else if (segment !== '.' && segment !== '') result.push(segment);
  }
  return `${String(value).startsWith('/') ? '/' : ''}${result.join('/')}`;
}

function resolveAgentUri(input) {
  if (typeof input !== 'string' || !input.startsWith('agent://')) return input;
  const rawPath = input.slice(8);
  if (!rawPath.startsWith('/')) return input;
  const normalized = normalizeAgentPath(rawPath);
  if (rawPath === '/plans' || rawPath.startsWith('/plans/')) {
    const resolved = normalizeAgentPath(`/root/.codebuddy${normalized}`);
    if (!resolved.startsWith('/root/.codebuddy/plans')) throw new Error(`Invalid path: path traversal detected in ${input}`);
    return resolved;
  }
  return normalized;
}

function createAgentFilesystem(filesystem) {
  const resolve = resolveAgentUri;
  return {
    read: (path, options) => filesystem.read(resolve(path), options),
    write: (pathOrFiles, dataOrOptions, options) => Array.isArray(pathOrFiles) ? filesystem.write(pathOrFiles.map((file) => ({ ...file, path: resolve(file.path) })), dataOrOptions) : filesystem.write(resolve(pathOrFiles), dataOrOptions, options),
    list: (path, options) => filesystem.list(resolve(path), options),
    exists: (path, options) => filesystem.exists(resolve(path), options),
    makeDir: (path, options) => filesystem.makeDir(resolve(path), options),
    remove: (path, options) => filesystem.remove(resolve(path), options),
    rename: (oldPath, newPath, options) => filesystem.rename(resolve(oldPath), resolve(newPath), options),
    getInfo: (path, options) => filesystem.getInfo(resolve(path), options),
    watchDir: (path, onEvent, options) => filesystem.watchDir(resolve(path), onEvent, options),
  };
}

module.exports = Object.freeze({ normalizeAgentPath, resolveAgentUri, createAgentFilesystem });
