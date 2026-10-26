'use strict';

function replaceLocalPathsInMessages(messages, artifactUrlMap) {
  if (artifactUrlMap.size === 0) return messages;
  const byBasename = new Map();
  for (const [key, value] of artifactUrlMap) {
    const basename = key.replace(/\\/g, '/').split('/').pop();
    if (basename) byBasename.set(basename, value.url);
  }
  const looksLikePath = (value) => /[\\/]/.test(value)
    || /^\.{1,2}\//.test(value)
    || /^~\//.test(value)
    || /^[A-Za-z]:[\\/]/.test(value);
  const resolveString = (value) => {
    const direct = artifactUrlMap.get(value);
    if (direct) return direct.url;
    if (!looksLikePath(value)) return undefined;
    const basename = value.replace(/\\/g, '/').split('/').pop();
    return basename ? byBasename.get(basename) : undefined;
  };
  const walk = (node) => {
    if (typeof node === 'string') return resolveString(node) ?? node;
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const output = {};
      for (const key of Object.keys(node)) output[key] = walk(node[key]);
      return output;
    }
    return node;
  };
  return messages.map(walk);
}

function detectHostTheme(document = globalThis.document) {
  const root = document?.documentElement;
  const body = document?.body;
  const themeKind = root?.getAttribute('data-vscode-theme-kind');
  if (themeKind === 'vscode-light') return 'light';
  if (themeKind?.includes('dark')) return 'dark';
  if (body?.classList.contains('light') || root?.classList.contains('light')) return 'light';
  if (body?.classList.contains('dark') || root?.classList.contains('dark')) return 'dark';
  return 'light';
}

module.exports = Object.freeze({ replaceLocalPathsInMessages, detectHostTheme });
