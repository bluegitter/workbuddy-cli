'use strict';

/**
 * Renderer asset boundary.
 *
 * The renderer entry is a generated Vite artifact and is intentionally not
 * loaded by the maintainable agent-ui package.  Keeping its metadata here
 * lets packaging/launch code locate the published asset without coupling
 * runtime helpers to the 53k-line generated file.
 */
const RENDERER_ENTRY_ASSET = 'renderer/index.html';

const RENDERER_RUNTIME_DEPENDENCIES = Object.freeze([
  'react',
  'react-dom',
  'zustand',
]);

function resolveRendererAsset(rootDirectory) {
  const root = typeof rootDirectory === 'string' && rootDirectory.length > 0
    ? rootDirectory
    : process.cwd();
  return `${root.replace(/[\\/]$/, '')}/${RENDERER_ENTRY_ASSET}`;
}

module.exports = Object.freeze({
  RENDERER_ENTRY_ASSET,
  RENDERER_RUNTIME_DEPENDENCIES,
  resolveRendererAsset,
});
