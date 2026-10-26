'use strict';

function createWBConfigFromFacade(facade) {
  return {
    preferences: {
      get: (key) => facade.getPreference(key),
      set: (key, value) => facade.setPreference(key, value),
      reset: () => facade.resetPreferences(),
      getTheme: () => facade.getPreference('theme'),
      setTheme: (value) => facade.setPreference('theme', value),
      getLanguage: () => facade.getPreference('language'),
      setLanguage: (value) => facade.setPreference('language', value),
    },
    get features() {
      return facade.getFeatures();
    },
    isFeatureEnabled: (key) => facade.isFeatureEnabled(key),
  };
}

module.exports = Object.freeze({ createWBConfigFromFacade });
