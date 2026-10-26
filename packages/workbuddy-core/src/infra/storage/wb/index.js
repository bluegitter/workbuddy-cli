'use strict';

const NS_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

function validateNamespaceName(name) {
  if (!NS_NAME_PATTERN.test(name)) throw new Error(`[wb.storage] Invalid namespace name "${name}".`);
}

function parsePath(path) {
  const index = path.indexOf(':');
  return index === -1 ? [path, undefined] : [path.slice(0, index), path.slice(index + 1)];
}

function parsePathRequireKey(path) {
  const [namespace, key] = parsePath(path);
  if (!key) throw new Error(`[wb.storage] Path "${path}" must contain both namespace and key (format: "ns:key").`);
  validateNamespaceName(namespace);
  return [namespace, key];
}

function createWBStorageFromFacade(facade) {
  return { device: createScopeImpl(facade, 'device'), user: createScopeImpl(facade, 'user') };
}

function createScopeImpl(facade, scope) {
  return {
    ns(name) { validateNamespaceName(name); return createNamespaceImpl(facade, scope, name); },
    async get(path, defaultValue) { const [ns, key] = parsePathRequireKey(path); const value = await facade.get(scope, ns, key); return value === undefined ? defaultValue : value; },
    async set(path, value) { const [ns, key] = parsePathRequireKey(path); await facade.set(scope, ns, key, value); },
    async delete(path) { const [ns, key] = parsePathRequireKey(path); await facade.delete(scope, ns, key); },
    async has(path) { const [ns, key] = parsePathRequireKey(path); return facade.has(scope, ns, key); },
    async keys(prefix) { validateNamespaceName(prefix); return facade.keys(scope, prefix); },
    async clear(prefix) { validateNamespaceName(prefix); await facade.clear(scope, prefix); },
    async namespaces() { return facade.namespaces(scope); },
    async removeNamespace(name) { validateNamespaceName(name); await facade.removeNamespace(scope, name); },
    async clearAll() { await facade.clearAll(scope); },
  };
}

function createNamespaceImpl(facade, scope, namespace) {
  return {
    get: (key, defaultValue) => facade.get(scope, namespace, key).then((value) => value === undefined ? defaultValue : value),
    set: (key, value) => facade.set(scope, namespace, key, value),
    delete: (key) => facade.delete(scope, namespace, key),
    has: (key) => facade.has(scope, namespace, key),
    keys: () => facade.keys(scope, namespace),
    clear: () => facade.clear(scope, namespace),
  };
}

module.exports = Object.freeze({ NS_NAME_PATTERN, validateNamespaceName, parsePath, parsePathRequireKey, createWBStorageFromFacade });
