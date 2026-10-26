'use strict';

// Compatibility facade for callers that historically imported all recall primitives together.
module.exports = Object.freeze({
  ...require('./recall-cache-store'),
  ...require('./candidate-allowlist'),
  ...require('./candidate-augmentation'),
  ...require('./bm25'),
  ...require('./recall-index'),
  ...require('./rate-limiter'),
  ...require('./recall-warmup'),
  ...require('./candidate-provider'),
  ...require('./service')
});
