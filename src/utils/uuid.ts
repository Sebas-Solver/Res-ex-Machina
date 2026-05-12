// SPDX-License-Identifier: Apache-2.0

import { uuidv7 } from 'uuidv7';

/**
 * Genera un UUID v7 (time-ordered).
 *
 * Design decision (ADR-001):
 * - UUID v7 generated in the application, NOT in PostgreSQL.
 * - Time-ordered: allows natural ordering by creation time.
 * - Controlado por la app: sin dependencia de la DB para IDs.
 */
export function generateRecordId(): string {
    return uuidv7();
}
