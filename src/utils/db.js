// src/utils/db.js
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import logger from './logger.js';

// Variables a nivel de módulo
const dataDir = path.join(process.cwd(), 'data');
const dbConnections = new Map();

// Asegurarse de que el directorio de datos exista
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    logger.info(`Directorio de datos creado en: ${dataDir}`);
}

export function getMessagesForSummary(chatId, maxMessages = 400, maxHours = 4) {
    if (!chatId) {
        logger.error('Se requiere chatId para obtener mensajes para resumen.');
        return [];
    }
    const db = getDB(chatId);
    const fourHoursAgo = Math.floor(Date.now() / 1000) - maxHours * 60 * 60;

    // Queremos mensajes de texto (type='chat'), no del bot,
    // ordenados por timestamp ascendente para que el resumen tenga contexto cronológico.
    // Aplicamos el límite de tiempo Y el límite de mensajes.
    // SQLite procesará la consulta y devolverá los que cumplan ambas condiciones,
    // luego limitamos por el número de mensajes.
    const stmt = db.prepare(`
    SELECT author_pushname, body, timestamp
    FROM messages
    WHERE chat_id = @chat_id
      AND from_me = 0       -- No incluir mensajes del propio bot
      AND media_type = 'chat' -- Solo mensajes de texto (puedes ajustar esto)
      AND body IS NOT NULL AND body != '' -- Asegurar que haya contenido
      AND timestamp >= @fourHoursAgo
    ORDER BY timestamp DESC -- Obtener los más recientes primero
    LIMIT @maxMessages
  `);

    try {
        const rows = stmt.all({
            chat_id: chatId,
            fourHoursAgo: fourHoursAgo,
            maxMessages: maxMessages,
        });
        // Revertir para orden cronológico ascendente para el prompt
        const orderedRows = rows.reverse();
        logger.debug({ chatId, count: orderedRows.length },
            `Mensajes para resumen obtenidos: ${orderedRows.length}`
        );
        return orderedRows;
    } catch (error) {
        logger.error({ err: error, chatId },
            'Error al obtener mensajes para resumen de SQLite.'
        );
        return [];
    }
}

export function getDB() {
    const dbPath = path.join(dataDir, `central.sqlite`);
    const isNewDb = !fs.existsSync(dbPath);

    if (dbConnections.has(dbPath)) {
        return dbConnections.get(dbPath);
    }

    try {
        const db = new Database(dbPath, {
            /* verbose: console.log */
        });
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 5000');
        logger.info(`Conectado a la base de datos: ${dbPath}. isNewDb: ${isNewDb}`);

        // Aseguramos que las tablas básicas existan en cada conexión
        logger.info(`Asegurando tablas existentes para DB: ${dbPath}`);
        ensureTablesExist(db);

        dbConnections.set(dbPath, db);
        return db;
    } catch (error) {
        logger.error({ err: error, dbPath },
            'Error al conectar/crear la base de datos SQLite.'
        );
        throw error;
    }
}



