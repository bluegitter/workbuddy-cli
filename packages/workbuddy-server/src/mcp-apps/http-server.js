'use strict';

const ROUTE_PREFIX = '/mcp-apps/';
const APP_HTML_SUFFIX = '/app.html';

function sanitizeCspDomains(domains) {
  if (!Array.isArray(domains)) return [];
  return domains.filter((domain) => typeof domain === 'string' && !/[;\r\n'" ]/.test(domain));
}

function buildCsp(ui) {
  const resourceDomains = sanitizeCspDomains(ui?.csp?.resourceDomains).join(' ');
  const connectDomains = sanitizeCspDomains(ui?.csp?.connectDomains).join(' ');
  const frameDomains = sanitizeCspDomains(ui?.csp?.frameDomains).join(' ');
  const baseUriDomains = sanitizeCspDomains(ui?.csp?.baseUriDomains).join(' ');
  return [
    "default-src 'self' 'unsafe-inline'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: ${resourceDomains}`.trim(),
    `style-src 'self' 'unsafe-inline' blob: data: ${resourceDomains}`.trim(),
    `img-src 'self' data: blob: ${resourceDomains}`.trim(),
    `font-src 'self' data: blob: ${resourceDomains}`.trim(),
    `media-src 'self' data: blob: ${resourceDomains}`.trim(),
    `connect-src 'self' ${connectDomains}`.trim(),
    `worker-src 'self' blob: ${resourceDomains}`.trim(),
    frameDomains ? `frame-src ${frameDomains}` : "frame-src 'none'",
    "object-src 'none'",
    baseUriDomains ? `base-uri ${baseUriDomains}` : "base-uri 'none'"
  ].join('; ');
}

function extractInstanceIdFromPath(pathname) {
  if (!pathname.startsWith(ROUTE_PREFIX)) return undefined;
  const rest = pathname.slice(ROUTE_PREFIX.length);
  if (!rest.endsWith(APP_HTML_SUFFIX)) return undefined;
  const id = rest.slice(0, -APP_HTML_SUFFIX.length);
  return id.length > 0 ? id : undefined;
}

class McpAppsHttpServer {
  constructor(resolver, staticHtml, tmapProxy, sandboxPreview) {
    this.resolver = resolver;
    this.staticHtml = staticHtml;
    this.tmapProxy = tmapProxy;
    this.sandboxPreview = sandboxPreview;
    this.attached = false;
    this.previousListeners = [];
    this.combinedListener = undefined;
  }

  attach(server) {
    if (this.attached) return;
    this.attached = true;
    this.previousListeners = [...server.listeners('request')];
    server.removeAllListeners('request');
    this.combinedListener = (req, res) => {
      if (this.tmapProxy?.tryHandle(req, res)) return;
      if (this.staticHtml?.tryHandle(req, res)) return;
      if (this.sandboxPreview?.tryHandle(req, res)) return;
      if (this.tryHandleMcpAppsRequest(req, res)) return;
      for (const listener of this.previousListeners) {
        try { listener(req, res); } catch (error) { console.error('[McpAppsHttpServer] delegated listener threw:', error); }
        if (res.writableEnded) return;
      }
      if (!res.writableEnded) { res.writeHead(404); res.end(); }
    };
    server.on('request', this.combinedListener);
  }

  tryHandleMcpAppsRequest(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (!url.pathname.startsWith(ROUTE_PREFIX)) return false;
      const instanceId = extractInstanceIdFromPath(url.pathname);
      if (!instanceId) return this.respondNotFound(res, 'Not Found');
      const instance = this.resolver.getInstance(instanceId);
      if (!instance || !instance.html) return this.respondNotFound(res, 'MCP App instance not found or not loaded');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': buildCsp(instance.uiMetadata),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0'
      });
      res.end(instance.html);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`MCP Apps HTTP error: ${message}`);
      return true;
    }
  }

  respondNotFound(res, message) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(message);
    return true;
  }
}

module.exports = Object.freeze({ ROUTE_PREFIX, APP_HTML_SUFFIX, sanitizeCspDomains, buildCsp, extractInstanceIdFromPath, McpAppsHttpServer });
