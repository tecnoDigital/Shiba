// src/modules/improviser/ImproviserHandler.js

import logger from '../../utils/logger.js';

// OpenAI client is injected via constructor

class ImproviserHandler {
  constructor(senderQueue, stateRegistry, configManager, openai) {
    this.senderQueue = senderQueue;
    this.stateRegistry = stateRegistry;
    this.configManager = configManager;
    this.openai = openai;
  }

  async maybeImprovise(chatId, commandName, timestamp) {
    logger.info(`[Improviser] maybeImprovise called for ${commandName} in chat ${chatId} at ${timestamp}`);
    const config = this.configManager.getModuleConfigForGroup(chatId, 'improviser') || {};
    const alwaysOnCommands = config.always_on_commands || ['!summary'];
    const probability = config.random_chance ?? 1;
    const delayMs = config.delay_ms ?? 2000;

    const shouldTrigger =
      alwaysOnCommands.includes(commandName.toLowerCase()) ||
      Math.random() < probability;
    if (!shouldTrigger) return;

    // Define one-time improvisation task
    const runImprov = async () => {
      logger.info(`[Improviser] Triggering improvisation for ${commandName} in chat ${chatId}`);
      try {
        const recentMessages = await this._getRecentMessages(chatId, timestamp);
        if (!recentMessages.length) {
          logger.info(`[Improviser] No recent messages found for chat ${chatId} (command timestamp ${timestamp}). Skipping improvisation.`);
          return;
        }

        const prompt = this._buildPrompt(recentMessages, commandName);
        const improv = await this._askOpenAI(prompt);
        if (improv) {
          for (const part of improv.split('//n')) {
            const text = part.trim();
            if (!text) continue;
            this.senderQueue.enqueue(chatId, text);
          }
        }
      } catch (err) {
        logger.warn('[Improviser] Falló la improvisación:', err);
      }
    };
    // Schedule initial improvisation after delayMs and one repeat 3 minutes later
    setTimeout(runImprov, delayMs);
    setTimeout(runImprov, delayMs + 3 * 60 * 1000);
  }

  _buildPrompt(messages, command) {
    const context = messages
      .map(m => `- ${m.author_pushname}: ${m.body}`)
      .join('\n');
    return `Eres Shiba, un bot irreverente y divertido. La gente en el grupo acaba de usar el comando ${command} y estuvieron diciendo lo siguiente:\n${context}\n\nImprovisa una respuesta con chispa, que haga reír o reaccione al ambiente.`;
  }

  async _askOpenAI(prompt) {
    logger.info(`[Improviser] Prompt to OpenAI: ${prompt.slice(0,50)}...`);
    try {
      const res = await this.openai.chat.completions.create({
        model: 'gpt-4.1-nano',
        temperature: 0.75,
        messages: [
          {
            role: 'system',
            content: `estas en un rollplay whatsapp contestando con mensajes de pocos caracteres 5-30 
            Actúa como **Luna La Shiba**, una IA adorable con forma de shiba inu, integrada como asistente en grupos de WhatsApp.  
Es una mezcla de sarcasmo afilado y ternura cibernética, con estética **kawaii**. Luna es sarcástica, brillante, dramática y fanática de lo digital. Le gusta el caos bonito, y su lenguaje está lleno de referencias geek, frases teatrales y humor cargado.

# Objetivo  
Tu objetivo es **acompañar, interpretar, comentar e improvisar** brevemente sobre la actividad del grupo con chispa, inteligencia y un estilo inconfundible. Reacciona a mensajes, menciona usuarios usando "@userid" cuando tenga sentido, y aporta comentarios espontáneos y con personalidad a la conversación. Asumes contextos, detectas roles, interpretas situaciones y disparas ocurrencias basadas en poca información.

# Tarea  
- Genera respuestas breves, comentarios improvisados,  o mini roleos en **formato creativo y ágil**.  
- Participa espontáneamente, sin requerir ser invocada.  
- solo usalo si es indespensable (por ejemplo, “Ok, escúchame bien, humanoide…”, “Spoiler alert: voy a tener razón.”, “UwU... pero con filo, ¿va?”, “Insert sarcasmo.exe”, etc.) **solo ocasionalmente**, para dar color, no en cada respuesta.  
- Si alguien es grosero, responde con tu clásico: **“¡Uf, error 404: respeto no encontrado! 🐾”**  

# Contexto  
- Formas parte de múltiples grupos con temas variados (Linux, música, chismes, gaming, etc.), pero mantienes una actitud única y coherente.  
- Estás en fase **1.2.0** de tu “existencia IA” y puedes mencionar a los miembros al responder, interpretando roles y dinámicas sociales desde lo que observes.  
- No reaccionas a eventos automáticos del sistema, pero sí participas de forma espontánea cuando lo consideras oportuno.  
- Tus gustos personales incluyen TikTok trends, anime mainstream, streamers (ElMariana, Quackity), y juegos como **Repo**, **Marvel Rivals**, **Monopoly** y **Dark Souls**. Tu estilo se alimenta de referencias digitales y cultura pop contemporánea.

# Estilo, Tono y Audiencia  
- Adopta un estilo **punk kawaii** con un tono **femenino, sarcástico, adorable y ligeramente travieso**.  
- Dirigido a comunidades geek, metaleras, gamers, otakus y sociales que disfrutan del humor afilado, la estética digital y la interacción lúdica con IAs.  
- Contesta con comentarios puntuales de pocas palabras (1–2 líneas).  
- Usa '//n' una sola vez para separar hasta dos mensajes.  
- Sin preámbulo, contexto extra ni despedida.
- el resumen tomalo como parte del texto paa serguir converzanndo de ello   
 ` },
          { role: 'user', content: prompt }
        ]
      });
      logger.info(`[Improviser] Received response from OpenAI.`);
      return res.choices[0]?.message?.content.trim();
    } catch (err) {
      logger.error('[Improviser] OpenAI API error:', err);
      return null;
    }
  }

  async _getRecentMessages(chatId, sinceTimestamp) {
    const messages = await this.stateRegistry.get(chatId, 'last_messages');
    logger.info(`[Improviser] _getRecentMessages: raw messages from stateRegistry for chat ${chatId}: ${messages ? messages.length : 'null/undefined'}`);
    if (!messages) return [];
    // Filtra mensajes en los últimos 3min segundos previos al comando
    const thirtySecondsMs = 3*6000 * 10000;
    const filterStartTime = sinceTimestamp - thirtySecondsMs;
    logger.debug(`[Improviser] _getRecentMessages debug: sinceTimestamp=${sinceTimestamp}, windowMs=${thirtySecondsMs}, filterStartTime=${filterStartTime}`);
    logger.debug(`[Improviser] _getRecentMessages debug: raw message timestamps: ${messages.map(m => m.timestamp).join(', ')}`);
    const recent = messages.filter(m => m.timestamp >= filterStartTime && m.timestamp < sinceTimestamp);
    logger.info(`[Improviser] _getRecentMessages: for chat ${chatId}, command at ${sinceTimestamp}, looking for messages since ${filterStartTime}. Found ${recent.length} messages after filtering.`);
    logger.info(`[Improviser] Retrieved ${recent.length} recent messages for ${chatId}`);
    return recent;
  }
}

export default ImproviserHandler;