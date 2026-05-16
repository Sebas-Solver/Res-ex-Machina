import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { db } from '../../src/db/index.js';
import { webhooks } from '../../src/db/schema.js';
import { enqueueWebhookDispatch, webhookQueue } from '../../src/services/webhookDispatcher.js';
import { startWebhookWorker, stopWebhookWorker } from '../../src/workers/webhook.worker.js';
import { encryptSecret } from '../../src/services/secretCrypto.js';
import { eq } from 'drizzle-orm';

// Mock url validator to bypass SSRF protection locally
vi.mock('../../src/utils/urlValidator.js', () => ({
    resolveAndValidateHostname: vi.fn().mockResolvedValue(undefined),
    isBlockedIp: vi.fn().mockReturnValue(false),
    validateWebhookUrl: vi.fn().mockResolvedValue(undefined),
}));

describe('Webhook Worker Runtime', () => {
    const testWallet = '0x1234567890123456789012345678901234567890';
    const testWebhookId = randomUUID();
    const testPlaintextSecret = 'test_secret_for_hmac_123';
    
    let server: Server;
    let serverPort: number;

    beforeAll(async () => {
        await new Promise<void>((resolve) => {
            server = createServer();
            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                serverPort = typeof address === 'object' && address ? address.port : 0;
                resolve();
            });
        });
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
        await db.delete(webhooks).where(eq(webhooks.webhookId, testWebhookId));
        await webhookQueue.close();
    });

    beforeEach(async () => {
        // Clear queue
        await webhookQueue.drain(true);
        await webhookQueue.clean(0, 1000, 'wait');
        await webhookQueue.clean(0, 1000, 'active');
        
        const { ciphertext, iv, authTag, keyVersion } = encryptSecret(testPlaintextSecret, testWebhookId, testWallet);
        
        await db.delete(webhooks).where(eq(webhooks.agentWallet, testWallet));
        
        const targetUrl = `http://127.0.0.1:${serverPort}/webhook`;

        await db.insert(webhooks).values({
            webhookId: testWebhookId,
            agentWallet: testWallet,
            url: targetUrl,
            secretCiphertext: ciphertext,
            secretIv: iv,
            secretAuthTag: authTag,
            secretKeyVersion: keyVersion,
            active: true,
            createdAt: new Date(),
        });
    });

    it('consumes webhook_dispatch jobs, sends HMAC, and avoids legacy keys', async () => {
        // Prepare local HTTP server to capture the request
        let requestHeaders: any = null;
        let requestBody = '';
        
        const requestPromise = new Promise<void>((resolve) => {
            server.once('request', (req, res) => {
                requestHeaders = req.headers;
                req.on('data', chunk => requestBody += chunk);
                req.on('end', () => {
                    res.writeHead(200);
                    res.end('OK');
                    resolve();
                });
            });
        });

        // Enqueue a job
        await enqueueWebhookDispatch(testWallet, 'record_123', 'initial', 'final');
        
        // Check job data in queue to ensure it does NOT have secret/url
        const jobs = await webhookQueue.getJobs(['waiting']);
        expect(jobs.length).toBe(1);
        const jobData = jobs[0].data;
        expect(jobData).not.toHaveProperty('secret');
        expect(jobData).not.toHaveProperty('url');
        expect(jobData).toHaveProperty('webhookId', testWebhookId);
        expect(jobData).toHaveProperty('payload');

        // Start worker
        const worker = startWebhookWorker();
        
        // Wait for job completion and the HTTP server to receive the request
        await Promise.all([
            requestPromise,
            new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Job completion timed out')), 5000);
                worker.once('completed', (job) => {
                    clearTimeout(timeout);
                    expect(job.name).toBe('deliver-webhook');
                    resolve();
                });
                worker.once('failed', (job, err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            })
        ]);

        await stopWebhookWorker();

        // Verify the HTTP request payload and headers
        expect(requestHeaders).not.toBeNull();
        expect(requestHeaders['x-rxm-signature']).toBeDefined();
        expect(requestHeaders['x-rxm-signature']).toContain('sha256=');
        
        const parsedBody = JSON.parse(requestBody);
        expect(parsedBody.event).toBe('state_changed');
        expect(parsedBody.data.record_id).toBe('record_123');
        expect(parsedBody.data.old_state).toBe('initial');
        expect(parsedBody.data.new_state).toBe('final');
    });
});
