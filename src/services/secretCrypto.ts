import crypto from 'crypto';

export interface EncryptedSecret {
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: number;
}

const CURRENT_KEY_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';

// Cached key
let encryptionKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
    if (encryptionKey) return encryptionKey;

    const b64Key = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    if (!b64Key) {
        throw new Error('CRITICAL CONFIG ERROR: WEBHOOK_SECRET_ENCRYPTION_KEY environment variable is missing.');
    }

    const key = Buffer.from(b64Key, 'base64');
    if (key.length !== 32) {
        throw new Error('CRITICAL CONFIG ERROR: WEBHOOK_SECRET_ENCRYPTION_KEY must be exactly 32 bytes when base64 decoded.');
    }

    encryptionKey = key;
    return encryptionKey;
}

// Requisito CTO (Fail-fast): Enforce fail-fast check at startup.
// Crashes the process (API and Worker) if env var is missing or invalid.
getEncryptionKey();

export function getKeyVersion(): number {
    return CURRENT_KEY_VERSION;
}

/**
 * Encrypts a webhook secret using AES-256-GCM.
 * The AAD binds the ciphertext to the specific webhook row to prevent tampering.
 */
export function encryptSecret(plaintext: string, webhookId: string, wallet: string): EncryptedSecret {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12); // 96-bit IV is recommended for GCM
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // AAD binds the ciphertext to the specific webhook row
    const aad = Buffer.from(`${webhookId}:${wallet.toLowerCase()}`);
    cipher.setAAD(aad);

    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        ciphertext: ciphertext.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        keyVersion: CURRENT_KEY_VERSION
    };
}

/**
 * Decrypts a webhook secret using AES-256-GCM.
 * Note: Node.js's crypto.createDecipheriv uses OpenSSL internally for AES-256-GCM.
 * OpenSSL's internal auth_tag verification is constant-time by default,
 * so no manual timingSafeEqual is needed here.
 */
export function decryptSecret(encrypted: EncryptedSecret, webhookId: string, wallet: string): string {
    if (encrypted.keyVersion !== CURRENT_KEY_VERSION) {
        throw new Error(`Unsupported key version: ${encrypted.keyVersion}`);
    }

    try {
        const key = getEncryptionKey();
        const iv = Buffer.from(encrypted.iv, 'hex');
        const authTag = Buffer.from(encrypted.authTag, 'hex');
        const ciphertext = Buffer.from(encrypted.ciphertext, 'hex');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        
        const aad = Buffer.from(`${webhookId}:${wallet.toLowerCase()}`);
        decipher.setAAD(aad);
        decipher.setAuthTag(authTag);

        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return plaintext.toString('utf8');
    } catch {
        // Log redaction policy: Do not leak key, ciphertext, auth_tag, or plaintext in error messages.
        throw new Error('Webhook decryption failed (authentication tag or ciphertext invalid)');
    }
}
