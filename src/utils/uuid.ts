import { uuidv7 } from 'uuidv7';

/**
 * Genera un UUID v7 (time-ordered).
 *
 * Decisión de diseño (ADR-001):
 * - UUID v7 generado en la aplicación, NO en PostgreSQL.
 * - Time-ordered: permite ordenación natural por tiempo de creación.
 * - Controlado por la app: sin dependencia de la DB para IDs.
 */
export function generateRecordId(): string {
    return uuidv7();
}