// Esta función asegura que las tablas básicas existan para DBs antiguas
// o si no se usa el sistema de migraciones completo.
function ensureTablesExist(db) {
  db.transaction(() => {
    try {
      const createMessagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wa_id TEXT UNIQUE NOT NULL,
        author_id TEXT,
        author_pushname TEXT,
        body TEXT,
        timestamp INTEGER,
        from_me BOOLEAN,
        media_type TEXT,
        chat_id TEXT NOT NULL
      );
    `;

      // Tabla para user_counts - Añadimos columna pets_sent
      const createUserCountsTable = `
      CREATE TABLE IF NOT EXISTS user_counts (
        author_id TEXT NOT NULL,
        chat_id TEXT NOT NULL, -- Aunque la DB es por chat_id, es bueno tenerlo por si se consolida
        author_pushname TEXT,  -- Guardamos el pushname para mostrarlo fácilmente
        msgs_sent INTEGER DEFAULT 0,
        pets_sent INTEGER DEFAULT 0, -- NUEVA COLUMNA para el conteo de !pet
        last_message_timestamp INTEGER,
        PRIMARY KEY (author_id, chat_id)
      );
    `;

      // Tabla para interacciones de pet (aún útil para timestamps de cooldown, aunque el conteo va a user_counts)
      const createPetInteractionsTable = `
      CREATE TABLE IF NOT EXISTS pet_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        timestamp INTEGER
      );
    `;

      logger.info('Creando tabla messages...');
      db.exec(createMessagesTable);
      logger.info('Tabla messages creada.');

      logger.info('Creando tabla user_counts...');
      db.exec(createUserCountsTable);
      logger.info('Tabla user_counts creada.');

      logger.info('Creando tabla pet_interactions...');
      db.exec(createPetInteractionsTable);
      logger.info('Tabla pet_interactions creada.');

      // NEW TABLE for clients
      const createClientsTable = `
        CREATE TABLE IF NOT EXISTS clients (
            id TEXT PRIMARY KEY,
            client_number INTEGER UNIQUE NOT NULL CHECK(client_number >= 10),
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );
      `;

      const createClientsNumberIndex = `
        CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_number ON clients(client_number);
      `;

      logger.info('Creando tabla clients...');
      db.exec(createClientsTable);
      logger.info('Tabla clients creada.');

      logger.info('Creando índice clients_number...');
      db.exec(createClientsNumberIndex);
      logger.info('Índice clients_number creado.');

      // Remove old FTS table and triggers to ensure fresh creation
      try {
        db.exec("DROP TABLE IF EXISTS clients_fts;");
        db.exec("DROP TRIGGER IF EXISTS clients_ai;");
        db.exec("DROP TRIGGER IF EXISTS clients_ad;");
        db.exec("DROP TRIGGER IF EXISTS clients_au;");
        logger.info('Old clients_fts and triggers dropped');
      } catch (e) {
        logger.warn({ err: e }, 'Error dropping old clients_fts or triggers');
      }
      // NEW TABLE for clients_fts (Full-Text Search)
      const createClientsFtsTable = `
        CREATE VIRTUAL TABLE IF NOT EXISTS clients_fts USING fts5(
          name, phone, email,
          content='clients'
        );
      `;
      logger.info('Creando tabla clients_fts...');
      try {
        db.exec(createClientsFtsTable);
        logger.info('Tabla clients_fts creada.');
      } catch (error) {
        logger.error({ err: error, sql: createClientsFtsTable }, 'Error al crear la tabla clients_fts.');
        throw error; // Re-throw to halt execution if table creation fails
      }

      // Triggers to keep clients_fts in sync with clients table
      const createClientsFtsTriggers = `
        CREATE TRIGGER IF NOT EXISTS clients_ai AFTER INSERT ON clients BEGIN
          INSERT OR IGNORE INTO clients_fts(rowid, name, phone, email) VALUES (new.rowid, new.name, new.phone, new.email);
        END;
        CREATE TRIGGER IF NOT EXISTS clients_ad AFTER DELETE ON clients BEGIN
          INSERT OR IGNORE INTO clients_fts(clients_fts, rowid, name, phone, email) VALUES('delete', old.rowid, old.name, old.phone, old.email);
        END;
        CREATE TRIGGER IF NOT EXISTS clients_au AFTER UPDATE ON clients BEGIN
          INSERT OR IGNORE INTO clients_fts(clients_fts, rowid, name, phone, email) VALUES('delete', old.rowid, old.name, old.phone, old.email);
          INSERT OR IGNORE INTO clients_fts(rowid, name, phone, email) VALUES (new.rowid, new.name, new.phone, new.email);
        END;
      `;
      logger.info('Creando triggers para clients_fts...');
      try {
        db.exec(createClientsFtsTriggers);
        logger.info('Triggers para clients_fts creados.');
      } catch (error) {
        logger.error({ err: error, sql: createClientsFtsTriggers }, 'Error al crear los triggers para clients_fts.');
        throw error; // Re-throw to halt execution if trigger creation fails
      }

      // NEW TABLE for notes (updated with FK)
      const createNotesTable = `
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          client_id TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
        );
      `;

      logger.info('Creando tabla notes...');
      db.exec(createNotesTable); // Execute creation of notes table
      logger.info('Tabla notes creada.');

      // Add 'status' column to notes table if it doesn't exist
      const notesColumns = db.prepare("PRAGMA table_info(notes);").all();
      const hasStatusColumn = notesColumns.some(column => column.name === 'status');
      if (!hasStatusColumn) {
        db.exec("ALTER TABLE notes ADD COLUMN status TEXT DEFAULT 'completed';");
        logger.info('Columna status añadida a la tabla notes.');
      }

      // NEW TABLE for products
      const createProductsTable = `
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          price REAL NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );
      `;

      logger.info('Creando tabla products...');
      try {
        db.exec(createProductsTable);
        logger.info('Tabla products creada exitosamente.');
      } catch (error) {
        logger.error({ err: error }, 'Error al crear la tabla products.');
      }

      // NEW TABLE for note_items
      const createNoteItemsTable = `
        CREATE TABLE IF NOT EXISTS note_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          note_id TEXT NOT NULL,
          product_id INTEGER NOT NULL,
          qty REAL NOT NULL,
          unit_price REAL NOT NULL,
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );
      `;

      logger.info('Creando tabla note_items...');
      db.exec(createNoteItemsTable);
      logger.info('Tabla note_items creada.');

      // NEW TABLE for client_products
      const createClientProductsTable = `
        CREATE TABLE IF NOT EXISTS client_products (
          client_id TEXT NOT NULL,
          product_id INTEGER NOT NULL,
          last_price REAL,
          PRIMARY KEY (client_id, product_id),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );
      `;

      logger.info('Creando tabla client_products...');
      db.exec(createClientProductsTable);
      logger.info('Tabla client_products creada.');

    } catch (error) {
      logger.error({ err: error }, 'Error en ensureTablesExist al crear tablas.');
      throw error; // Re-throw the error to stop execution
    }
  })();

  // Check if user_counts table needs 'pets_sent' column
  const userCountsColumns = db.prepare("PRAGMA table_info(user_counts);").all();
  const hasPetsSentColumn = userCountsColumns.some(column => column.name === 'pets_sent');
  if (!hasPetsSentColumn) {
    db.exec("ALTER TABLE user_counts ADD COLUMN pets_sent INTEGER DEFAULT 0;");
    logger.info('Columna pets_sent añadida a la tabla user_counts.');
  }

  // Check if pet_interactions table needs 'timestamp' column
  const petInteractionsColumns = db.prepare("PRAGMA table_info(pet_interactions);").all();
  const hasTimestampColumn = petInteractionsColumns.some(column => column.name === 'timestamp');
  if (!hasTimestampColumn) {
    db.exec("ALTER TABLE pet_interactions ADD COLUMN timestamp INTEGER;");
    logger.info('Columna timestamp añadida a la tabla pet_interactions.');
  }
}

export function incrementUserMessageCount(
    db,
    authorId,
    chatId,
    authorPushname,
    timestamp
) {
    const stmt = db.prepare(`
    INSERT INTO user_counts (author_id, chat_id, author_pushname, msgs_sent, last_message_timestamp)
    VALUES (@author_id, @chat_id, @author_pushname, 1, @last_message_timestamp)
    ON CONFLICT(author_id, chat_id) DO UPDATE SET
      msgs_sent = msgs_sent + 1,
      author_pushname = excluded.author_pushname,
      last_message_timestamp = @last_message_timestamp;
  `);
    try {
        stmt.run({
            author_id: authorId,
            chat_id: chatId,
            author_pushname: authorPushname,
            last_message_timestamp: timestamp,
        });
        logger.debug({ authorId, chatId },
            'Contador de mensajes de usuario actualizado.'
        );
    } catch (error) {
        logger.error({ err: error, authorId, chatId },
            'Error al actualizar contador de mensajes de usuario.'
        );
    }
}

export function saveMessage(messageData) {
    const db = getDB(messageData.chat_id);
    const insertMsgStmt = db.prepare(`
    INSERT OR IGNORE INTO messages (
      wa_id, author_id, author_pushname, body, timestamp, from_me, media_type, chat_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

    try {
        db.transaction(() => {
            const result = insertMsgStmt.run(
                messageData.wa_id,
                messageData.author_id,
                messageData.author_pushname,
                messageData.body,
                messageData.timestamp,
                messageData.from_me ? 1 : 0,
                messageData.media_type,
                messageData.chat_id
            );

            if (result.changes > 0) {
                // Solo incrementar el contador si el mensaje fue realmente insertado
                if (!messageData.from_me) {
                    // Solo contar mensajes de otros usuarios
                    incrementUserMessageCount(
                        db, // Pasamos la instancia de la DB actual
                        messageData.author_id,
                        messageData.chat_id,
                        messageData.author_pushname,
                        messageData.timestamp
                    );
                }
            } else {
                logger.warn({ wa_id: messageData.wa_id, chatId: messageData.chat_id },
                    'Mensaje ya existía en DB (INSERT OR IGNORE). Contador no afectado por esta vía.'
                );
            }
        })(); // Ejecutar la transacción inmediatamente
        // return result; // La transacción no devuelve el result de insertMsgStmt directamente
    } catch (error) {
        logger.error({ err: error, wa_id: messageData.wa_id, chatId: messageData.chat_id },
            'Error en transacción de guardado de mensaje/conteo.'
        );
    }
}

