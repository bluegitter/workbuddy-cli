'use strict';

const DISABLE_REASON = 'ProductFeature.DisableTlsVerification';

class WorkbuddyTlsVerificationInterceptor {
  constructor({ productManager, suppressTlsRejectWarning = () => {}, disableTlsVerification = () => {}, productFeature = 'DisableTlsVerification', reason = DISABLE_REASON } = {}) {
    this.productManager = productManager;
    this.suppressTlsRejectWarning = suppressTlsRejectWarning;
    this.disableTlsVerification = disableTlsVerification;
    this.productFeature = productFeature;
    this.reason = reason;
  }

  async initialize() {
    this.suppressTlsRejectWarning();
    this.applyFromConfiguration();
    this.productManager?.configuration?.subscribe?.(() => this.applyFromConfiguration());
    return true;
  }

  applyFromConfiguration() {
    const configuration = this.productManager?.configuration?.getValue?.() || this.productManager?.getCurrentConfiguration?.() || {};
    if (configuration.productFeatures?.[this.productFeature]) this.disableTlsVerification(this.reason);
  }
}

module.exports = { DISABLE_REASON, WorkbuddyTlsVerificationInterceptor };
