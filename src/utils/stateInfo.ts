// SPDX-License-Identifier: Apache-2.0

/**
 * Structured metadata for each record state.
 *
 * Allows agents and bots to act programmatically without
 * having to interpret the state string.
 */

export interface StateInfo {
    /** true if the state is final (will not change anymore) */
    terminal: boolean;
    /** true if the system can retry automatically */
    retryable: boolean;
    /** Human-readable state description */
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
        terminal: true,
        retryable: false,
        description: 'Anchoring failed after max attempts. Manual intervention required.',
    },
};

/**
 * Returns structured metadata for a given state.
 * If the state is unknown, returns a generic object.
 */
export function getStateInfo(state: string): StateInfo {
    return STATE_MAP[state] ?? {
        terminal: false,
        retryable: false,
        description: `Unknown state: ${state}`,
    };
}