export function getLeaderboard(chatId, topN = 10) {
    const db = getDB(chatId);
    // Ordenar por msgs_sent de forma descendente
    const stmt = db.prepare(`
    SELECT author_id, author_pushname, msgs_sent
    FROM user_counts
    WHERE chat_id = @chat_id
    ORDER BY msgs_sent DESC
    LIMIT @topN
  `);
    try {
        const topUsers = stmt.all({ chat_id: chatId, topN: topN });
        logger.debug({ chatId, count: topUsers.length },
            'Leaderboard de mensajes obtenido.'
        );
        return topUsers; // Devuelve [{ author_id, author_pushname, msgs_sent }, ...]
    } catch (error) {
        logger.error({ err: error, chatId }, 'Error al obtener leaderboard de mensajes.');
        return [];
    }
}

// NUEVA FUNCIÓN para incrementar el contador de !pet
export function incrementUserPetCount(
    chatId,
    userId,
    userPushname
) {
    const db = getDB(chatId);
    const stmt = db.prepare(`
    INSERT INTO user_counts (author_id, chat_id, author_pushname, pets_sent)
    VALUES (@author_id, @chat_id, @author_pushname, 1)
    ON CONFLICT(author_id, chat_id) DO UPDATE SET
      pets_sent = pets_sent + 1,
      author_pushname = excluded.author_pushname; -- Actualizar pushname por si cambia
  `);
    try {
        stmt.run({
            author_id: userId,
            chat_id: chatId,
            author_pushname: userPushname,
        });
        logger.debug({ userId, chatId },
            'Contador de !pet de usuario actualizado.'
        );
    } catch (error) {
        logger.error({ err: error, userId, chatId },
            'Error al actualizar contador de !pet de usuario.'
        );
    }
}

