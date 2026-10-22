# Recovered CLI modules

`module-*.js` are the individual CommonJS module bodies recovered from the
Rspack `codebuddy.js` table. They retain the original module contract so the
runtime bundle remains authoritative, while each module can be inspected and
documented independently. `manifest.json` records module IDs and byte sizes.
