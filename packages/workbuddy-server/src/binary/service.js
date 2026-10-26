'use strict';

class BinaryServiceImpl {
  constructor(logger, binaryManager) {
    this.logger = logger;
    this.binaryManager = binaryManager;
    this.status = 'idle';
    this.initError = undefined;
  }

  async initialize() {
    try {
      this.logger.info('Initializing Binary Service...');
      this.status = 'initializing';
      await this.binaryManager.initialize();
      this.logger.info('Binary detection completed');
      this.binaryManager.ensureRecommendedBinaries()
        .then(() => this.logger.info('Recommended binaries ensured'))
        .catch((error) => this.logger.warn(`Failed to ensure recommended binaries: ${error}`));
      this.status = 'ready';
      this.logger.info('Binary Service initialized successfully');
    } catch (error) {
      this.status = 'error';
      this.initError = String(error);
      this.logger.error(`Initialization failed: ${this.initError}`);
    }
  }

  async list() {
    try {
      return (await this.binaryManager.getAvailableBinaries()).map((info) => ({
        type: info.type,
        version: info.version ?? '',
        executablePath: info.executablePath ?? '',
        source: info.source === 'managed' ? 'managed' : 'system',
        verified: info.verified ?? false
      }));
    } catch (error) {
      this.logger.error(`Failed to list binaries: ${error}`);
      return [];
    }
  }

  getStatus() { return { status: this.status, initError: this.initError }; }

  async generatePromptContext() {
    try {
      const context = await this.binaryManager.generatePromptContext();
      if (context?.summary) return `${context.summary}\n${context.instructions}`;
    } catch (error) {
      this.logger.warn(`Failed to generate prompt context: ${error}`);
    }
    return null;
  }
}

module.exports = { BinaryServiceImpl };
