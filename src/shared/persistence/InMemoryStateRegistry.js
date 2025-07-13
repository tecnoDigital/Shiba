import StateRegistry from './StateRegistry.js';
import logger from '../../utils/logger.js';

class InMemoryStateRegistry extends StateRegistry {
  constructor() {
    super();
    this.storage = new Map(); // Map principal para contextos
    logger.info('[InMemoryStateRegistry] Inicializado.');
  }

  _getContextStorage(contextId) {
    if (!this.storage.has(contextId)) {
      this.storage.set(contextId, new Map());
    }
    return this.storage.get(contextId);
  }

  async set(contextId, key, value, ttlSeconds) {
    const contextStore = this._getContextStorage(contextId);
    contextStore.set(key, { value, timestamp: Date.now(), ttl: ttlSeconds });
    logger.debug(`[InMemoryStateRegistry] Set: ${contextId}.${key}`);
  }

  async get(contextId, key) {
    const contextStore = this._getContextStorage(contextId);
    const record = contextStore.get(key);

    if (record) {
      if (record.ttl) {
        const expiryTime = record.timestamp + record.ttl * 1000;
        if (Date.now() > expiryTime) {
          logger.debug(`[InMemoryStateRegistry] Get (expired): ${contextId}.${key}`);
          contextStore.delete(key);
          return null;
        }
      }
      logger.debug(`[InMemoryStateRegistry] Get: ${contextId}.${key}`);
      return record.value;
    }
    logger.debug(`[InMemoryStateRegistry] Get (miss): ${contextId}.${key}`);
    return null;
  }

  async delete(contextId, key) {
    const contextStore = this._getContextStorage(contextId);
    contextStore.delete(key);
    logger.debug(`[InMemoryStateRegistry] Delete: ${contextId}.${key}`);
  }

  async getKeys(contextId) {
    if (this.storage.has(contextId)) {
      return Array.from(this.storage.get(contextId).keys());
    }
    return [];
  }

  async clearContext(contextId) {
    if (this.storage.has(contextId)) {
      this.storage.delete(contextId);
      logger.info(`[InMemoryStateRegistry] Contexto limpiado: ${contextId}`);
    }
  }
}

export default InMemoryStateRegistry; 