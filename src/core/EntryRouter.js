

import ExperienciaHandler from '../modules/experiencia/ExperienciaHandler.js';


export default class EntryRouter {
  constructor({ llmService, senderQueue }) {
    this.llm = llmService;
    this.queue = senderQueue;
  }

  async dispatch(chatId, message) {
    // Derive rawText safely
    const rawText = typeof message === 'string' ? message : (message.body || '');
    const txt = rawText.trim().toLowerCase();

    if (txt.startsWith('!experiencia')) return ExperienciaHandler.handleEntry(chatId, message, this.llm, this.queue);

    // Fallback response for unhandled messages
    return this.queue.enqueue(chatId, 'No entendí tu solicitud. ¿Puedes reformular?');
  }
}