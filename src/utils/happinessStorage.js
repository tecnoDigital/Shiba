import fs from 'fs/promises';
import path from 'path';
import logger from './logger.js';

// Ruta para el archivo de datos de felicidad
const HAPPINESS_FILE_PATH = path.join(
  process.cwd(),
  'data',
  'groupHappiness.json'
);

// Asegurarse de que el directorio para los datos exista
async function ensureDataDirectory() {
  try {
    await fs.mkdir(path.dirname(HAPPINESS_FILE_PATH), { recursive: true });
  } catch (error) {
    // Si el directorio ya existe, EEXIST está bien.
    if (error.code !== 'EEXIST') {
      logger.error(
        { err: error },
        'Error al intentar crear el directorio de datos para la felicidad.'
      );
      // No re-lanzar el error, permitir que las funciones de carga/guardado manejen el fallo
    }
  }
}

/**
 * Carga el nivel de felicidad para un grupo específico
 * @param {string} groupId - ID del grupo
 * @returns {Promise<number>} - Nivel de felicidad (0 si no existe)
 */
export async function loadHappiness(groupId) {
  await ensureDataDirectory();
  try {
    const data = await fs.readFile(HAPPINESS_FILE_PATH, 'utf8');
    const happinessData = JSON.parse(data);
    return happinessData[groupId] || 0;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0; // El archivo no existe, retornar 0
    }
    logger.error(
      { err: error, groupId },
      'Error al cargar los datos de felicidad.'
    );
    return 0; // Valor por defecto en caso de error
  }
}

/**
 * Guarda el nivel de felicidad para un grupo específico
 * @param {string} groupId - ID del grupo
 * @param {number} value - Nivel de felicidad a guardar
 * @returns {Promise<void>}
 */
export async function saveHappiness(groupId, value) {
  await ensureDataDirectory();
  let happinessData = {};
  try {
    // Intentar leer el archivo existente para no sobrescribir otros grupos
    const data = await fs.readFile(HAPPINESS_FILE_PATH, 'utf8');
    happinessData = JSON.parse(data);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn(
        { err: error },
        'Error al leer archivo de felicidad existente antes de guardar.'
      );
    }
    // Continuar con un objeto vacío si el archivo no existe o hay error de parseo
  }

  happinessData[groupId] = value;
  try {
    await fs.writeFile(
      HAPPINESS_FILE_PATH,
      JSON.stringify(happinessData, null, 2),
      'utf8'
    );
  } catch (error) {
    logger.error(
      { err: error, groupId, value },
      'Error al guardar los datos de felicidad.'
    );
    // No re-lanzar el error para evitar problemas en cascada
  }
}
