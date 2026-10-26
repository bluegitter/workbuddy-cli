'use strict';

function maybeThrowSerializedError(result) {
  if (!result || typeof result !== 'object' || result.__wbError !== true) return;
  const error = new Error(result.message);
  error.name = 'WBError';
  if (result.code) error.code = result.code;
  if (result.source) error.source = result.source;
  if (result.httpStatus) error.httpStatus = result.httpStatus;
  throw error;
}

function createClient(namespace, invoke, options) {
  return createProxy(namespace, invoke, options?.callerId ? { callerId: options.callerId } : undefined);
}

function createProxy(path, invoke, context) {
  return new Proxy(() => {}, {
    get(_target, property) {
      if (property === 'then' || property === 'toJSON') return undefined;
      return createProxy(`${path}.${String(property)}`, invoke, context);
    },
    apply(_target, _thisArg, args) {
      const lastDot = path.lastIndexOf('.');
      return invoke(`wb:${path.slice(0, lastDot)}:${path.slice(lastDot + 1)}`, context, ...args).then((result) => {
        maybeThrowSerializedError(result);
        return result;
      });
    },
  });
}

module.exports = Object.freeze({ createClient, maybeThrowSerializedError });
