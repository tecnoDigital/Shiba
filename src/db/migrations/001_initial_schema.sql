-- Crear tabla de clientes
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    client_number INTEGER UNIQUE NOT NULL CHECK(client_number >= 10),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Crear índice único para búsqueda por número de cliente
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_number ON clients(client_number);

-- Crear tabla virtual FTS5 para búsqueda de texto completo
CREATE VIRTUAL TABLE IF NOT EXISTS clients_fts USING fts5(
    name,
    content='clients',
    content_rowid='id'
);

-- Triggers para mantener sincronizada la tabla FTS
-- Trigger para INSERT
CREATE TRIGGER IF NOT EXISTS clients_after_insert AFTER INSERT ON clients
BEGIN
    INSERT INTO clients_fts(rowid, name) VALUES (new.id, new.name);
END;

-- Trigger para UPDATE
CREATE TRIGGER IF NOT EXISTS clients_after_update AFTER UPDATE ON clients
BEGIN
    DELETE FROM clients_fts WHERE rowid = old.id;
    INSERT INTO clients_fts(rowid, name) VALUES (new.id, new.name);
END;

-- Trigger para DELETE
CREATE TRIGGER IF NOT EXISTS clients_after_delete AFTER DELETE ON clients
BEGIN
    DELETE FROM clients_fts WHERE rowid = old.id;
END;

-- Tabla de notas (si no existe)
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

