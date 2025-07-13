import logger from '../utils/logger.js';

/**
 * Guarda listeners temporales (máx 20 s) por pollId.
 *  - userId:   autor que lanzó la encuesta (filtra trolls)
 *  - cb(opt):  qué hacer con la opción elegida
 */
const activePolls = new Map();

/**
 * Registra callback y borra después de timeout.
 */
function registerListener(pollId, userId, cb, timeoutMs = 20_000) {
  const timeout = setTimeout(() => activePolls.delete(pollId), timeoutMs);
  activePolls.set(pollId, { userId, cb, timeout });
}

/**
 * Enlaza el listener global al cliente de whatsapp-web.js
 */
function attachSurveyListener(client) {
  client.on('message', async (msg) => {
    if (msg.type !== 'poll_response') return;

    const ctx = activePolls.get(msg.pollId);
    if (!ctx) return;                          // encuesta desconocida
    if (msg.author !== ctx.userId) return;     // solo responde el creador

    clearTimeout(ctx.timeout);
    activePolls.delete(msg.pollId);

    // Use msg.selectedOptionLocalIds based on the provided documentation
    // Assuming only one option can be selected (selectableOptionsCount: 1)
    const selected = msg.selectedOptionLocalIds?.[0] ?? -1; // Get the first selected local ID, default to -1 if none
    logger.debug(`[SurveyListener] Poll response from ${msg.author} for poll ${msg.pollId}. Selected local ID: ${selected}`);
    await ctx.cb(selected);
  });
}

export { registerListener, attachSurveyListener };
