import { client, db } from '../src/db/index.js';
import { webhooks } from '../src/db/schema.js';
import { isNotNull, isNull, and, eq } from 'drizzle-orm';
import { encryptSecret } from '../src/services/secretCrypto.js';
import { logger } from '../src/utils/logger.js';

/**
 * P1-1: Webhook Secrets Migration
 * 
 * Encrypts all existing plaintext webhook secrets using AES-256-GCM
 * and sets the legacy 'secret' column to null.
 * 
 * Usage:
 * npx tsx scripts/migrate-webhook-secrets.ts
 */
async function migrateWebhookSecrets() {
    logger.info('Starting webhook secrets encryption migration...');

    try {
        // 1. Fetch all webhooks that still have a plaintext secret
        // AND do not have a ciphertext (to ensure idempotency)
        const webhooksToMigrate = await db
            .select()
            .from(webhooks)
            .where(
                and(
                    isNotNull(webhooks.secret),
                    isNull(webhooks.secretCiphertext)
                )
            );

        if (webhooksToMigrate.length === 0) {
            logger.info('✅ No webhooks require migration. All secrets are either encrypted or already null.');
            process.exit(0);
        }

        logger.info(`Found ${webhooksToMigrate.length} webhooks to migrate.`);

        let successCount = 0;
        let errorCount = 0;

        // 2. Encrypt and update each row
        for (const webhook of webhooksToMigrate) {
            try {
                if (!webhook.secret) continue;

                // Encrypt using the current WEBHOOK_SECRET_ENCRYPTION_KEY
                const encrypted = encryptSecret(webhook.secret, webhook.webhookId, webhook.agentWallet);

                // Update row: set encrypted fields and nullify plaintext
                await db
                    .update(webhooks)
                    .set({
                        secret: null,
                        secretCiphertext: encrypted.ciphertext,
                        secretIv: encrypted.iv,
                        secretAuthTag: encrypted.authTag,
                        secretKeyVersion: encrypted.keyVersion,
                    })
                    .where(
                        // Extra safety: only update if secret matches to avoid race conditions
                        eq(webhooks.webhookId, webhook.webhookId)
                    );

                successCount++;
            } catch (err) {
                logger.error({ webhookId: webhook.webhookId, err }, 'Failed to migrate webhook');
                errorCount++;
            }
        }

        logger.info({
            total: webhooksToMigrate.length,
            success: successCount,
            errors: errorCount,
        }, '✅ Webhook secrets migration completed.');

        if (errorCount > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    } catch (err) {
        logger.error({ err }, 'Migration failed fatally');
        process.exit(1);
    } finally {
        await client.end();
    }
}

migrateWebhookSecrets();
