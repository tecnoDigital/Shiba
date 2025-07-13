import logger from '../../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

const DEFAULT_HAPPINESS = 50;
const MAX_HAPPINESS = 100;
const MIN_HAPPINESS = 0;

const HAPPINESS_DATA_DIR = path.join(process.cwd(), 'data');
const HAPPINESS_FILE_PATH = path.join(HAPPINESS_DATA_DIR, 'happiness-levels.json');
const SAVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

const DECAY_CONFIG = {
  rate: 10, // Puntos que baja cada período
  intervalHours: 2, // Horas entre cada decaimiento
  minimumValue: 5 // Valor mínimo al que puede bajar por decaimiento
};

class HappinessManager {
  constructor(stateRegistry, configManager, senderQueue) {
    this.configManager = configManager;
    this.senderQueue = senderQueue;
    this.happinessLevels = {}; // Almacenamiento en memoria: { groupId: { value: number, lastUpdated: timestamp } }
    this.isSaving = false; // Semáforo para evitar guardados concurrentes

    this._initialize();
  }

  async _initialize() {
    try {
      await fs.mkdir(HAPPINESS_DATA_DIR, { recursive: true });
    } catch (err) {
      logger.error({ err }, '[HappinessManager] Error al crear/asegurar directorio de datos.');
      // Continuar de todas formas, la carga/guardado manejará errores de archivo
    }
    await this._loadHappinessData();
    this.saveIntervalId = setInterval(() => this._saveHappinessData(), SAVE_INTERVAL_MS);
    logger.info('[HappinessManager] Inicializado con persistencia en archivo y decaimiento.');
  }

