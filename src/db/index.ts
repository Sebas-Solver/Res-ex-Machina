import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema.js';

/**
 * Cliente de conexión a PostgreSQL.
 * En producción: pool de conexiones.
 * En test: conexión única.
 */
const client = postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === 'test' ? 1 : 10,
});

/**
 * Instancia de Drizzle con el schema cargado.
 * Esto permite hacer queries type-safe:
 *   db.select().from(schema.records)...
 */
export const db = drizzle(client, { schema });

// Re-exportar schema para acceso directo
export { schema };
