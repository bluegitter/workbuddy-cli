'use strict';
function isPoiMapEnabled(productManager, logger) { const merged = productManager.configuration?.getValue?.()?.productFeatures; const current = productManager.getCurrentConfiguration?.()?.productFeatures; const features = merged ?? current; const enabled = features?.PoiMap === true; logger?.info?.(`[PoiMapGate] poiMap=${enabled} source=${merged ? 'configuration' : current ? 'getCurrentConfiguration' : 'none'}`); return enabled; }
module.exports = Object.freeze({ isPoiMapEnabled });
