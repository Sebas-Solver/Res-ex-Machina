# @rxm/sdk

**SDK oficial de [Res ex Machina](https://github.com/Sebas-Solver/Res-ex-Machina)** — Registro neutral de hechos de generación por IA.

Reduce la integración de ~80 líneas a ~5 líneas.

## Instalación

```bash
npm install @rxm/sdk viem
```

## Quick Start

```typescript
import { RxMClient } from '@rxm/sdk';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount('0x...');

const rxm = new RxMClient({
  account,
  rpcUrl: 'https://sepolia.base.org',
  apiUrl: 'https://res-ex-machina-api.onrender.com',
  feeReceiverAddress: '0x...',
});

// 5 líneas: hash → sign → fee → POST
const receipt = await rxm.record('Generated output by AI', {
  modelId: 'openai:gpt-4o:2026-01',
});

console.log(receipt.recordId, receipt.receiptHash);
```

## Modos de uso

### Modo Simple (baterías incluidas)

```typescript
const receipt = await rxm.record(content, {
  modelId: 'openai:gpt-4o:2026-01',
  tags: ['report', 'quarterly'],
  waitForAnchor: true, // espera a que se ancle en blockchain
});
```

### Modo BYO (Bring Your Own)

Para integradores que controlan fees, hash, o ambos:

```typescript
const receipt = await rxm.record(content, {
  modelId: 'anthropic:claude-sonnet-4-20250514:2026-01',
  feeTxHash: '0xabc...',    // ya pagaste el fee → NO paga otra vez
  contentHash: 'sha256:...' // ya calculaste el hash → NO recalcula
});
```

## Batch

```typescript
// v0.1: cada item requiere feeTxHash (BYO)
const results = await rxm.recordBatch([
  { content: 'Output 1', options: { modelId: 'm:v:1', feeTxHash: '0x...' } },
  { content: 'Output 2', options: { modelId: 'm:v:1', feeTxHash: '0x...' } },
]);
```

## Webhooks

```typescript
// Subcliente separado de record()
const wh = await rxm.webhooks.register('https://my-server.com/hook');
console.log(wh.secret); // HMAC secret — se muestra solo una vez

const list = await rxm.webhooks.list();
await rxm.webhooks.delete(wh.webhookId);
```

## Consulta y Verificación

```typescript
const exists = await rxm.verify('content or sha256:hash');
const detail = await rxm.getRecord('record-id');
const exported = await rxm.export('record-id');
const list = await rxm.listRecords({ state: 'anchored', limit: 10 });
```

## Manejo de errores

```typescript
import { RxMRateLimitError, RxMValidationError } from '@rxm/sdk';

try {
  await rxm.record(content, { modelId: '...' });
} catch (e) {
  if (e instanceof RxMRateLimitError) {
    // Los agentes pueden reintentar programáticamente
    await sleep(e.retryAfterMs);
  }
  if (e instanceof RxMValidationError) {
    // Error de validación local (sin llamar a la API)
    console.error(e.code, e.message);
  }
}
```

## Opciones del constructor

| Opción | Tipo | Default | Descripción |
|---|---|---|---|
| `account` | `Account` | — | viem Account (requerido) |
| `rpcUrl` | `string` | — | RPC URL de la L2 (requerido) |
| `apiUrl` | `string` | — | URL de la API RxM (requerido) |
| `feeReceiverAddress` | `Address` | — | Dirección que recibe fees (requerido) |
| `feeAmount` | `number` | `0.01` | Fee en nativo (ETH/MATIC) |
| `chainId` | `number` | `84532` | Chain ID (Base Sepolia) |
| `httpTimeoutMs` | `number` | `10000` | Timeout HTTP en ms |
| `httpRetries` | `number` | `3` | Reintentos HTTP |

## Opciones de `record()`

| Opción | Tipo | Default | Descripción |
|---|---|---|---|
| `modelId` | `string` | — | `provider:model:version` (requerido) |
| `contentType` | `string` | `text/plain` | Tipo MIME |
| `tags` | `string[]` | `[]` | Máx 10, 64 chars cada uno |
| `processType` | `ProcessType` | `direct` | `direct\|pipeline\|iterative\|autonomous` |
| `humanInterventionLevel` | `number` | `0` | 0-5 |
| `feeTxHash` | `Hex` | — | BYO: skip fee payment |
| `contentHash` | `string` | — | BYO: skip hash calculation |
| `waitForAnchor` | `boolean` | `false` | Esperar anchoring |

## Requisitos

- **Node.js ≥ 18**
- **viem ≥ 2.0** (peerDependency)

## Licencia

ISC
