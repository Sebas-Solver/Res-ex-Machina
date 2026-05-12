// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock de viem ---
const mockVerifyMessage = vi.fn();
vi.mock('viem', () => ({
    verifyMessage: (...args: unknown[]) => mockVerifyMessage(...args),
}));

import { walletAuth } from '../src/middleware/walletAuth.js';

/** Helper: crea un request falso con headers */
function fakeRequest(headers: Record<string, string> = {}) {
    return { headers } as never;
}

describe('walletAuth middleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rejects if authentication headers are missing', async () => {
        await expect(walletAuth(fakeRequest())).rejects.toMatchObject({
            code: 'missing_auth_headers',
            statusCode: 401,
        });
    });

    it('rechaza si falta X-Signature', async () => {
        await expect(walletAuth(fakeRequest({
            'x-wallet-address': '0xDd6894b5447CD6A7103201372041DcAC8b2A0244',
            'x-timestamp': new Date().toISOString(),
        }))).rejects.toMatchObject({
            code: 'missing_auth_headers',
            statusCode: 401,
        });
    });

    it('rejects if X-Wallet-Address has invalid format', async () => {
        await expect(walletAuth(fakeRequest({
            'x-wallet-address': 'not-a-wallet',
            'x-signature': '0x1234',
            'x-timestamp': new Date().toISOString(),
        }))).rejects.toMatchObject({
            code: 'invalid_wallet_address',
            statusCode: 401,
        });
    });

    it('rejects if X-Timestamp is expired (>5 min)', async () => {
        const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
        await expect(walletAuth(fakeRequest({
            'x-wallet-address': '0xDd6894b5447CD6A7103201372041DcAC8b2A0244',
            'x-signature': '0x1234',
            'x-timestamp': oldTimestamp,
        }))).rejects.toMatchObject({
            code: 'auth_timestamp_expired',
            statusCode: 401,
        });
    });

    it('rejects if X-Timestamp has invalid format', async () => {
        await expect(walletAuth(fakeRequest({
            'x-wallet-address': '0xDd6894b5447CD6A7103201372041DcAC8b2A0244',
            'x-signature': '0x1234',
            'x-timestamp': 'not-a-date',
        }))).rejects.toMatchObject({
            code: 'auth_timestamp_expired',
            statusCode: 401,
        });
    });

    it('rejects if signature is invalid (verifyMessage returns false)', async () => {
        mockVerifyMessage.mockResolvedValue(false);
        await expect(walletAuth(fakeRequest({
            'x-wallet-address': '0xDd6894b5447CD6A7103201372041DcAC8b2A0244',
            'x-signature': '0xabcdef',
            'x-timestamp': new Date().toISOString(),
        }))).rejects.toMatchObject({
            code: 'auth_signature_invalid',
            statusCode: 401,
        });
    });

    it('rechaza si viem lanza error (firma malformada)', async () => {
        mockVerifyMessage.mockRejectedValue(new Error('bad signature encoding'));
        await expect(walletAuth(fakeRequest({
            'x-wallet-address': '0xDd6894b5447CD6A7103201372041DcAC8b2A0244',
            'x-signature': '0xabcdef',
            'x-timestamp': new Date().toISOString(),
        }))).rejects.toMatchObject({
            code: 'auth_signature_invalid',
            statusCode: 401,
        });
    });

    it('successful authentication → injects authenticatedWallet', async () => {
        mockVerifyMessage.mockResolvedValue(true);
        const timestamp = new Date().toISOString();
        const request = fakeRequest({
            'x-wallet-address': '0xDd6894b5447CD6A7103201372041DcAC8b2A0244',
            'x-signature': '0xabc123',
            'x-timestamp': timestamp,
        });

        await walletAuth(request);

        // Verifica que authenticatedWallet se inyecta en lowercase
        expect((request as unknown as { authenticatedWallet: string }).authenticatedWallet)
            .toBe('0xdd6894b5447cd6a7103201372041dcac8b2a0244');

        // Verifica que verifyMessage fue llamado con el mensaje correcto
        expect(mockVerifyMessage).toHaveBeenCalledWith({
            address: '0xDd6894b5447CD6A7103201372041DcAC8b2A0244',
            message: `RexAuth:${timestamp}`,
            signature: '0xabc123',
        });
    });

    it('el mensaje firmado debe usar el formato RexAuth:{timestamp}', async () => {
        mockVerifyMessage.mockResolvedValue(true);
        const timestamp = '2026-02-16T11:00:00.000Z';

        // Simulates that the timestamp is within the window
        vi.spyOn(Date, 'now').mockReturnValue(new Date(timestamp).getTime());

        await walletAuth(fakeRequest({
            'x-wallet-address': '0xDd6894b5447CD6A7103201372041DcAC8b2A0244',
            'x-signature': '0xabc',
            'x-timestamp': timestamp,
        }));

        expect(mockVerifyMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'RexAuth:2026-02-16T11:00:00.000Z',
            }),
        );

        vi.restoreAllMocks();
    });
});
