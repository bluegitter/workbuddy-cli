# Renderer source map

The renderer build is already emitted as Vite/Rspack chunks under
`extracted-app/renderer/assets`. `renderer-entry.js` is the formatted entry
source and the neighboring asset chunks are the responsibility-separated
modules (ACP, providers, chat panes, artifact views, and UI primitives).
