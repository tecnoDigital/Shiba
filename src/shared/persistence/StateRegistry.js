/**
 * @interface StateRegistry
 * Interfaz para gestionar el estado de diferentes módulos o características.
 * Permite almacenar, recuperar y eliminar datos clave-valor asociados a un contexto (ej. ID de grupo o usuario).
 */
class StateRegistry {
  /**
   * Almacena un valor para una clave dada dentro de un contexto específico.
   * @param {string} contextId - El identificador del contexto (ej. ID de grupo, ID de usuario).
   * @param {string} key - La clave bajo la cual se almacena el valor.
   * @param {any} value - El valor a almacenar.
   * @param {number} [ttlSeconds] - Tiempo de vida opcional en segundos.
   * @returns {Promise<void>}
   */
  async set(contextId, key, value, ttlSeconds) {
    throw new Error("Método 'set' no implementado.");
  }

  /**
   * Recupera un valor para una clave dada dentro de un contexto específico.
   * @param {string} contextId - El identificador del contexto.
   * @param {string} key - La clave del valor a recuperar.
   * @returns {Promise<any | null>}
   */
  async get(contextId, key) {
    throw new Error("Método 'get' no implementado.");
  }

  /**
   * Elimina un valor para una clave dada dentro de un contexto específico.
   * @param {string} contextId - El identificador del contexto.
   * @param {string} key - La clave del valor a eliminar.
   * @returns {Promise<void>}
   */
  async delete(contextId, key) {
    throw new Error("Método 'delete' no implementado.");
  }

  /**
   * Obtiene todas las claves para un contexto dado (opcional, útil para algunas implementaciones).
   * @param {string} contextId - El identificador del contexto.
   * @returns {Promise<string[]>}
   */
  async getKeys(contextId) {
    // Este método es opcional y podría no ser soportado por todas las implementaciones.
    logger.warn('[StateRegistry] getKeys no es soportado por defecto, implementar si es necesario.');
    return [];
    // throw new Error("Método 'getKeys' no implementado.");
  }

  /**
   * Limpia todos los datos de un contexto (opcional).
   * @param {string} contextId - El identificador del contexto.
   * @returns {Promise<void>}
   */
  async clearContext(contextId) {
    throw new Error("Método 'clearContext' no implementado.");
  }
}

export default StateRegistry; 