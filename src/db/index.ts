import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';

/**
 * Cliente de conexión a PostgreSQL.
 * En producción: pool de conexiones.
 * En test: conexión única.
 */
const client = postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === 'test' ? 1 : 10,
});

export const db = drizzle(client);
