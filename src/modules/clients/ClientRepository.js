import { getDB } from '../../utils/db.js';
import logger from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

class ClientRepository {
    constructor() {
        this.db = getDB();
    }

    /**
     * Crea un nuevo cliente en la base de datos.
     * @param {object} clientData - Datos del cliente (name, phone, email).
     * @returns {object} El cliente creado con su client_number asignado.
     */
    createClient(clientData) {
        // Debug: mostrar esquema actual de la tabla clients
        logger.debug({ schema: this.db.prepare("PRAGMA table_info(clients);").all() }, 'Esquema de la tabla clients');
        const { name, phone, email } = clientData;
        const id = uuidv4();

        // Obtener el siguiente client_number disponible (mayor que 10)
        const result = this.db.prepare(
            `SELECT COALESCE(MAX(client_number), 9) + 1 AS next_client_number FROM clients`
        ).get();
        const client_number = result.next_client_number;

        const sql = `INSERT INTO clients (id, client_number, name, phone, email) VALUES (?, ?, ?, ?, ?)`;
        const stmt = this.db.prepare(sql);
        // Debug: mostrar SQL y tipos de argumentos
        const args = [String(id), Number(client_number), String(name), phone == null ? null : String(phone), email == null ? null : String(email)];
        logger.debug({ sql, args }, 'Prepared SQL and args for createClient');


        // Log para depuración de tipos
        logger.debug({ idType: typeof id, clientNumberType: typeof client_number, nameType: typeof name, phoneType: typeof phone, emailType: typeof email }, 'Types before inserting client');
        try {
            // Forzar tipos
            stmt.run(...args);
            logger.info(`Cliente creado: ${name} con número ${client_number}`);
            return { id, client_number, name, phone, email };
        } catch (error) {
            logger.error({ err: error, id, client_number, name, phone, email }, 'Error al ejecutar INSERT de cliente.');
            if (error.message.includes('UNIQUE constraint failed: clients.name')) {
                throw new Error(`Ya existe un cliente con el nombre '${name}'.`);
            } else if (error.message.includes('UNIQUE constraint failed: clients.client_number')) {
                throw new Error(`Error al asignar client_number único. Intente de nuevo.`);
            } else {
                logger.error({ err: error }, 'Error al crear cliente.');
                throw new Error('Error interno al crear el cliente.');
            }
        }
    }

    /**
     * Busca clientes por nombre (FTS) o por client_number.
     * @param {string} query - Nombre o número de cliente a buscar.
     * @returns {Array<object>} Lista de clientes que coinciden.
     */
    searchClients(query) {
        // Intentar buscar por client_number si la query es numérica y tiene al menos 2 dígitos
        if (/^\d{2,}$/.test(query)) {
            const client = this.db.prepare(
                `SELECT id, client_number, name, phone, email FROM clients WHERE client_number = ?`
            ).get(parseInt(query, 10));
            if (client) {
                logger.debug(`Cliente encontrado por número: ${query}`);
                return [client];
            }
        }

        // Intentar búsqueda por nombre usando FTS5 con fallback a LIKE
        try {
            const ftsStmt = this.db.prepare(
                `SELECT id, client_number, name, phone, email FROM clients WHERE clients_fts MATCH ? ORDER BY rank`
            );
            const clients = ftsStmt.all(`${query}*`); // Búsqueda de prefijo
            logger.debug(`Clientes encontrados por FTS para '${query}': ${clients.length}`);
            return clients;
        } catch (error) {
            logger.warn({ err: error }, `FTS5 no disponible o error, realizando búsqueda LIKE para '${query}'.`);
            const likeStmt = this.db.prepare(
                `SELECT id, client_number, name, phone, email FROM clients WHERE name LIKE ? ORDER BY name`
            );
            const clientsLike = likeStmt.all(`%${query}%`);
            logger.debug(`Clientes encontrados por LIKE para '${query}': ${clientsLike.length}`);
            return clientsLike;
        }
    }

