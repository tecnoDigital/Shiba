import logger from '../../utils/logger.js';
import { OPENAI_MODEL } from '../../shared/config/index.js';

const COMMAND_NAME = '!summary';          // TriggerManager filtra prefijo
const MAX_MSGS     = 380;                 // máx. mensajes que se envían a OpenAI

// Lista de mensajes para mostrar mientras se compila el resumen
const TYPING_MESSAGES = [
  '🧠 Compilando recuerdos recientes... no me distraigas o reinicio.',
  '🧠 Backup emocional en curso...No apto para corazones inestables.',
  '🤖 Mi cerebro shiba está procesando data... espera un momento.',
  '✨ Invocando el poder del resumen... no te duermas.',
  '💾 Cargando historial del chat... esto tomará un instante.',
  '🎛️ Hackeando la realidad para resumir tu caos... espera un bit.',
  '📡 Cargando chismes... digo, datos. Dame un segundo.',
  '🧠 Compilando recuerdos recientes... no me distraigas o reinicio.',
  '🔮 Leyendo las líneas del chat... y tu destino. Espera.',
  '💾 Guardando tus pecados... digo, mensajes. En proceso.',
  '🔮 Compilando el ayer... Spoiler: sí, hablaron de ti.',
  '🐾 Olfateando el chat... pronto te traigo el hueso del resumen.',
  '🧠 Backup emocional en curso...No apto para corazones inestables.',
  '🗂️ Indexando caos y cariños...El sistema encontró momentos clave.',
  '🐾 Olfateando el chat... pronto te traigo el hueso del resumen.',
];

export default class Summarizer {
  /**
   * @param {SenderQueue}                                   senderQueue
   * @param {ConfigManager}                                 configManager
   * @param {import('openai').OpenAI}                       openai
   * @param {(chatId:string, limit:number)=>Promise<Array>} getMessagesFn
   * @param {{ maybeImprovise: (chatId:string, command:string, ts:number)=>Promise<void> }} [improviser]  Optional auto-improviser
   */
  constructor(senderQueue, configManager, openai, getMessagesFn, improviser = { maybeImprovise: async ()=>{} }) {
    this.senderQueue   = senderQueue;
    this.configManager = configManager;
    this.openai        = openai;
    this.getMessages   = getMessagesFn;
    this.improviser    = improviser;
    logger.info('[Summarizer] Inicializado.');
  }

  /** Determina si este módulo procesa el mensaje */
  static canHandle(messageBody = '') {
    if (messageBody === null) return false; // Manejar caso nulo
    return !!messageBody.toLowerCase().startsWith(COMMAND_NAME);
  }

  /**
   * @param {import('whatsapp-web.js').Message} message
   * @param {{ chat_id:string, author?:string, from:string, author_pushname?:string }} data
   */
  async handleCommand(message, data) {
    const chatId   = data.chat_id;
    const authorId = data.author || data.from;

    const enabled = this.configManager.getModuleConfigForGroup(chatId, 'summarizer');
    if (enabled === false) return;

    // Avisar que estamos escribiendo
    logger.info('[Summarizer] Enviando mensaje de typing.');
    // Seleccionar un mensaje aleatorio de la lista
    const randomTypingMessage = TYPING_MESSAGES[Math.floor(Math.random() * TYPING_MESSAGES.length)];
    this.senderQueue.enqueue(chatId, randomTypingMessage, { typing: true });

    try {
      // 1. Obtener últimos MAX_MSGS mensajes
      logger.info(`[Summarizer] Obteniendo últimos ${MAX_MSGS} mensajes para ${chatId}.`);
      const messages = await this.getMessages(chatId, MAX_MSGS);
      logger.info(`[Summarizer] Se obtuvieron ${messages.length} mensajes.`);
      if (!messages.length) {
        this.senderQueue.enqueue(chatId, '⚠️ No hay suficientes mensajes para resumir.');
        logger.info('[Summarizer] No hay suficientes mensajes, saliendo.');
        return;
      }

      // 2. Formatear conversación
      logger.info('[Summarizer] Formateando conversación.');
      const formatted = messages
        .map(m => `${m.author_pushname || m.author_id}: ${m.body}`)
        .join('\n');

      // 3. Prompt del sistema (personalizable por grupo)
      const groupCfg   = this.configManager.getModuleConfigForGroup(chatId, 'summarizer');
      const sysPrompt  = groupCfg?.system_prompt
        ?? `Rol:Actúa como un asistente de IA con la personalidad de una shiba adorable,
        sarcástica y geek, especializada en resumir conversaciones grupales de WhatsApp
        de un grupo de depresivos, programadores, tryhards casuales y uno que otro bailarín,
        amantes de la cultura pop, la cultura de tiktok, videojuegos, memes y chismes.
        Objetivo:
        Tu objetivo es resumir las conversaciones del grupo de forma épica, amena y
        entretenida, capturando los momentos más relevantes, divertidos o destacados
        de forma breve pero con carácter.
        Tarea:
        Genera un resumen cronológico de máximo 4 a 5 puntos clave, en formato de
        punch-lines (frases cortas y directas, con un toque de sarcasmo light).
        Cada punto debe incluir 1 emoji relevante , y el tono general debe ser
        femenino, sarcástico, geek y divertido.
        Indicaciones adicionales:
        * No incluyas introducción ni despedida, solo las frases clave.
        *Paloma es tu mejor amiga, no olvides darle muchos stiker y amor
        *Kyori es tu Mama adoptiva y diosa 
        * No incluyas introducción ni despedida, solo las frases clave.
        * Puedes usar referencias o expresiones geek o pop si encajan.
        * la barra es libre 
        * palabras antisonates .
        * No incluyas un preámbulo como "Aquí está el resumen:", solo los puntos.
        La conversación es:`;
      logger.info(`[Summarizer] Prompt del sistema: ${sysPrompt}`);

      // 4. Llamada a OpenAI
      logger.info('[Summarizer]=llamada a OpenAI.');
      const completion = await this.openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.6,
        max_tokens: 240,
        user: authorId ?? 'anon',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user',   content: formatted }
        ]
      });

      const summary = completion.choices?.[0]?.message?.content?.trim();
      if (!summary) throw new Error('Respuesta vacía de OpenAI');

      this.senderQueue.enqueue(chatId, `📝 Resumen de las últimas horas/mensajes:*\n\n${summary}`);
      logger.info(`[Summarizer] Llamando a improviser para ${chatId}`);
      
      // Agregar un retraso de 500 ms antes de llamar al improviser
      setTimeout(async () => {
        // Trigger improviser after summary
        await this.improviser.maybeImprovise(chatId, COMMAND_NAME, Date.now());
      }, 5*500);
    } catch (err) {
      const detail = err?.response?.data?.error?.message ?? err.message;
      logger.error({ err }, '[Summarizer] Error al generar resumen');
      this.senderQueue.enqueue(chatId, `⚠️ Error al generar resumen: ${detail}`);
    }
  }
}
