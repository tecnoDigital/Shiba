// src/utils/logger.js
import pino from 'pino';

// Configuración para desarrollo: logs más legibles
// Configuración para producción: logs JSON estándar
const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
});

export default logger;
