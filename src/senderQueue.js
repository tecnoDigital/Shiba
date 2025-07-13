// src/senderQueue.js
import logger from './utils/logger.js';

class SenderQueue {
  constructor(client) {
    this.client = client;
    this.queue = [];
    this.isProcessing = false;
    // Idealmente, usaríamos queueManager aquí si es necesario
  }

  enqueue(chatId, message, options = {}) {
    this.queue.push({ chatId, message, options });
    logger.info(`[SenderQueue] Mensaje encolado para ${chatId}`);
    this._processQueue();
  }

  async _processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }
    this.isProcessing = true;

    const { chatId, message, options } = this.queue.shift();

    try {
      logger.info(`[SenderQueue] Enviando mensaje a ${chatId}`);
      await this.client.sendMessage(chatId, message, options);
      logger.info(`[SenderQueue] Mensaje enviado exitosamente a ${chatId}`);
    } catch (error) {
      logger.error(`[SenderQueue] Error enviando mensaje a ${chatId}:`, error);
      // Aquí se podría implementar una lógica de reintentos o mover a una cola de fallidos
    }

    this.isProcessing = false;
    // Procesar el siguiente si hay más en la cola
    if (this.queue.length > 0) {
      this._processQueue();
    }
  }
}

export default SenderQueue;
