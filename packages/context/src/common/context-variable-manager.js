'use strict';

const ContextVariablePriority = Object.freeze({ High: 10, Normal: 5, Fallback: 1, Disabled: 0 });

function defaultLogger() {
  return { info() {}, debug() {}, error() {} };
}

class ContextVariableManager {
  constructor({ resolvers = [], collectionResolvers = [], logger = defaultLogger() } = {}) {
    this.contextVariableResolvers = [...resolvers];
    this.collectionContextVariableResolvers = [...collectionResolvers];
    this.logger = logger;
  }

  init() { this.logger.info('ContextVariableManagerImpl'); }

  registerContextVariableResolver(resolver) {
    if (resolver && typeof resolver === 'object') this.collectionContextVariableResolvers.push(resolver);
  }

  async getContextVariable(definition, context) {
    return (await this.resolveContextVariables([definition], context))[0];
  }

  async getContextVariables(definitions, context) {
    return this.resolveContextVariables([...definitions || []], context);
  }

  async getContextVariablesMap(definitions, context) {
    const values = await this.getContextVariables(definitions, context);
    return values.reduce((result, item) => {
      if (item && item.name) result[item.name] = item.value;
      return result;
    }, {});
  }

  async resolveContextVariables(definitions, context) {
    const result = [];
    for (const definition of definitions) {
      if (!definition || !definition.name) continue;
      const resolver = await this.getResolver(definition, context);
      if (!resolver) continue;
      const startedAt = Date.now();
      try {
        const value = await resolver.resolve(definition, context);
        this.logger.debug(`Resolved context variable: ${definition.name} (${Date.now() - startedAt}ms)`);
        if (value) result.push(value);
      } catch (error) {
        this.logger.error(`Failed to resolve ${definition.name} context variable: ${error}`);
      }
    }
    return result;
  }

  async getResolver(definition, context) {
    return (await this.prioritizeResolvers(definition, context))[0];
  }

  getResolvers(name) {
    return [...this.contextVariableResolvers, ...this.collectionContextVariableResolvers]
      .filter((resolver) => resolver && resolver.name === name);
  }

  async prioritizeResolvers(definition, context) {
    const scored = [];
    for (const resolver of this.getResolvers(definition.name)) {
      let priority = 0;
      try { priority = Number(await resolver.priority(definition, context)); } catch { priority = 0; }
      if (Number.isFinite(priority) && priority > 0) scored.push({ resolver, priority });
    }
    return scored.sort((left, right) => right.priority - left.priority).map(({ resolver }) => resolver);
  }
}

module.exports = { ContextVariableManager, ContextVariableManagerImpl: ContextVariableManager, ContextVariablePriority };
