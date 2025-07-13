// Este archivo proporciona una capa de compatibilidad para 
// usar whatsapp-web.js (CommonJS) con importaciones ESM
import pkg from 'whatsapp-web.js';

// Re-exportamos el objeto MessageMedia para acceso como importación nombrada
export const { MessageMedia, Buttons } = pkg;

// Exportación por defecto para mantener compatibilidad
export default pkg; 