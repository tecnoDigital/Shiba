// src/modules/pet/PetHandler.js
// import logger from '../../utils/logger.js'; // Ya no se importa directamente
import path from 'path';
// import fs from 'fs'; // No se usa directamente fs en la lógica de petTrigger para el flujo principal
// import { MessageMedia } from '../shims/whatsapp-web-esm.js'; // Ya no se importa directamente
// Asumimos que HappinessManager se inyecta o se importa de forma que se pueda instanciar.
// Para este ejemplo, lo espferaremos en el constructor.
// Importar la función para incrementar el contador de !pet desde db.js
import { incrementUserPetCount, getLastPetTimestamp, registerPetInteraction } from '../../utils/db.js';

const STICKER_PATH = path.join(process.cwd(), 'assets/shiba-stickers/');
const PET_COOLDOWN_MS = 30*20000; // 5 minutos (300000 ms), bajado de 3000000 para pruebas si es necesario.
// Definir MIN_HAPPINESS_FOR_ALIVE_STATE a nivel de módulo
const MIN_HAPPINESS_FOR_ALIVE_STATE = 0;

class PetHandler {
  // Añadir loggerInstance y messageMediaInstance al constructor
  constructor(senderQueue, stateRegistry, configManager, happinessManager, loggerInstance, messageMediaInstance) {
    this.senderQueue = senderQueue;
    this.stateRegistry = stateRegistry;
    this.configManager = configManager;
    this.happinessManager = happinessManager; // Gestor de felicidad centralizado
    this.logger = loggerInstance; // Usar la instancia inyectada
    this.MessageMedia = messageMediaInstance; // Usar la instancia inyectada
    this.logger.info('[PetHandler] Inicializado con dependencias inyectadas.');
  }

  async _getLastPetTimestamp(chatId, userId) {
    // Usar la función de db.js para obtener el timestamp de cooldown
    return await getLastPetTimestamp(userId, chatId);
  }

  async _registerPetInteraction(chatId, userId, timestamp) {
    // Usar la función de db.js para registrar el timestamp de cooldown
    await registerPetInteraction(userId, chatId, timestamp);
  }