// NUEVA FUNCIÓN para obtener el leaderboard de !pet
export function getPetLeaderboard(chatId, topN = 10) {
    const db = getDB(chatId);
    // Ordenar por pets_sent de forma descendente
    const stmt = db.prepare(`
    SELECT author_id, author_pushname, pets_sent
    FROM user_counts
    WHERE chat_id = @chat_id
    ORDER BY pets_sent DESC
    LIMIT @topN
  `);
    try {
        const topUsers = stmt.all({ chat_id: chatId, topN: topN });
        logger.debug({ chatId, count: topUsers.length },
            'Leaderboard de !pet obtenido.'
        );
        return topUsers; // Devuelve [{ author_id, author_pushname, pets_sent }, ...]
    } catch (error) {
        logger.error({ err: error, chatId }, 'Error al obtener leaderboard de !pet.');
        return [];
    }
}

// Funciones existentes para pet_interactions (cooldown)
export async function getLastPetTimestamp(userId, chatId) {
    const db = getDB();
    const stmt = db.prepare(
        'SELECT timestamp FROM pet_interactions WHERE user_id = ? AND chat_id = ? ORDER BY timestamp DESC LIMIT 1'
    );
    const row = stmt.get(userId, chatId);
    return row ? row.timestamp : 0;
}

export async function registerPetInteraction(userId, chatId, timestamp) {
    const db = getDB();
    const stmt = db.prepare(
        'INSERT INTO pet_interactions (user_id, chat_id, timestamp) VALUES (?, ?, ?)'
    );
    stmt.run(userId, chatId, timestamp);
}

export async function getTodayPetsCount(chatId) {
    const db = getDB(chatId);
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const stmt = db.prepare(
        'SELECT COUNT(*) as count FROM pet_interactions WHERE chat_id = ? AND timestamp >= ?'
    );
    const row = stmt.get(chatId, todayStart);
    return row.count;
}

export function saveNote(chatId, title, content) {
    const db = getDB();
    const stmt = db.prepare(`
    INSERT INTO notes (chat_id, title, content, timestamp)
    VALUES (?, ?, ?, ?)
  `);
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        stmt.run(chatId, title, content, timestamp);
        logger.info({ chatId, title }, 'Nota guardada con éxito en la base de datos.');
    } catch (error) {
        logger.error({ err: error, chatId, title }, 'Error al guardar la nota en la base de datos.');

    }
}