    /**
     * Obtiene un cliente por su ID.
     * @param {string} id - ID único del cliente.
     * @returns {object|null} El cliente o null si no se encuentra.
     */
    getClientById(id) {
        const stmt = this.db.prepare(
            `SELECT id, client_number, name, phone, email FROM clients WHERE id = ?`
        );
        try {
            const client = stmt.get(id);
            return client || null;
        } catch (error) {
            logger.error({ err: error }, `Error al obtener cliente por ID '${id}'.`);
            return null;
        }
    }

    /**
     * Obtiene un cliente por su client_number.
     * @param {number} client_number - Número de cliente.
     * @returns {object|null} El cliente o null si no se encuentra.
     */
    getClientByNumber(client_number) {
        const stmt = this.db.prepare(
            `SELECT id, client_number, name, phone, email FROM clients WHERE client_number = ?`
        );
        try {
            const client = stmt.get(client_number);
            return client || null;
        } catch (error) {
            logger.error({ err: error }, `Error al obtener cliente por número '${client_number}'.`);
            return null;
        }
    }

    /**
     * Actualiza los datos de un cliente existente.
     * @param {string} id - ID del cliente a actualizar.
     * @param {object} updates - Objeto con los campos a actualizar (name, phone, email).
     * @returns {boolean} True si se actualizó, false en caso contrario.
     */
    updateClient(id, updates) {
        const fields = [];
        const params = [];
        for (const key in updates) {
            if (Object.prototype.hasOwnProperty.call(updates, key) && ['name', 'phone', 'email'].includes(key)) {
                fields.push(`${key} = ?`);
                params.push(updates[key]);
            }
        }
        if (fields.length === 0) {
            logger.warn(`No hay campos válidos para actualizar para el cliente ID: ${id}`);
            return false;
        }

        params.push(id);
        const stmt = this.db.prepare(
            `UPDATE clients SET ${fields.join(', ')}, updated_at = (strftime('%s', 'now')) WHERE id = ?`
        );
        try {
            const info = stmt.run(...params);
            logger.info(`Cliente ID ${id} actualizado. Cambios: ${info.changes}`);
            return info.changes > 0;
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed: clients.name')) {
                throw new Error(`Ya existe un cliente con el nombre '${updates.name}'.`);
            } else {
                logger.error({ err: error }, `Error al actualizar cliente ID ${id}.`);
                throw new Error('Error interno al actualizar el cliente.');
            }
        }
    }

    /**
     * Elimina un cliente por su ID.
     * @param {string} id - ID del cliente a eliminar.
     * @returns {boolean} True si se eliminó, false en caso contrario.
     */
    deleteClient(id) {
        const stmt = this.db.prepare(`DELETE FROM clients WHERE id = ?`);
        try {
            const info = stmt.run(id);
            logger.info(`Cliente ID ${id} eliminado. Cambios: ${info.changes}`);
            return info.changes > 0;
        } catch (error) {
            logger.error({ err: error }, `Error al eliminar cliente ID ${id}.`);
            throw new Error('Error interno al eliminar el cliente.');
        }
    }

    /**
     * Obtiene el siguiente client_number disponible.
     * @returns {number} El siguiente client_number.
     */
    getNextClientNumber() {
        const result = this.db.prepare(
            `SELECT COALESCE(MAX(client_number), 9) + 1 AS next_client_number FROM clients`
        ).get();
        return result.next_client_number;
    }

    /**
     * Obtiene todos los clientes.
     * @returns {Array<object>} Lista de todos los clientes.
     */
    getAllClients() {
        const stmt = this.db.prepare(
            `SELECT id, client_number, name, phone, email FROM clients ORDER BY client_number ASC`
        );
        try {
            return stmt.all();
        } catch (error) {
            logger.error({ err: error }, `Error al obtener todos los clientes.`);
            return [];
        }
    }

}

export default ClientRepository;
