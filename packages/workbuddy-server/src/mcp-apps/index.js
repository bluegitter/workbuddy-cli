'use strict';

const crypto = require('node:crypto');
const { McpAppCatalog } = require('./catalog');
const { AppResolver } = require('./resolver');
const { AppGatewayService } = require('./gateway');
const { registerMcpAppsHandlers, MCP_APPS_CHANNELS } = require('./handlers');
const { StaticHtmlHttpServer } = require('./static-html-server');
const { TmapProxyHandler, createDevTmapProxyFetch } = require('./tmap-proxy');
const { McpAppsHttpServer } = require('./http-server');

function createMcpAppsHost(options) {
  const { proxy, server, httpServer, ardotAuthService, logger = console, resolveBundledAsset, mediaArtifactService, rawSink, tmapProxyFetch } = options;
  const proxySecret = crypto.randomBytes(16).toString('hex');
  const catalog = new McpAppCatalog({
    proxy,
    resolveConfigId: (name) => proxy.findConfigIdForTool?.(name),
    resolveOriginalToolName: (name, configId) => {
      if (!proxy.getClientEntry?.(configId)) return undefined;
      const prefix = `${configId.split(':').at(-1)}_`;
      return name.startsWith(prefix) ? name.slice(prefix.length) : name;
    }
  });
  const resolver = new AppResolver(proxy);
  const getHttpPort = () => { const address = httpServer?.address?.(); return address && typeof address === 'object' ? address.port : 0; };
  const gateway = new AppGatewayService({ catalog, resolver, proxy, ardotAuthService, logger, getHttpPort, resolveBundledAsset, mediaArtifactService, rawSink });
  const staticHtml = httpServer ? new StaticHtmlHttpServer(getHttpPort, proxySecret) : undefined;
  const devKey = process.env.TMAP_DEV_KEY;
  const fetchTmap = devKey ? createDevTmapProxyFetch(devKey) : tmapProxyFetch;
  const tmap = fetchTmap ? new TmapProxyHandler(fetchTmap, proxySecret) : undefined;
  const httpHost = new McpAppsHttpServer({ getInstance: (id) => gateway.getInstance(id) }, staticHtml, tmap);
  if (httpServer) httpHost.attach(httpServer);
  catalog.start();
  const unregister = registerMcpAppsHandlers({ registry: server, gateway, subscribeCatalog: (listener) => catalog.onChanged(listener) });
  return {
    channels: MCP_APPS_CHANNELS,
    catalog,
    resolver,
    gateway,
    staticHtmlServer: staticHtml,
    stop() { unregister(); catalog.stop(); }
  };
}

module.exports = Object.freeze({ createMcpAppsHost });
