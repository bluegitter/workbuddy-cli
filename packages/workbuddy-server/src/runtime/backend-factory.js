'use strict';

function indexBackends(options) {
  const backends = options?.backends || [];
  if (!backends.length) throw new Error('[backend] At least one backend must be configured');
  const backendsById = new Map(backends.map((backend) => [backend.id, backend]));
  if (backendsById.size !== backends.length) throw new Error('[backend] Duplicate backend ids are not allowed');
  return { backendsById, defaultBackendId: options.defaultBackendId ?? backends[0].id };
}

function createBackend(options, { backendId, ...params }) {
  const { backendsById, defaultBackendId } = indexBackends(options);
  const selectedId = backendId ?? defaultBackendId;
  const backend = backendsById.get(selectedId);
  if (!backend) throw new Error(`[backend] Unknown backend "${selectedId}". Available: ${[...backendsById.keys()].join(', ')}`);
  return backend.create(params);
}

function createListBackends(options) {
  const { defaultBackendId } = indexBackends(options);
  return () => (options.backends || []).map((backend) => ({ id: backend.id, name: backend.name, capabilities: { ...backend.capabilities }, isDefault: backend.id === defaultBackendId }));
}

function createBackendRegistry(options) {
  const normalized = { backends: options?.backends || [], defaultBackendId: options?.defaultBackendId };
  indexBackends(normalized);
  return { create: (params) => createBackend(normalized, params), list: createListBackends(normalized), options: normalized };
}

module.exports = Object.freeze({ indexBackends, createBackend, createListBackends, createBackendRegistry });
