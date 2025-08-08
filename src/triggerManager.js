import logger from "./utils/logger.js";
import { GroupConfigManager } from "./shared/config/index.js";
import FortuneHandler from "./modules/fortune/fortuneHandler.js";
import { HappinessManager } from "./modules/happiness/index.js";
import Summarizer from "./modules/summarizer/Summarizer.js";
import LeaderboardHandler from "./modules/leaderboard/LeaderboardHandler.js";
import PetHandler from "./modules/pet/PetHandler.js";
import PrivateMessageHandler from "./modules/private/PrivateMessageHandler.js";
import HelpHandler from "./modules/help/HelpHandler.js"; // + Nueva importación para Help
import ImproviserHandler from "./modules/improviser/improviserHandler.js";
import welcomeModule, { handleCommand as welcomeHandleCommand, getEventName as welcomeGetEventName } from './modules/welcome/index.js';
<<<<<<< HEAD
=======
import { handleIronPay } from "./modules/IronPay/handleIronPay.js";
>>>>>>> 2405efc (ironpay 3)
import whatsappWeb from 'whatsapp-web.js';
const { MessageMedia } = whatsappWeb;




export default class TriggerManager {
  /**
   * @param {SenderQueue} senderQueue
   * @param {*} stateRegistry
   * @param {*} client
   * @param {ConfigManager} configManager
   * @param {import('openai').OpenAI} openai // Agregar openai como parámetro
   */
  constructor(senderQueue, stateRegistry, client, configManager, openai) {
    this.senderQueue   = senderQueue;
    this.stateRegistry = stateRegistry;
    this.client        = client;
    this.configManager = configManager || GroupConfigManager;
    this.openai        = openai; // Guardar la instancia de openai
    this.logger        = logger; // Asignar el logger importado a this.logger

    this.commandHandlers = new Map();
    this.moduleInstances = new Map();

    this._initializeModules();
    logger.info("[TriggerManager] Inicializado y módulos cargados.");
  }

