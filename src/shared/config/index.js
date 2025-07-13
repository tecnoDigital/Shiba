import GroupConfigManager from './GroupConfigManager.js';

// Usar createRequire para importar JSON de forma compatible con ES Modules
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const defaultConfigs = require('./defaultConfigs.json');

export const OPENAI_MODEL = 'gpt-4.1-nano';

export {
  GroupConfigManager,
  defaultConfigs
}; 