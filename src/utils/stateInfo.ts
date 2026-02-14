/**
 * Metadata estructurada para cada estado de un record.
 *
 * Permite a agentes y bots actuar programáticamente sin
 * tener que interpretar el string de estado.
 */

export interface StateInfo {
    /** true si el estado es final (no cambiará más) */
    terminal: boolean;
    /** true si el sistema puede reintentar automáticamente */
    retryable: boolean;
    /** Descripción legible del estado */
    description: string;
}

const STATE_MAP: Record<string, StateInfo> = {
    pending_anchor: {
        terminal: false,
        retryable: false,
        description: 'Record registered. Anchoring in progress.',
    },
    anchored: {
        terminal: true,
        retryable: false,
        description: 'Record anchored on-chain. Verification available.',
    },
    anchor_failed: {
        terminal: false,
        retryable: true,
        description: 'Anchoring failed after max attempts. System will retry automatically.',
    },
};

/**
 * Devuelve la metadata estructurada para un estado dado.
 * Si el estado es desconocido, devuelve un objeto genérico.
 */
export function getStateInfo(state: string): StateInfo {
    return STATE_MAP[state] ?? {
        terminal: false,
        retryable: false,
        description: `Unknown state: ${state}`,
    };
}
