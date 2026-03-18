import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema.js';

/**
 * PostgreSQL connection client.
 * In production: connection pool.
 * In test: single connection.
 */
export const client = postgres(env.DATABASE_URL, {
    max: env.NODE_ENV === 'test' ? 1 : 10,
});

/**
 * Drizzle instance with loaded schema.
 * Enables type-safe queries:
 *   db.select().from(schema.records)...
 */
export const db = drizzle(client, { schema });

// Re-export schema for direct access
export { schema };
