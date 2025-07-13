import logger from '../../utils/logger.js';
import { sendPoll } from '../../services/SurveyManager.js';
import { registerListener } from '../../services/SurveyListener.js';

export default class HelpHandler {
  constructor(senderQueue, moduleLogger = logger) {
    this.senderQueue = senderQueue;
    this.logger = moduleLogger;
    this.logger.debug(`[HelpHandler] Constructor: senderQueue recibido. Tipo: ${typeof senderQueue}. Tiene enqueue: ${typeof senderQueue?.enqueue === 'function'}`);
    if (!senderQueue || typeof senderQueue.enqueue !== 'function') {
      this.logger.error(`[HelpHandler] ERROR: senderQueue proporcionado a HelpHandler es inválido. No tiene el método enqueue.`);
    }
  }

  /**
   * Maneja el comando !help.
   * Solo responde si el mensaje proviene de un chat directo (DM).
   * @param {import('whatsapp-web.js').Message} originalMessage El mensaje original que activó el comando.
   * @param {object} messageData Datos parseados del mensaje original.
   */
  async handleCommand(originalMessage, messageData) {
    const chatId = messageData.chat_id;

    // Verificar si senderQueue es válido antes de intentar usarlo
    if (!this.senderQueue || typeof this.senderQueue.enqueue !== 'function') {
      this.logger.error(`[HelpHandler] No se puede procesar el comando: senderQueue es inválido. ChatId: ${chatId}`);
      return; // Previene el crash
    }

    // Verificar si es un chat privado (DM)
    // Los JIDs de usuario terminan en @c.us
    // Los JIDs de grupo terminan en @g.us
    if (chatId && chatId.endsWith('@c.us')) {
      const chat = await originalMessage.getChat();
      const surveyQuestion = "Por favor, califica tu experiencia:";
      const pollOptions = ["A", "B"];

      const pollId = await sendPoll(chat, surveyQuestion, pollOptions);

      registerListener(pollId, messageData.author_id, async (selectedLocalId) => {
        let responseMessage = "";
        // Assuming 'A' corresponds to localId 0 and 'B' to localId 1
        if (selectedLocalId === 0) {
          responseMessage = "Mensaje A";
        } else if (selectedLocalId === 1) {
          responseMessage = "Mensaje B";
        } else {
          responseMessage = "Tu respuesta no fue 'A' ni 'B'. Gracias por tu feedback de todos modos.";
        }
        this.senderQueue.enqueue(chatId, responseMessage);
        this.logger.info(`[HelpHandler] Respuesta a encuesta procesada para ${chatId}. Mensaje: ${responseMessage}`);
      });

      this.logger.info(`[HelpHandler] Comando !help procesado para ${chatId} (DM). Encuesta enviada.`);
    } else {
      // Opcional: Log si se intenta usar !help fuera de un DM
      this.logger.debug(`[HelpHandler] Comando !help ignorado para ${chatId} (no es DM).`);
      // No enviamos respuesta si no es DM, según el requisito.
    }
  }
}
