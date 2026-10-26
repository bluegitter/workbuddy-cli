'use strict';

function registerServiceHandlers(server, serviceName, service, options = {}, logger = console) {
  const channelMap = options.channelMap;
  const excluded = new Set(options.excludeMethods ?? []);
  const methods = [];
  const seen = new Set();

  const collect = (keys) => {
    for (const method of keys) {
      if (method === 'constructor' || excluded.has(method) || seen.has(method)) continue;
      seen.add(method);
      const fn = service[method];
      if (typeof fn !== 'function') continue;

      const channel = channelMap?.[method] ?? `${serviceName}:${method}`;
      methods.push(method);
      server.handle(channel, async (...args) => {
        const start = performance.now();
        try {
          const result = await fn.apply(service, args);
          logger.info?.(`${channel} OK ${(performance.now() - start).toFixed(1)}ms`);
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : error;
          logger.error?.(`${channel} FAIL ${(performance.now() - start).toFixed(1)}ms`, message);
          throw error;
        }
      });
    }
  };

  collect(Object.keys(service));
  let prototype = Object.getPrototypeOf(service);
  while (prototype && prototype !== Object.prototype) {
    collect(Object.getOwnPropertyNames(prototype));
    prototype = Object.getPrototypeOf(prototype);
  }
  logger.info?.(`${serviceName} registered (${methods.length} methods)`);
  return methods;
}

module.exports = Object.freeze({ registerServiceHandlers });
