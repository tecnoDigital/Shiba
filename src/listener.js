import logger from "./utils/logger.js";
import { saveMessage } from "./utils/db.js";
import TriggerManager from "./triggerManager.js";
import { attachSurveyListener } from "./services/SurveyListener.js"; // Importar attachSurveyListener


const MAX_RECENT_MESSAGES_IN_STATE = 50; // Keep last 50 messages in state for quick access

export default class Listener {
    /** @param {import('whatsapp-web.js').Client} client */
    constructor(client, senderQueue, configManager, stateRegistry, openai) {
        this._client = client;
        this._senderQueue = senderQueue; // Store senderQueue
        this._configManager = configManager;
        this._stateRegistry = stateRegistry;
        this._openai = openai;


        // Pasamos client para que TriggerManager pueda usarlo
        this._triggerManager = new TriggerManager(
            senderQueue,
            stateRegistry,
            client,
            configManager,
            openai
        );
        logger.info("[Listener] Inicializado con TriggerManager.");
    }

    handleMessage(message) {
        logger.info(`[Listener] Recibido mensaje de ${message.from}: ${message.body}`);
        this._handleMessage(message).catch(err => {
            logger.error({ err }, 'Error en _handleMessage');
        });
    }

    startListening() {
        this._client.on("message_create", this._handleMessage.bind(this));
        this._client.on("group_join", this._handleGroupJoin.bind(this));
        attachSurveyListener(this._client); // Attach the survey listener
        logger.info("[Listener] Escuchando eventos de mensajes…");
    }

    async _handleMessage(message) {
        // Se ignoran mensajes de sí mismo para evitar bucles
        if (message.fromMe) {
            return;
        }

        // const GRUPO_ESPECIFICO_ID = '120363419122374567@g.us'; // ID del grupo permitido
        // const NUMERO_AUTORIZADO = '5213331843176@c.us'; // Número de teléfono autorizado para DMs

        // // Verificar si el mensaje es del grupo permitido
        // const esDelGrupoPermitido = message.chatId === GRUPO_ESPECIFICO_ID;

        // // Verificar si es un mensaje directo del número autorizado
        // const esMensajeDirectoAutorizado = !message.from.endsWith('@g.us') &&
        //     (message.from === NUMERO_AUTORIZADO ||
        //         message.author === NUMERO_AUTORIZADO);

        // // Si no es ni del grupo permitido ni un mensaje directo autorizado, ignorar
        // if (!esDelGrupoPermitido && !esMensajeDirectoAutorizado) {
        //     logger.debug(`Mensaje de ${message.from || message.chatId} ignorado por filtro de seguridad.`);
        //     return;
        // }






        // Ignore messages from self to prevent loops
        if (message.fromMe) {
            return;
        }

        const chatId = message.from;
        const messageBody = message.body;

        // Save the message to the database
        const contact = await message.getContact();
        const pushname = contact.pushname || contact.name || contact.verifiedName || "Desconocido";
        const tsMs = message.timestamp * 1000;

        const messageData = {
            wa_id: message.id.id,
            chat_id: chatId,
            author_id: message.author || message.from,
            author_pushname: pushname,
            body: messageBody,
            timestamp: tsMs,
            from_me: message.fromMe,
            media_type: message.type,
        };
        saveMessage(messageData);

        // Procesar el mensaje solo con TriggerManager
        await this._triggerManager.processMessage(message, messageData);

        // Buffer for improviser: update last_messages in stateRegistry
        const chatIdKey = messageData.chat_id;
        const list = (await this._stateRegistry.get(chatIdKey, 'last_messages')) || [];
        list.push({
            author_id: messageData.author_id,
            author_pushname: messageData.author_pushname,
            body: messageData.body,
            timestamp: messageData.timestamp
        });
        if (list.length > MAX_RECENT_MESSAGES_IN_STATE) {
            list.splice(0, list.length - MAX_RECENT_MESSAGES_IN_STATE);
        }
        await this._stateRegistry.set(chatIdKey, 'last_messages', list);
        logger.debug(`[Listener] Buffered last_messages count=${list.length} for chat ${chatIdKey}`);
    }

    async _handleGroupJoin(notification) {
        await this._triggerManager.processEvent("group_join", notification);
    }
}