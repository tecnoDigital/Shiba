export default class ExperienciaHandler {
  static async handleEntry(chatId, message, llmService, senderQueue) {
    // Módulo experiencia - aún no implementado
    await senderQueue.enqueue(chatId, 'Módulo experiencia aún no disponible.');
  }
}