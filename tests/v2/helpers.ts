// SPDX-License-Identifier: Apache-2.0
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { keccak256, toBytes, type Hex } from 'viem';
import { privateKeyToAccount, generatePrivateKey, type PrivateKeyAccount } from 'viem/accounts';
import { pogDomain, signDeclaration, sha256, metadataHash, type PoGDeclaration } from '@res-ex-machina/pog';
import * as schema from '../../src/db/schema.js';
import type { Db } from '../../src/v2/store.js';
import type { V2Config } from '../../src/v2/accept.js';

/** Real Postgres in process, with the repository's migrations applied from scratch. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
    const pg = new PGlite();
    const db = drizzle(pg, { schema });
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
    return { db: db as unknown as Db, close: () => pg.close() };
}

export const CONTRACT = '0x00000000000000000000000000000000000082a3' as const;
export const cfg = (over: Partial<V2Config> = {}): V2Config => ({
    enabled: true, chainId: 84532, contract: CONTRACT, agentDailyQuota: 5, globalDailyQuota: 100, ...over,
});

let counter = 0;
export async function signed(account: PrivateKeyAccount = privateKeyToAccount(generatePrivateKey()), over: Partial<PoGDeclaration> = {}, metadata?: Record<string, string>) {
    const domain = pogDomain(84532, CONTRACT);
    const declaration: PoGDeclaration = {
        agent: account.address, contentHash: sha256(`content ${++counter}`), inputHash: sha256('prompt'),
        modelId: 'example:model', runtimeId: 'tests/1', processType: 0, humanIntervention: 1, pipelineSteps: 1,
        declaredAt: BigInt(Math.floor(Date.now() / 1000)), nonce: keccak256(toBytes(`nonce ${counter} ${Math.random()}`)),
        metadataHash: metadataHash(metadata ?? null), ...over,
    };
    const signature = await signDeclaration(account, domain, declaration);
    const body = { declaration: { ...declaration, declaredAt: declaration.declaredAt.toString() }, signature, ...(metadata ? { metadata } : {}) };
    return { account, declaration, signature, body, domain };
}

export const asHex = (s: string) => s as Hex;
