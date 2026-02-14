import { describe, it, expect } from 'vitest';
import { getStateInfo } from '../src/utils/stateInfo.js';
import { getExplorerTxUrl, getNetworkName } from '../src/utils/explorer.js';

// =============================================
// Tests para stateInfo.ts
// =============================================
describe('getStateInfo', () => {
    it('pending_anchor es no-terminal y no-retryable', () => {
        const info = getStateInfo('pending_anchor');
        expect(info.terminal).toBe(false);
        expect(info.retryable).toBe(false);
        expect(info.description).toContain('Anchoring in progress');
    });

    it('anchored es terminal y no-retryable', () => {
        const info = getStateInfo('anchored');
        expect(info.terminal).toBe(true);
        expect(info.retryable).toBe(false);
        expect(info.description).toContain('anchored on-chain');
    });

    it('anchor_failed es no-terminal y retryable', () => {
        const info = getStateInfo('anchor_failed');
        expect(info.terminal).toBe(false);
        expect(info.retryable).toBe(true);
        expect(info.description).toContain('retry');
    });

    it('estado desconocido devuelve fallback', () => {
        const info = getStateInfo('unknown_state');
        expect(info.terminal).toBe(false);
        expect(info.retryable).toBe(false);
        expect(info.description).toContain('Unknown state');
    });
});

// =============================================
// Tests para explorer.ts
// =============================================
describe('getExplorerTxUrl', () => {
    const sampleTxHash = '0x' + 'ab'.repeat(32);

    it('Base Sepolia (84532) genera URL correcta', () => {
        const url = getExplorerTxUrl(84532, sampleTxHash);
        expect(url).toBe(`https://sepolia.basescan.org/tx/${sampleTxHash}`);
    });

    it('Base Mainnet (8453) genera URL correcta', () => {
        const url = getExplorerTxUrl(8453, sampleTxHash);
        expect(url).toBe(`https://basescan.org/tx/${sampleTxHash}`);
    });

    it('Ethereum Mainnet (1) genera URL correcta', () => {
        const url = getExplorerTxUrl(1, sampleTxHash);
        expect(url).toBe(`https://etherscan.io/tx/${sampleTxHash}`);
    });

    it('Polygon (137) genera URL correcta', () => {
        const url = getExplorerTxUrl(137, sampleTxHash);
        expect(url).toBe(`https://polygonscan.com/tx/${sampleTxHash}`);
    });

    it('chain desconocida devuelve null', () => {
        const url = getExplorerTxUrl(999999, sampleTxHash);
        expect(url).toBeNull();
    });

    it('Anvil local (31337) devuelve null', () => {
        const url = getExplorerTxUrl(31337, sampleTxHash);
        expect(url).toBeNull();
    });
});

describe('getNetworkName', () => {
    it('Base Sepolia (84532) devuelve nombre', () => {
        expect(getNetworkName(84532)).toBe('Base Sepolia');
    });

    it('Ethereum Mainnet (1) devuelve nombre', () => {
        expect(getNetworkName(1)).toBe('Ethereum Mainnet');
    });

    it('chain desconocida devuelve null', () => {
        expect(getNetworkName(999999)).toBeNull();
    });
});
