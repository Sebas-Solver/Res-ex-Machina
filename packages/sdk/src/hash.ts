/**
 * Hashing de contenido para RxM.
 *
 * Usa WebCrypto (globalThis.crypto.subtle) como primer ciudadano,
 * con fallback a Node.js crypto para entornos legacy.
 *
 * Formato de salida: "sha256:{64 hex chars}"
 */

/**
 * Convierte contenido a Uint8Array para hashing.
 */
function toBytes(content: string | Buffer | Uint8Array): Uint8Array {
    if (typeof content === 'string') {
        return new TextEncoder().encode(content);
    }
    if (content instanceof Uint8Array) {
        return content;
    }
    // Buffer (Node.js)
    return new Uint8Array(content);
}

/**
 * Calcula SHA-256 del contenido y retorna en formato RxM: "sha256:{64hex}".
 *
 * @param content - string, Buffer, o Uint8Array
 * @returns "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
 */
export async function computeContentHash(content: string | Buffer | Uint8Array): Promise<string> {
    const bytes = toBytes(content);

    // WebCrypto (disponible en Node 18+, Browsers, Workers)
    if (globalThis.crypto?.subtle) {
        const data = new Uint8Array(bytes);
        const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
        const hashArray = new Uint8Array(hashBuffer);
        const hashHex = Array.from(hashArray)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        return `sha256:${hashHex}`;
    }

    // Fallback: Node.js crypto
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(bytes).digest('hex');
    return `sha256:${hash}`;
}