  async _loadHappinessData() {
    try {
      const data = await fs.readFile(HAPPINESS_FILE_PATH, 'utf8');
      this.happinessLevels = JSON.parse(data);
      logger.info(`[HappinessManager] Datos de felicidad cargados desde ${HAPPINESS_FILE_PATH}. Grupos cargados: ${Object.keys(this.happinessLevels).length}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('[HappinessManager] Archivo de felicidad no encontrado. Se iniciará con datos vacíos.');
        this.happinessLevels = {};
      } else {
        logger.error({ err: error }, '[HappinessManager] Error al cargar datos de felicidad.');
        this.happinessLevels = {}; // Iniciar vacío en caso de error de parseo u otro
      }
    }
  }

  async _saveHappinessData() {
    if (this.isSaving) {
      logger.warn('[HappinessManager] Guardado ya en progreso, omitiendo esta ejecución.');
      return;
    }
    this.isSaving = true;
    try {
      await fs.writeFile(HAPPINESS_FILE_PATH, JSON.stringify(this.happinessLevels, null, 2), 'utf8');
      logger.info(`[HappinessManager] Datos de felicidad guardados en ${HAPPINESS_FILE_PATH}`);
    } catch (error) {
      logger.error({ err: error }, '[HappinessManager] Error al guardar datos de felicidad.');
    } finally {
      this.isSaving = false;
    }
  }

  _applyDecay(contextId) {
    const now = Date.now();
    if (!this.happinessLevels[contextId]) {
      this.happinessLevels[contextId] = {
        value: DEFAULT_HAPPINESS,
        lastUpdated: now
      };
      return this.happinessLevels[contextId].value;
    }

    const groupData = this.happinessLevels[contextId];
    const hoursElapsed = (now - groupData.lastUpdated) / (1000 * 60 * 60);
    const decayIntervals = Math.floor(hoursElapsed / DECAY_CONFIG.intervalHours);

    if (decayIntervals > 0) {
      const totalDecay = decayIntervals * DECAY_CONFIG.rate;
      const newHappiness = Math.max(DECAY_CONFIG.minimumValue, groupData.value - totalDecay);
      
      groupData.value = newHappiness;
      // Actualizar lastUpdated al inicio del último período de decaimiento evaluado para no perder "progreso" hacia el próximo decaimiento.
      groupData.lastUpdated += decayIntervals * DECAY_CONFIG.intervalHours * 1000 * 60 * 60; 
      
      logger.info(`[HappinessManager] Decaimiento aplicado para ${contextId}. Nivel: ${newHappiness}. Intervalos: ${decayIntervals}`);
    }
    return groupData.value;
  }

  async getHappiness(contextId) {
    const moduleConfig = this.configManager.getModuleConfigForGroup(contextId, 'happiness');
    if (moduleConfig === false) { // Explícitamente deshabilitado
        logger.debug(`[HappinessManager] Módulo de felicidad deshabilitado para el grupo ${contextId}. Retornando valor por defecto.`);
        return DEFAULT_HAPPINESS;
    }
    // Si la configuración no existe o es un objeto (habilitado por defecto o con config específica), aplicar decaimiento.
    return this._applyDecay(contextId);
  }

  async setHappiness(contextId, level) {
    const moduleEnabled = this.configManager.getModuleConfigForGroup(contextId, 'happiness');
    if (moduleEnabled === false) return;

    const newLevel = Math.max(MIN_HAPPINESS, Math.min(MAX_HAPPINESS, level));
    this.happinessLevels[contextId] = {
      value: newLevel,
      lastUpdated: Date.now()
    };
    logger.debug(`[HappinessManager] Felicidad establecida para ${contextId}: ${newLevel}`);
    // Considerar guardar inmediatamente o esperar al intervalo
    // await this._saveHappinessData(); 
  }

  async addHappiness(contextId, amount, reason = 'manual_change') {
    const moduleConfig = this.configManager.getModuleConfigForGroup(contextId, 'happiness');
    if (moduleConfig === false) {
        logger.debug(`[HappinessManager] Módulo de felicidad deshabilitado para el grupo ${contextId}. No se modificará la felicidad.`);
        return DEFAULT_HAPPINESS; // O el valor actual si se pudiera obtener sin decaimiento
    }
    
    const currentLevelNoDecay = this.happinessLevels[contextId]?.value || DEFAULT_HAPPINESS;
    this._applyDecay(contextId); // Asegura que lastUpdated esté al día y aplica decaimiento si es necesario

    const currentLevel = this.happinessLevels[contextId].value;
    const newLevel = Math.max(MIN_HAPPINESS, Math.min(MAX_HAPPINESS, currentLevel + amount));
    
    this.happinessLevels[contextId].value = newLevel;
    // Si hubo un cambio significativo o la acción lo amerita, actualizar lastUpdated para "resetear" el timer de decaimiento.
    // Opcional: solo actualizar si el amount es positivo o si la razón es específica.
    this.happinessLevels[contextId].lastUpdated = Date.now(); 

    logger.info(`[HappinessManager] Felicidad modificada para ${contextId}: ${currentLevelNoDecay} (antes decaimiento) -> ${currentLevel} (post decaimiento) -> ${newLevel} (final). Cantidad: ${amount}. Razón: ${reason}`);
    
    // Considerar guardar inmediatamente o esperar al intervalo
    // await this._saveHappinessData();
    return newLevel;
  }
  
  _buildHappinessBar(happinessLevel) {
    const topBorder = "🐾 ———————🦴——————— 🐾";
    const progressBarContentLength = topBorder.length;
    const ratio = Math.max(0, Math.min(happinessLevel, MAX_HAPPINESS)) / MAX_HAPPINESS;
    const filledCount = Math.round(ratio * progressBarContentLength);
    const emptyCount = progressBarContentLength - filledCount;
    const percent = Math.round(ratio * 100);
    const filledChars = '█'.repeat(filledCount);
    const emptyChars = '░'.repeat(emptyCount);
    const barLine = `[${filledChars}${emptyChars}] ${percent}%`;
    return `${topBorder}\n${barLine}\n${topBorder}`;
  }

  async getHappinessBarVisual(contextId) {
    const moduleConfig = this.configManager.getModuleConfigForGroup(contextId, 'happiness');
    if (moduleConfig === false) {
        // Si el módulo está desactivado, podríamos devolver un mensaje indicándolo o una barra por defecto.
        // Por ahora, una barra por defecto que indique el estado desactivado o un nivel neutro.
        logger.debug(`[HappinessManager] Solicitud de barra visual para módulo desactivado en ${contextId}.`);
        return this._buildHappinessBar(DEFAULT_HAPPINESS); // O un mensaje específico
    }
    const currentHappiness = await this.getHappiness(contextId); // Este método ya aplica decaimiento.
    return this._buildHappinessBar(currentHappiness);
  }

  async handleCommand(message, messageData) {
    const contextId = messageData.chat_id;
    const moduleEnabled = this.configManager.getModuleConfigForGroup(contextId, 'happiness');
    
    if (moduleEnabled === false) {
      logger.debug(`[HappinessManager] Módulo happiness deshabilitado para el grupo ${contextId} vía comando.`);
      // Opcionalmente enviar un mensaje indicando que está desactivado
      // this.senderQueue.enqueue(contextId, "El módulo de felicidad está desactivado para este grupo.");
      return;
    }

    // Manteniendo el formato anterior por si se prefiere:
    const response = `Felicidad del Grupo:\n${await this.getHappinessBarVisual(contextId)}`;
    
    this.senderQueue.enqueue(contextId, response);
    logger.info(`[HappinessManager] Comando !happiness procesado para ${contextId}. Nivel: ${await this.getHappiness(contextId)}`);
  }

  destroy() {
    if (this.saveIntervalId) {
      clearInterval(this.saveIntervalId);
      logger.info('[HappinessManager] Intervalo de guardado automático detenido.');
    }
    // Realizar un último guardado al destruir, si hay datos pendientes
    // Es importante que este guardado sea síncrono o manejado de forma que no corte el proceso de apagado.
    // En un bot real, esto podría ser más complejo. Por ahora, un guardado asíncrono "fire and forget".
    this._saveHappinessData().catch(err => {
        logger.error({err}, "[HappinessManager] Error en el guardado final durante destroy.");
    });
  }
}

export default HappinessManager; 