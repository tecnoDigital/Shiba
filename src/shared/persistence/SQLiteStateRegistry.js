import Database from 'better-sqlite3';
import StateRegistry from './StateRegistry.js';
import logger from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.SQLITE_PATH || './shiba_state.db';

// Asegurarse de que el directorio para la DB exista
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  logger.info(`[SQLiteStateRegistry] Directorio creado para la base de datos: ${dbDir}`);
}

class SQLiteStateRegistry extends StateRegistry {
  constructor(dbPath) {
    super();
    this.db = new Database(dbPath || DB_PATH);
    logger.info(`[SQLiteStateRegistry] Conectado a SQLite: ${dbPath || DB_PATH}`);

    // Crear tabla si no existe
    this.db.exec('CREATE TABLE IF NOT EXISTS state (context_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, created_at INTEGER NOT NULL, ttl_seconds INTEGER, PRIMARY KEY (context_id, key))');
    logger.info('[SQLiteStateRegistry] Tabla \'state\' asegurada.');

    // Preparar statements
    this.stmtSet = this.db.prepare(
      'INSERT OR REPLACE INTO state (context_id, key, value, created_at, ttl_seconds) VALUES (?, ?, ?, ?, ?)'
    );
    this.stmtGet = this.db.prepare(
      'SELECT value, created_at, ttl_seconds FROM state WHERE context_id = ? AND key = ?'
    );
    this.stmtDelete = this.db.prepare('DELETE FROM state WHERE context_id = ? AND key = ?');
    this.stmtGetKeys = this.db.prepare('SELECT key FROM state WHERE context_id = ?');
    this.stmtClearContext = this.db.prepare('DELETE FROM state WHERE context_id = ?');
    this.stmtPruneExpired = this.db.prepare(
        'DELETE FROM state WHERE ttl_seconds IS NOT NULL AND (created_at + ttl_seconds * 1000) < ?'
    );

    // Prune expired keys periodically or on init
    this._pruneExpired();
    setInterval(() => this._pruneExpired(), 60 * 60 * 1000); // Cada hora
  }

  _pruneExpired() {
    try {
      const now = Date.now();
      const result = this.stmtPruneExpired.run(now);
      if (result.changes > 0) {
        logger.info(`[SQLiteStateRegistry] Claves expiradas eliminadas: ${result.changes}`);
      }
    } catch (error) {
      logger.error('[SQLiteStateRegistry] Error eliminando claves expiradas:', error);
    }
  }

  async set(contextId, key, value, ttlSeconds) {
    const stringValue = JSON.stringify(value);
    const now = Date.now();
    this.stmtSet.run(contextId, key, stringValue, now, ttlSeconds || null);
    logger.debug(`[SQLiteStateRegistry] Set: ${contextId}.${key}`);
  }

  async get(contextId, key) {
    const row = this.stmtGet.get(contextId, key);
    if (row) {
      if (row.ttl_seconds) {
        const expiryTime = row.created_at + row.ttl_seconds * 1000;
        if (Date.now() > expiryTime) {
          logger.debug(`[SQLiteStateRegistry] Get (expired): ${contextId}.${key}`);
          this.stmtDelete.run(contextId, key); // Eliminar si está expirado
          return null;
        }
      }
      logger.debug(`[SQLiteStateRegistry] Get: ${contextId}.${key}`);
      return JSON.parse(row.value);
    }
    logger.debug(`[SQLiteStateRegistry] Get (miss): ${contextId}.${key}`);
    return null;
  }

  async delete(contextId, key) {
    this.stmtDelete.run(contextId, key);
    logger.debug(`[SQLiteStateRegistry] Delete: ${contextId}.${key}`);
  }

  async getKeys(contextId) {
    const rows = this.stmtGetKeys.all(contextId);
    return rows.map(r => r.key);
  }

  async clearContext(contextId) {
    const result = this.stmtClearContext.run(contextId);
    logger.info(`[SQLiteStateRegistry] Contexto limpiado: ${contextId} (${result.changes} claves eliminadas)`);
  }

  // Cerrar la conexión a la base de datos al finalizar la aplicación
  close() {
    if (this.db) {
      this.db.close();
      logger.info('[SQLiteStateRegistry] Conexión SQLite cerrada.');
    }
  }
}

export default SQLiteStateRegistry; 