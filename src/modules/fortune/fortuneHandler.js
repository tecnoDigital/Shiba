import fortunes from "./fortunes.js";
import logger from "../../utils/logger.js";
import pkg from "whatsapp-web.js";
const { MessageMedia } = pkg;
import path from "path";

const STICKER_PATH = path.join(process.cwd(), "assets/shiba-stickers/fortune.webp");
const INTRO_MSG    = " Los astros hoy murmuran… ";
const COOLDOWN_MS  = 0 * 60 * 60 * 1000; // 20 h

export default class FortuneHandler {
  constructor(senderQueue, stateRegistry, configManager, happinessManager, client) {
    this.senderQueue     = senderQueue;
    this.stateRegistry   = stateRegistry;
    this.configManager   = configManager;
    this.happiness       = happinessManager;
    this.client          = client;
    this.lastUse         = new Map();
  }

  /**
   * @param {import('whatsapp-web.js').Message} message
   * @param {{ chat_id:string, author_id?:string, from:string, author_pushname?:string }} data
   */
  async handleCommand(message, data) {
    const chatId   = data.chat_id;
    const authorId = message.author || data.from;

    // 1 Cooldown
    const now = Date.now();
    const prev = this.lastUse.get(authorId) || 0;
    if (now - prev < COOLDOWN_MS) {
      const left = COOLDOWN_MS - (now - prev);
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      return this.senderQueue.enqueue(
        chatId,
        "! Calma, _Nostradamus_! Podrás pedir otra fortuna en h m."
      );
    }
    this.lastUse.set(authorId, now);

    // 2 Happiness boost
    try {
      this.happiness?.addHappiness(chatId, 5, "fortune_used");
    } catch (e) {
      logger.warn("[Fortune] No se pudo sumar felicidad", e);
    }

    // 3 Sticker (silencioso si falta archivo)
    try {
      const sticker = MessageMedia.fromFilePath(STICKER_PATH);
      this.senderQueue.enqueue(chatId, sticker, { sendMediaAsSticker: true });
    } catch {}

    await new Promise(r => setTimeout(r, 400));
    this.senderQueue.enqueue(chatId, INTRO_MSG);

    // 4 Obtener contacto para mención
    let contact;
    try {
      contact = await this.client.getContactById(authorId);
    } catch {}

    const tag = contact ? `@${contact.id.user}` : `@${authorId.split("@")[0]}`;

    // 5 Construir fortuna
    const fortune = fortunes[Math.floor(Math.random() * fortunes.length)]
      .replace(/{userId}/g, tag)
      .replace(/\\n/g, "\n");

    // 6 Enviar línea a línea con mención
    for (const line of fortune.split("\n")) {
      if (!line.trim()) continue;
      const opts = contact ? { mentions: [contact] } : {};
      this.senderQueue.enqueue(chatId, line.trim(), opts);
    }
  }
}