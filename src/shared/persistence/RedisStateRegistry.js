import Redis from 'ioredis';
import StateRegistry from './StateRegistry.js';
import logger from '../../utils/logger.js';

class RedisStateRegistry extends StateRegistry {
  constructor(redisUrl) {
    super();
    this.redis = new Redis(redisUrl || process.env.REDIS_URL);
    this.redis.on('connect', () => logger.info('[RedisStateRegistry] Conectado a Redis.'));
    this.redis.on('error', (err) => logger.error('[RedisStateRegistry] Error de Redis:', err));
  }

  _getRedisKey(contextId, key) {
    return `state:${contextId}:${key}`;
  }

  async set(contextId, key, value, ttlSeconds) {
    const redisKey = this._getRedisKey(contextId, key);
    const stringValue = JSON.stringify(value);
    if (ttlSeconds) {
      await this.redis.set(redisKey, stringValue, 'EX', ttlSeconds);
    } else {
      await this.redis.set(redisKey, stringValue);
    }
    logger.debug(`[RedisStateRegistry] Set: ${redisKey}`);
  }

  async get(contextId, key) {
    const redisKey = this._getRedisKey(contextId, key);
    const stringValue = await this.redis.get(redisKey);
    if (stringValue) {
      logger.debug(`[RedisStateRegistry] Get: ${redisKey}`);
      return JSON.parse(stringValue);
    }
    logger.debug(`[RedisStateRegistry] Get (miss): ${redisKey}`);
    return null;
  }

  async delete(contextId, key) {
    const redisKey = this._getRedisKey(contextId, key);
    await this.redis.del(redisKey);
    logger.debug(`[RedisStateRegistry] Delete: ${redisKey}`);
  }

  async getKeys(contextId) {
    const pattern = `state:${contextId}:*`;
    const keys = await this.redis.keys(pattern);
    // Quitar el prefijo "state:contextId:"
    return keys.map(k => k.substring(`state:${contextId}:`.length));
  }

  async clearContext(contextId) {
    const pattern = `state:${contextId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(keys);
      logger.info(`[RedisStateRegistry] Contexto limpiado: ${contextId} (${keys.length} claves eliminadas)`);
    }
  }

  // Es buena práctica cerrar la conexión cuando la aplicación termina
  async disconnect() {
    await this.redis.quit();
    logger.info('[RedisStateRegistry] Desconectado de Redis.');
  }
}

export default RedisStateRegistry; 