// src/index.js
import dotenv from 'dotenv';
import whatsappWeb from 'whatsapp-web.js';
const { Client, LocalAuth } = whatsappWeb;
import qrcode from 'qrcode-terminal';
import logger from './utils/logger.js';
import SenderQueue from './senderQueue.js';
import Listener from './listener.js';
import GroupConfigManager from './shared/config/GroupConfigManager.js'; // Es un singleton
import InMemoryStateRegistry from './shared/persistence/InMemoryStateRegistry.js';
import RedisStateRegistry from './shared/persistence/RedisStateRegistry.js';
import SQLiteStateRegistry from './shared/persistence/SQLiteStateRegistry.js';
import OpenAI from 'openai';
 
import http from 'http';
import promClient from 'prom-client';
<<<<<<< HEAD
import fs from 'fs';
import readline from 'readline';

=======
import axios from 'axios';
import fs from 'fs';
import readline from 'readline';



>>>>>>> 2405efc (ironpay 3)
dotenv.config(); // Carga inicial de .env

async function promptForEnv(keyName) {
  if (process.env[keyName]) return; // No solicitar si ya existe

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const value = await new Promise(resolve => {
    rl.question(`Por favor ingresa tu ${keyName}: `, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });

  process.env[keyName] = value; // Actualizar para la sesión actual
  try {
    fs.appendFileSync('.env', `\n${keyName}=${value}`);
    logger.info(`'${keyName}' guardada en .env para futuros inicios.`);
  } catch (e) {
    logger.error('Error guardando en .env:', e);
  }
}

async function start() {
  // --- 1. Asegurar configuración --- 
  await promptForEnv('OPENAI_API_KEY');
  await promptForEnv('PERSISTENCE_TYPE');
  await promptForEnv('LOG_LEVEL');
<<<<<<< HEAD
=======
  await promptForEnv('IRON_PAY_WEBHOOK');
  await promptForEnv('IRON_NUMBERS');
>>>>>>> 2405efc (ironpay 3)

  // Recargar .env para asegurar que todas las variables estén en process.env
  dotenv.config({ override: true });

<<<<<<< HEAD
=======
  // Webhook RETell environment variable
  const IRON_PAY_WEBHOOK = process.env.IRON_PAY_WEBHOOK;
  const IRON_NUMBERS = (process.env.IRON_NUMBERS || '').split(',').map(s => s.trim().replace(/^\+/, ''));
  const WEBHOOK_RETELL = process.env.WEBHOOK_RETELL;

>>>>>>> 2405efc (ironpay 3)
  // --- 2. Inicialización de clientes y servicios ---
  const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let stateRegistry;
  const persistenceType = process.env.PERSISTENCE_TYPE || 'memory';
  if (persistenceType === 'redis') {
    stateRegistry = new RedisStateRegistry();
    logger.info('Usando RedisStateRegistry para la persistencia.');
  } else if (persistenceType === 'sqlite') {
    stateRegistry = new SQLiteStateRegistry();
    logger.info('Usando SQLiteStateRegistry para la persistencia.');
  } else {
    stateRegistry = new InMemoryStateRegistry();
    logger.info('Usando InMemoryStateRegistry para la persistencia.');
  }

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  },
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
  }
});


  // --- 3. Definición de Handlers y Lógica de Eventos ---
  client.on('qr', qr => { qrcode.generate(qr, { small: true }); });
  client.on('authenticated', () => { logger.info('Cliente autenticado exitosamente!'); });
  client.on('auth_failure', msg => { logger.error('Fallo de autenticación:', msg); process.exit(1); });
  client.on('ready', () => {
    logger.info(`¡Cliente de WhatsApp listo! Conectado como ${client.info.pushname || client.info.wid.user}`);
    try {
      logger.info('Inicializando componentes post-conexión...');
      
      const senderQueueInstance = new SenderQueue(client);
      logger.info('-> SenderQueue inicializado correctamente.');

      const configManager = GroupConfigManager; // Usar la instancia singleton directamente
      logger.info('-> GroupConfigManager inicializado correctamente.');

      const listenerInstance = new Listener(client, senderQueueInstance, configManager, stateRegistry, openaiClient);
      logger.info('-> Listener inicializado correctamente.');

      // TEMP: usar 'message' en lugar de 'message_create' para eventos de mensaje entrante
      client.on('message', msg => listenerInstance.handleMessage(msg));
      client.on('group_join', notif => listenerInstance.handleGroupJoin(notif));
      
      logger.info('Listener y SenderQueue están listos y escuchando eventos.');
    } catch (e) {
      logger.error(e, 'Error CRÍTICO durante la inicialización en el evento "ready":');
      process.exit(1);
    }
  });
  client.on('disconnected', reason => { logger.warn('Cliente desconectado:', reason); });

  // --- 4. Servidor de Métricas y Graceful Shutdown ---
  async function gracefulShutdown() {
    logger.info('Cerrando componentes...');
    await client.destroy().catch(e => logger.error('Error al destruir cliente', e));
    if (stateRegistry?.disconnect) await stateRegistry.disconnect().catch(e => logger.error('Error al desconectar Redis', e));
    if (stateRegistry?.close) stateRegistry.close();
    process.exit(0);
  }
  process.on('SIGINT', gracefulShutdown).on('SIGTERM', gracefulShutdown);

  promClient.collectDefaultMetrics();
  const metricsServer = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.setHeader('Content-Type', promClient.register.contentType);
      res.end(await promClient.register.metrics());
    } else {
      res.writeHead(404).end();
    }
  });

  metricsServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`El puerto de métricas ${process.env.METRICS_PORT || 3001} ya está en uso. El servidor de métricas no se iniciará.`);
    } else {
      logger.error(err, 'Error inesperado en el servidor de métricas:');
    }
  });

  // --- 5. Arranque del Bot ---
  logger.info('Shiba BOT iniciando...');
  await client.initialize().catch(err => {
    logger.error({ err }, 'Error CRÍTICO al inicializar');
    process.exit(1);
  });

  // Iniciar el servidor de métricas solo después de que el cliente se haya inicializado correctamente
  metricsServer.listen(process.env.METRICS_PORT || 3001, () => {
    logger.info(`Métricas disponibles en http://localhost:${process.env.METRICS_PORT || 3001}/metrics`);
  });
}

start(); // Iniciar la aplicación