  _initializeModules() {
    // Dependencias necesarias que deben ser proporcionadas externamente o instanciadas aquí
    // TODO: Considerar pasar 'openai' y 'getMessagesFn' al constructor de TriggerManager
    const getMessagesFn = async (chatId, limit) => { // Implementación simple
        try {
            const chat = await this.client.getChatById(chatId);
            const messages = await chat.fetchMessages({ limit: limit });
            // fetchMessages devuelve objetos Message, necesitamos mapearlos al formato esperado por Summarizer
            return messages.map(msg => ({ author_pushname: msg.author, author_id: msg.id.remote, body: msg.body }));
        } catch (error) {
            logger.error({ error }, "[TriggerManager] Error fetching messages for summarizer");
            return [];
        }
    };

    // 1️⃣ Happiness primero (lo usan otros módulos)
    const happinessManager = new HappinessManager(
      this.stateRegistry,
      this.configManager,
      this.senderQueue
    );
    this.moduleInstances.set("happiness", happinessManager);
    this.registerCommand("!happiness", happinessManager.handleCommand.bind(happinessManager));
    this.registerCommand("!felicidad", happinessManager.handleCommand.bind(happinessManager));

    // 2️⃣ Fortune
    const fortuneHandler = new FortuneHandler(
      this.senderQueue,
      this.stateRegistry,
      this.configManager,
      happinessManager,
      this.client
    );
    this.moduleInstances.set("fortune", fortuneHandler);
    this.registerCommand("!fortune", fortuneHandler.handleCommand.bind(fortuneHandler));
    this.registerCommand("!galleta", fortuneHandler.handleCommand.bind(fortuneHandler));

    // 2.5️⃣ Improviser (auto-trigger)  
    const improviser = new ImproviserHandler(
      this.senderQueue,
      this.stateRegistry,
      this.configManager,
      this.openai
    );
    this.moduleInstances.set("improviser", improviser);
    // Comando manual para disparar improvisación con !luna
    this.registerCommand("!luna", async (message, messageData) => {
      await improviser.maybeImprovise(messageData.chat_id, "!luna", messageData.timestamp);
    });

    // 3️⃣ Summarizer
    const summarizer = new Summarizer(
      this.senderQueue,
      this.configManager,
      this.openai, // Pasar la instancia real de openai recibida en el constructor
      getMessagesFn, // Pasar función para obtener mensajes
      improviser
    );
    this.moduleInstances.set("summarizer", summarizer);
    this.registerCommand("!summary", summarizer.handleCommand.bind(summarizer));

    // 4️⃣ Leaderboard (Nuevo)
    const leaderboardHandler = new LeaderboardHandler(
      this.senderQueue,
      this.stateRegistry,
      this.configManager
    );
    this.moduleInstances.set("leaderboard", leaderboardHandler);
    this.registerCommand("!leaderboard", leaderboardHandler.handleCommand.bind(leaderboardHandler));

    // 5️⃣ Pet (Nuevo)
    const petHandler = new PetHandler(
      this.senderQueue,
      this.stateRegistry,
      this.configManager,
      this.moduleInstances.get("happiness"),
      this.logger,
      MessageMedia
    );
    this.moduleInstances.set("pet", petHandler);
    this.registerCommand("!pet", petHandler.handleCommand.bind(petHandler));
    this.registerCommand("!pat", petHandler.handleCommand.bind(petHandler));

    // 6️⃣ Private Messages (Nuevo)
    const privateMessageHandler = new PrivateMessageHandler(
      this.client,
      this.senderQueue,
      this.logger // Puedes pasar this.logger o crear uno específico si prefieres
    );
    this.moduleInstances.set("privateMessage", privateMessageHandler);
    this.registerCommand("!pm", privateMessageHandler.handleCommand.bind(privateMessageHandler));
    this.registerCommand("!privado", privateMessageHandler.handleCommand.bind(privateMessageHandler)); // Alias opcional

    // 7️⃣ Help Command (Nuevo)
    const helpHandler = new HelpHandler(
      this.senderQueue,
      this.logger // Puedes pasar this.logger o crear uno específico si prefieres
    );
    this.moduleInstances.set("help", helpHandler);
    this.registerCommand("!help", helpHandler.handleCommand.bind(helpHandler));

<<<<<<< HEAD
=======
    // IronPay command
    this.registerCommand("!llamar", (message, messageData, args) => handleIronPay(message, messageData, args, this.senderQueue));

>>>>>>> 2405efc (ironpay 3)
    // 8️⃣ Welcome Module
    // No necesita una instancia de clase como tal, solo registrar su handler de comando
    this.registerCommand("!testwelcome", (message, messageData) => welcomeHandleCommand(message, this.senderQueue, messageData, this.client));


  }

  registerCommand(cmd, fn) {
    if (this.commandHandlers.has(cmd)) {
      logger.warn(`[TriggerManager] Comando duplicado ${cmd}, sobrescribiendo.`);
    }
    this.commandHandlers.set(cmd.toLowerCase(), fn);
  }

  /**
   * Enrutador principal de mensajes
   */
  async processMessage(message, messageData) {
    const body = (messageData.body || "").trim();
    if (!body) return;

    const prefix = this.configManager.getGlobalConfig().prefix || "!";
    if (!body.startsWith(prefix)) return;

    const [commandKey, ...args] = body.slice(prefix.length).trim().split(/\s+/);
    const full = `${prefix}${commandKey.toLowerCase()}`;
    const handler = this.commandHandlers.get(full);
    if (!handler) return logger.debug(`[TriggerManager] Comando desconocido ${full}`);

    logger.info(`[TriggerManager] → ${full} en ${messageData.chat_id}`);
    try {
      await handler(message, messageData, args); // si algún handler quiere args (opcional)
    } catch (err) {
      logger.error({ err, full }, "[TriggerManager] Error ejecutando handler");
    }
  }

  async processEvent(type, notification) {
    logger.info(`[TriggerManager] Evento: ${type}`);
    
    // Manejar evento de bienvenida
    if (type === welcomeGetEventName() && notification) {
      try {
        await welcomeModule(notification, this.senderQueue, this.client);
      } catch (error) {
        logger.error({ err: error }, '[TriggerManager] Error procesando evento de bienvenida');
      }
    }
    
    // Aquí podrías agregar más manejadores de eventos si es necesario
  }
}