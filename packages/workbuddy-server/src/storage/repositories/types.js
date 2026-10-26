'use strict';
const path = require('node:path');
function canonicalizeStoredPath(value) { return value ? path.normalize(value) : value; }
module.exports = Object.freeze({ canonicalizeStoredPath });