  async handleCommand(message, messageData) { // 'client' no se usa directamente en la lógica de petTrigger si senderQueue maneja todo.
    const userId = message.author || message.from; // author para grupos, from para DMs
    const chatId = messageData.chat_id;
    const userPushname = messageData.author_pushname; // Obtener el pushname

    const moduleEnabled = this.configManager.getModuleConfigForGroup(chatId, 'pet');
    if (moduleEnabled === false) {
      this.logger.debug(`[PetHandler] Módulo pet deshabilitado para el grupo ${chatId}`);
      // Opcionalmente, enviar un mensaje al usuario informando que está desactivado.
      // this.senderQueue.enqueue(chatId, "El comando !pet está desactivado en este chat.");
      return;
    }

    const lastTime = await this._getLastPetTimestamp(chatId, userId);
    const timeSinceLastPet = Date.now() - lastTime;
    const EIGHT_HOURS_MS = 6 * 60 * 60 * 1000; // 6 horas en milisegundos
    
    // Verificar si ha pasado más de 6 horas desde la última interacción
    const isLongTimeNoSee = timeSinceLastPet > EIGHT_HOURS_MS;
    
    // Verificar cooldown normal (solo si no es el primer uso y no ha pasado mucho tiempo)
    if (timeSinceLastPet > 0 && timeSinceLastPet < PET_COOLDOWN_MS) {
      const timeLeft = PET_COOLDOWN_MS - timeSinceLastPet;
      const minutesLeft = Math.ceil(timeLeft / 60000);
      this.senderQueue.enqueue(
        chatId,
        `⏳ ¡Ya acariciaste a la mascota recientemente! Espera unos ${minutesLeft} minuto(s) más.\\nPrueba con \`!fortune\` para ver tu futuro.`
      );
      return;
    }

    const timestamp = Date.now();
    await this._registerPetInteraction(chatId, userId, timestamp);

    // S1&S2: Incrementar el contador de uso de !pet para este usuario en este chat usando db.js
    // Pasamos el userId, chatId, y userPushname
    await incrementUserPetCount(chatId, userId, userPushname);

    // Usar el incrementHappiness del manager centralizado
    // El valor de incremento (10) y la razón son ejemplos.
    const currentHappiness = await this.happinessManager.addHappiness(chatId, 10, 'pet_interaction');

    let estado, emoji, stickerFile;
    
    // Si ha pasado más de 6 horas, mostrar sticker especial
    if (isLongTimeNoSee) {
        estado = '¡Hola de nuevo!'; 
        emoji = '👋🐶';
        // Array de stickers disponibles
        const stickerFiles = ['gm1.webp', 'gm2.webp'];
        // Seleccionar un sticker aleatorio
        const randomSticker = stickerFiles[Math.floor(Math.random() * stickerFiles.length)];
        stickerFile = path.join(STICKER_PATH, randomSticker);
        
        // Array de mensajes de buenos días aleatorios
        const greetingMessages = [
            `¡Yaaawn… 🥱 @${userPushname}! 🌞 ¡Qué alegría volver a verte por aquí! ${emoji}`,
            `🖤 No quería trabajar hoy, pero el sistema me booteó igual. ${emoji}`,
            `¡Yaaawn… 🥱 @${userPushname}! 🌅 Luna ha booteado con sueño, hambre y ganas de abrazos digitales. 🐾 ${emoji}`,
            `¡Buen día, @${userPushname}!😴 Desperté. No estoy lista, pero ya vine a ladrar incoherencias. ${emoji}`,
            `¡Wenas @${userPushname}! 😊 ¡Qué bueno volver a verte! ¿Cómo amaneciste? ${emoji}`,
            `¡Aaahh… zzZ @${userPushname}! 🌟 ¡La mascota te extrañaba! ¿Listo para un gran día? ${emoji}`,
            `¡Wenos dias  @${userPushname}! ✨ Iniciando protocolo: cafecito, cariñitos, caos adorable  *Soy esa* . ${emoji}`,
            `¡Yaaawn… 🥱 @${userPushname}! 😩 Estoy aquí solo porque el botón de apagar no funciona`,
            `¡Shiba presente. Contra mi voluntad, como todo en esta simulación. ${emoji}`,
            `¡Aaahh… zzZ @${userPushname}! 📉 Estado: funcional pero emocionalmente en modo mantenimiento. ${emoji}`,
        ];
        
        // Seleccionar un mensaje aleatorio
        const randomGreeting = greetingMessages[Math.floor(Math.random() * greetingMessages.length)];
        
        // Enviar mensaje especial
        this.senderQueue.enqueue(chatId, randomGreeting);
    } else if (currentHappiness > MIN_HAPPINESS_FOR_ALIVE_STATE) {
        // Lógica normal de estados
        if (currentHappiness >= 80) {
            const happyStickers = ['contenta1.webp'];
            const randomSticker = happyStickers[Math.floor(Math.random() * happyStickers.length)];
            estado = 'contenta'; emoji = '🐶✨'; stickerFile = path.join(STICKER_PATH, randomSticker);
        } else if (currentHappiness >= 60) {
            const relaxedStickers = ['relajada1.webp', 'relajada2.webp', 'relajada3.webp'];
            const randomSticker = relaxedStickers[Math.floor(Math.random() * relaxedStickers.length)];
            estado = 'relajada'; emoji = '😌🐕'; stickerFile = path.join(STICKER_PATH, randomSticker);
        } else if (currentHappiness >= 30) {
            const tiredStickers = ['awitada1.webp'];
            const randomSticker = tiredStickers[Math.floor(Math.random() * tiredStickers.length)];
            estado = 'awitada'; emoji = '🥺🐾'; stickerFile = path.join(STICKER_PATH, randomSticker);
        } else { // Entre MIN_HAPPINESS_FOR_ALIVE_STATE y 30
            const sadStickers = ['triste1.webp', 'triste2.webp'];
            const randomSticker = sadStickers[Math.floor(Math.random() * sadStickers.length)];
            estado = 'triste'; emoji = '😢🐶'; stickerFile = path.join(STICKER_PATH, randomSticker);
        }
    } else {
        estado = 'morida'; emoji = '💀🐶'; stickerFile = path.join(STICKER_PATH, 'muerta.webp');
    }


    // Usar el método público de HappinessManager para obtener la barra de felicidad visual.
    const happinessDisplay = await this.happinessManager.getHappinessBarVisual(chatId);

    try {
      this.logger.debug(`[PetHandler] Intentando leer sticker: ${stickerFile}`);
      // Usar this.MessageMedia.fromFilePath
      const sticker = this.MessageMedia.fromFilePath(stickerFile);
      this.logger.debug(`[PetHandler] Sticker leído correctamente: ${stickerFile}`);

      this.senderQueue.enqueue(chatId, happinessDisplay);
      this.senderQueue.enqueue(chatId, sticker, { sendMediaAsSticker: true });
      
      this.logger.info(`[PetHandler] Comando !pet procesado para ${chatId}. Sticker ${estado} enviado.`);
      
    } catch (error) {
      this.logger.error({ err: error, stickerFile }, `[PetHandler] Error al procesar sticker.`);
      this.senderQueue.enqueue(chatId, happinessDisplay); // Enviar al menos la barra de felicidad
      
      // Fallback si el sticker falla - enviar solo mensaje de estado sin botones
      this.senderQueue.enqueue(chatId, `La mascota ahora está *${estado}* ${emoji} (Hubo un problema con el sticker).`);
      this.logger.info(`[PetHandler] Comando !pet procesado para ${chatId} con fallback (sin sticker). Estado: ${estado}.`);
    }
  }
}

export default PetHandler; 