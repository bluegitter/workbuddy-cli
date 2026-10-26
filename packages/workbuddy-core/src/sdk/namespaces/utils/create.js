'use strict';

const { createFeedback } = require('./feedback');
const { createSwr } = require('./swr');

function createUtilsNamespace(getSdk) {
  const feedback = createFeedback(getSdk);
  return {
    get feedback() { return feedback; },
    swr: createSwr(() => {
      try { return getSdk().storage?.device?.ns('swr'); } catch { return undefined; }
    }),
  };
}

module.exports = Object.freeze({ createUtilsNamespace });
