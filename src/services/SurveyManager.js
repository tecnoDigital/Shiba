import logger from '../utils/logger.js';

// Envía la encuesta y devuelve el pollId
async function sendPoll(chat, question = '¿Quieres saber más?', options = ['Sí', 'No']) {
  logger.debug(`[SurveyManager] Sending native poll: question="${question}", options=${JSON.stringify(options)}`);
  const pollObject = { name: question, selectableOptionsCount: options.length, options };
  const pollMsg = await chat.sendMessage(question, { poll: pollObject });
  return pollMsg.id._serialized;
}

export { sendPoll };
