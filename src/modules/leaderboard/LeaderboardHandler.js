// src/modules/leaderboard/LeaderboardHandler.js
import logger from '../../utils/logger.js';
import { getLeaderboard, getPetLeaderboard } from '../../utils/db.js'; // Importar ambas funciones de leaderboard desde db.js

class LeaderboardHandler {
  constructor(senderQueue, stateRegistry, configManager) {
    this.senderQueue = senderQueue;
    this.stateRegistry = stateRegistry; // Para obtener datos del leaderboard
    this.configManager = configManager;
    logger.info('[LeaderboardHandler] Inicializado.');
  }

  async handleCommand(message, messageData, args) {
    const groupId = messageData.chat_id;

    const moduleEnabled = this.configManager.getModuleConfigForGroup(groupId, 'leaderboard');
    if (moduleEnabled === false) {
      logger.debug(`[LeaderboardHandler] Módulo leaderboard deshabilitado para el grupo ${groupId}`);
      return;
    }

    try {
        // S3: Obtener ambas listas de leaderboard de db.js
        const topTalkers = await getLeaderboard(groupId, 7); // Top 10 habladores
        const topPeters = await getPetLeaderboard(groupId, 7); // Top 10 favoritos de la shiba (usando !pet)

        // S4: Formatear y enviar el mensaje
        let response = '🏆 *Leaderboard del Grupo* 🏆\n\n';

        // Sección Top Habladores
        if (topTalkers && topTalkers.length > 0) {
            response += '🗣️ *Top Habladores:*\n';
            topTalkers.forEach((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                const medal = index < 3 ? medals[index] : `${index + 1}.`;
                response += `${medal} ${user.author_pushname || user.author_id}: ${user.msgs_sent} mensajes\n`;
            });
        } else {
            response += '🗣️ *Top Habladores:*\n(Aún no hay suficientes datos de mensajes.)\n';
        }

        response += '\n'; // Espacio entre secciones

        // Sección Favoritos de la Shiba
        if (topPeters && topPeters.length > 0) {
            response += '🐶💖 *Favoritos de la Shiba:*\n';
            topPeters.forEach((user, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                const medal = index < 3 ? medals[index] : `${index + 1}.`;
                 // Usar pets_sent para el conteo de !pet
                response += `${medal} ${user.author_pushname || user.author_id}: ${user.pets_sent} !pets usados\n`;
            });
        } else {
            response += '🐶💖 *Favoritos de la Shiba:*\n(Aún nadie ha acariciado a la shiba.)\n';
        }

        // Enviar el mensaje final
        this.senderQueue.enqueue(groupId, response.trim());
        logger.info({ chatId: groupId }, 'Comando !leaderboard ejecutado y mensaje formateado.');

    } catch (error) {
        logger.error({ err: error, chatId: groupId }, 'Error al procesar !leaderboard.');
        this.senderQueue.enqueue(groupId, 'Hubo un error al generar el leaderboard. Intenta de nuevo más tarde.');
    }
  }
}

export default LeaderboardHandler; 