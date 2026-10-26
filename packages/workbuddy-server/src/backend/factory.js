'use strict';

function indexBackends(options) {
  if (!options.backends?.length) throw new Error('[backend] At least one backend must be configured');
  const backendsById = new Map(options.backends.map((backend) => [backend.id, backend]));
  if (backendsById.size !== options.backends.length) throw new Error('[backend] Duplicate backend ids are not allowed');
  return { backendsById, defaultBackendId: options.defaultBackendId ?? options.backends[0].id };
}
function createBackend(options, { backendId, ...params }) {
  const { backendsById, defaultBackendId } = indexBackends(options);
  const backend = backendsById.get(backendId ?? defaultBackendId);
  if (backend) return backend.create(params);
  throw new Error(`[backend] Unknown backend "${backendId ?? defaultBackendId}". Available: ${[...backendsById.keys()].join(', ')}`);
}
function createListBackends(options) {
  const { defaultBackendId } = indexBackends(options);
  return () => options.backends.map((backend) => ({ id: backend.id, name: backend.name, capabilities: { ...backend.capabilities }, isDefault: backend.id === defaultBackendId }));
}
module.exports = Object.freeze({ indexBackends, createBackend, createListBackends });
