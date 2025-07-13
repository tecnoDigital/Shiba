import logger from '../../utils/logger.js'; // Ajusta la ruta si es necesario

export default class PrivateMessageHandler {
  constructor(client, senderQueue, moduleLogger = logger) {
    this.client = client;
    this.senderQueue = senderQueue;
    this.logger = moduleLogger;
  }

  /**
   * Maneja el comando para enviar un mensaje privado.
   * Formato esperado: !pm <recipientJid> <mensaje...>
   * @param {import('whatsapp-web.js').Message} originalMessage El mensaje original que activó el comando.
   * @param {object} messageData Datos parseados del mensaje original.
   * @param {string[]} args Argumentos del comando. args[0] es recipientJid, el resto es el mensaje.
   */
  async handleCommand(originalMessage, messageData, args) {
    const senderJid = originalMessage.from;

    if (args.length < 2) {
      this.senderQueue.enqueue(senderJid, "⚠️ Uso incorrecto. Formato: `!pm <ID_Destinatario> <Tu Mensaje>`\nEjemplo: `!pm 1234567890@c.us Hola, ¿cómo estás?`");
      this.logger.warn(`[PrivateMessage] Comando !pm llamado incorrectamente por ${senderJid}. Args: ${args.join(' ')}`);
      return;
    }

    const recipientJid = args[0];
    const privateMessageText = args.slice(1).join(' ');

    if (!recipientJid.endsWith('@c.us')) {
      this.senderQueue.enqueue(senderJid, `⚠️ El ID del destinatario '${recipientJid}' no parece válido. Debe ser un número de teléfono seguido de @c.us (ej: 521XXXXXXXXXX@c.us).`);
      this.logger.warn(`[PrivateMessage] JID inválido proporcionado por ${senderJid}: ${recipientJid}`);
      return;
    }

    if (recipientJid === senderJid) {
        this.senderQueue.enqueue(senderJid, "🤨 No puedes enviarte un mensaje privado a ti mismo usando este comando.");
        return;
    }

    try {
      await this.client.sendMessage(recipientJid, `🤫 _Mensaje privado de ${messageData.author_pushname}_:\n\n${privateMessageText}`);
      
      this.senderQueue.enqueue(senderJid, `✅ Mensaje privado enviado a ${recipientJid}.`);
      this.logger.info(`[PrivateMessage] Mensaje privado enviado de ${senderJid} a ${recipientJid}`);

    } catch (error) {
      this.logger.error({ err: error, recipientJid }, `[PrivateMessage] Error al enviar mensaje privado a ${recipientJid}`);
      this.senderQueue.enqueue(senderJid, `❌ Hubo un error al intentar enviar tu mensaje privado a ${recipientJid}. Por favor, inténtalo de nuevo más tarde.`);
    }
  }
}
