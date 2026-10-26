'use strict';

function getHostPlatform() { return globalThis.__hostPlatform; }
function getHostPlatformInfo() { return getHostPlatform(); }

module.exports = Object.freeze({ getHostPlatform, getHostPlatformInfo });
