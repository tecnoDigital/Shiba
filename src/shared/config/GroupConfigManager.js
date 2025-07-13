import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger.js';

// Solución temporal hasta tener un loader de JSON más robusto o que Node estabilice `assert { type: "json" }`
let defaultConfigsFromFile;
const configPath = path.join(process.cwd(), 'src', 'shared', 'config', 'defaultConfigs.json');
const defaultConfig = { 
  global: {}, 
  groups: { 
    default: { 
      modules: { 
        welcome: true 
      } 
    } 
  } 
};

try {
  if (fs.existsSync(configPath)) {
    const rawData = fs.readFileSync(configPath, 'utf-8');
    defaultConfigsFromFile = JSON.parse(rawData);
  } else {
    logger.warn(`[GroupConfigManager] El fichero defaultConfigs.json no existe. Creando uno nuevo en ${configPath}`);
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    defaultConfigsFromFile = defaultConfig;
  }
} catch (error) {
  logger.error(error, '[GroupConfigManager] Error crítico procesando defaultConfigs.json. Usando fallback.');
  defaultConfigsFromFile = defaultConfig; // Fallback robusto
}

class GroupConfigManager {
  constructor(configs) {
    this.configs = configs || defaultConfigsFromFile;
    logger.info('[GroupConfigManager] Inicializado.');
  }

  getGlobalConfig() {
    return this.configs.global || {};
  }

  getGroupConfig(groupId) {
    // Devolver config específica del grupo o la config por defecto
    return this.configs.groups[groupId] || this.configs.groups.default || {};
  }

  getModuleConfigForGroup(groupId, moduleName) {
    const groupConfig = this.getGroupConfig(groupId);
    if (groupConfig.modules && typeof groupConfig.modules[moduleName] !== 'undefined') {
      return groupConfig.modules[moduleName]; // Puede ser un booleano o un objeto de config
    }
    // Fallback a la config default del módulo si existe, o undefined
    const defaultConfig = this.configs.groups.default.modules;
    return defaultConfig ? defaultConfig[moduleName] : undefined;
  }

  // Métodos futuros: setGroupConfig, reloadConfigs, etc.
}

export default new GroupConfigManager(); // Exportar una instancia singleton 