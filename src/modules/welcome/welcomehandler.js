// src/modules/welcome/welcomehandler.js
import logger from '../../utils/logger.js';
import GroupConfigManager from '../../shared/config/GroupConfigManager.js';

const WELCOME_EVENT_NAME = 'group_join';

/**
 * Obtiene la configuración de bienvenida para un grupo específico
 * @param {string} groupId - ID del grupo
 * @returns {Object} Configuración de bienvenida
 */
function getWelcomeConfig(groupId) {
  const defaultConfig = {
    enabled: true,
    message: '¡Bienvenido/a al grupo!',
    sendSticker: false
  };

  try {
    const groupConfig = GroupConfigManager.getModuleConfigForGroup(groupId, 'welcome') || {};
    return { ...defaultConfig, ...groupConfig };
  } catch (error) {
    logger.error({ err: error, groupId }, 'Error al obtener configuración de bienvenida');
    return defaultConfig;
  }
}

/**
 * Maneja el evento de unión al grupo
 * @param {Object} notification - Objeto de notificación
 * @param {Object} senderQueue - Cola de envío de mensajes
 * @param {Object} client - Cliente de WhatsApp
 */
export async function handleWelcomeEvent(notification, senderQueue, client) {
  if (!notification?.recipientIds?.length) {
    logger.warn('Evento group_join recibido sin recipientIds.');
    return;
  }

  const groupId = notification.chatId;
  const welcomeConfig = getWelcomeConfig(groupId);

  if (!welcomeConfig.enabled) {
    logger.info({ groupId }, 'Módulo de bienvenida deshabilitado para este grupo');
    return;
  }

  for (const recipientId of notification.recipientIds) {
    try {
      const contact = await client.getContactById(recipientId);
      if (!contact) {
        throw new Error('Contacto no encontrado');
      }

      const userName = contact.pushname || contact.name || contact.shortName || recipientId.split('@')[0];
      const welcomeMessage = welcomeConfig.message.replace(/\{userId\}/g, `@${contact.id.user}`);

      // Enviar mensaje de bienvenida con mención
      await senderQueue.enqueue(groupId, welcomeMessage, { 
        mentions: [contact] 
      });

      logger.info(
        { groupId, userId: recipientId, userName },
        `Mensaje de bienvenida enviado a ${userName}`
      );

      // Opcional: Enviar sticker si está configurado
      if (welcomeConfig.sendSticker && welcomeConfig.stickerId) {
        try {
          const sticker = await getStickerById(welcomeConfig.stickerId);
          if (sticker) {
            await senderQueue.enqueue(groupId, sticker, { sendMediaAsSticker: true });
          }
        } catch (stickerError) {
          logger.error({ err: stickerError }, 'Error al enviar sticker de bienvenida');
        }
      }

    } catch (error) {
      logger.error(
        { err: error, groupId, userId: recipientId },
        'Error al procesar bienvenida'
      );
      // Mensaje de error genérico
      await senderQueue.enqueue(
        groupId,
        '¡Alguien se unió al grupo! Pero no pude obtener sus detalles.'
      );
    }
  }
}

/**
 * Maneja el comando de prueba !testwelcome
 * @param {Object} message - Objeto del mensaje
 * @param {Object} senderQueue - Cola de envío
 * @param {Object} messageData - Datos del mensaje
 * @param {Object} client - Cliente de WhatsApp
 */
export async function handleCommand(message, senderQueue, messageData, client) {
  logger.info(
    { command: messageData.body, from: message.from },
    'Comando !testwelcome recibido'
  );

  let simulatedNewUserId = message.author || message.from;

  if (simulatedNewUserId.includes('_')) {
    simulatedNewUserId = simulatedNewUserId.split('_')[0];
  }

  if (message.from.endsWith('@g.us') && !message.author) {
    logger.warn('!testwelcome llamado desde un grupo por el bot mismo o sin autor claro');
    await senderQueue.enqueue(
      message.from,
      'Para probar la bienvenida, envía `!testwelcome` como un usuario en un grupo, o en un chat directo conmigo.'
    );
    return;
  }

  const mockNotification = {
    chatId: message.from,
    recipientIds: [simulatedNewUserId]
  };

  try {
    await handleWelcomeEvent(mockNotification, senderQueue, client);
    logger.info(
      { chatId: message.from, simulatedUser: simulatedNewUserId },
      'Evento de bienvenida simulado para !testwelcome'
    );
  } catch (error) {
    logger.error(
      { err: error, command: '!testwelcome' },
      'Error al ejecutar el evento de bienvenida simulado'
    );
    await senderQueue.enqueue(
      message.from,
      'Hubo un error al simular el evento de bienvenida.'
    );
  }
}

/**
 * Verifica si el comando puede ser manejado por este módulo
 * @param {string} commandBody - Cuerpo del comando
 * @returns {boolean} true si puede manejar el comando
 */
export function canHandle(commandBody) {
  return commandBody.toLowerCase() === '!testwelcome';
}

// Función auxiliar para obtener stickers (implementar según sea necesario)
async function getStickerById() {
  // TODO: Implementar lógica para obtener sticker por ID
  // Por ahora devolvemos null ya que no tenemos implementado el sistema de stickers
  return null;
}

export function getEventName() {
  return WELCOME_EVENT_NAME;
}