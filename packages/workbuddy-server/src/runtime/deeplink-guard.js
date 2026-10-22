'use strict';

function isDomainObjectDeeplink(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return false; }
  const protocol = url.protocol.toLowerCase();
  if (protocol === 'http:' || protocol === 'https:') return false;
  return url.hostname.toLowerCase() === 'task' && (url.searchParams.get('action') || '').toLowerCase() === 'start';
}

module.exports = { isDomainObjectDeeplink };
