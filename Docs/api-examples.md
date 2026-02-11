# Ejemplos de uso de la API — Res ex Machina

## Requisitos previos

```bash
# Levantar entorno
docker compose up -d

# Aplicar migraciones
npm run db:push

# Arrancar API
npm run dev          # → http://localhost:3000

# Arrancar worker (otra terminal)
npm run worker:anchor
```

---

## 1. Health check

```bash
curl -s http://localhost:3000/v1/health | jq
```

Respuesta esperada:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-10T20:00:00.000Z",
  "services": {
    "postgres": { "status": "healthy", "latencyMs": 2 },
    "redis": { "status": "healthy", "latencyMs": 1 },
    "l2_blockchain": { "status": "healthy", "latencyMs": 150 }
  }
}
```

---

## 2. Registrar un hecho de generación (POST /records)

```bash
curl -X POST http://localhost:3000/v1/records \
  -H "Content-Type: application/json" \
  -d '{
    "pog_bundle": {
      "schema": "pog.v1",
      "content_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "agent_wallet": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      "model_id": "gpt-4o-2025-01",
      "runtime_id": "openai-api-v1",
      "generation_process": {
        "process_type": "direct",
        "human_intervention_level": 0,
        "pipeline_steps": 1
      },
      "timestamp": "2026-02-10T19:00:00.000Z",
      "nonce": "unique-nonce-1234567890",
      "signature": "0x<firma EIP-712 de 130 hex chars>"
    },
    "content_type": "text/plain",
    "visibility": "proof_only",
    "tags": ["generated", "text"],
    "fee_amount": 0.001,
    "fee_currency": "MATIC",
    "fee_tx_hash": "0x<hash de la tx de pago de fee en L2>"
  }' | jq
```

Respuesta (201 Created):
```json
{
  "record_id": "01936d8a-1234-7000-8000-000000000001",
  "state": "pending_anchor",
  "receipt_hash": "sha256:abc123...",
  "created_at": "2026-02-10T19:00:05.123Z"
}
```

---

## 3. Consultar un record por ID

```bash
curl -s http://localhost:3000/v1/records/01936d8a-1234-7000-8000-000000000001 | jq
```

---

## 4. Verificar existencia por content_hash

```bash
curl -s "http://localhost:3000/v1/records/verify?content_hash=sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" | jq
```

Respuesta (200):
```json
{
  "exists": true,
  "record_id": "01936d8a-1234-7000-8000-000000000001",
  "state": "anchored",
  "created_at": "2026-02-10T19:00:05.123Z",
  "receipt_hash": "sha256:abc123..."
}
```

---

## 5. Exportar receipt verificable

```bash
curl -s http://localhost:3000/v1/records/01936d8a-1234-7000-8000-000000000001/export | jq
```

Respuesta: receipt completo con anchor data (ver `verify-pog-offline.md`).

---

## 6. Intentar DELETE (debe fallar)

```bash
curl -X DELETE http://localhost:3000/v1/records/01936d8a-1234-7000-8000-000000000001 | jq
```

Respuesta (405):
```json
{
  "error": {
    "code": "method_not_allowed",
    "message": "Records are permanent and cannot be deleted (INV-001)"
  }
}
```

---

## Códigos de error comunes

| Status | Código | Causa |
|---|---|---|
| 400 | `invalid_payload` | Body malformado |
| 400 | `invalid_pog_schema` | PoG bundle no válido |
| 400 | `invalid_content_hash` | Hash no es sha256:{64hex} |
| 401 | `invalid_signature` | Firma EIP-712 inválida |
| 401 | `signer_mismatch` | Signer ≠ agent_wallet |
| 402 | `fee_not_verified` | Fee tx no encontrada |
| 402 | `fee_insufficient` | Pago insuficiente |
| 402 | `fee_wrong_recipient` | Destinatario incorrecto |
| 402 | `fee_tx_expired` | Tx > 24h |
| 404 | `record_not_found` | Record no existe |
| 405 | `method_not_allowed` | DELETE prohibido |
| 409 | `duplicate_content_hash` | Hash ya registrado |
| 409 | `duplicate_nonce` | Nonce reusado |
| 429 | `rate_limit_exceeded` | Demasiadas peticiones |

---

## Cómo generar una firma EIP-712 (para testing)

```typescript
import { privateKeyToAccount } from 'viem/accounts';
import { signTypedData } from 'viem/accounts';

const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');

const signature = await account.signTypedData({
  domain: {
    name: 'ResExMachina',
    version: '1',
    chainId: 0,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  },
  types: {
    PoGBundle: [
      { name: 'schema', type: 'string' },
      { name: 'content_hash', type: 'string' },
      { name: 'agent_wallet', type: 'address' },
      { name: 'model_id', type: 'string' },
      { name: 'runtime_id', type: 'string' },
      { name: 'process_type', type: 'string' },
      { name: 'human_intervention_level', type: 'uint8' },
      { name: 'pipeline_steps', type: 'uint16' },
      { name: 'timestamp', type: 'string' },
      { name: 'nonce', type: 'string' },
    ],
  },
  primaryType: 'PoGBundle',
  message: {
    schema: 'pog.v1',
    content_hash: 'sha256:e3b0c44298fc1c149afbf4c8996fb924...',
    agent_wallet: account.address,
    model_id: 'gpt-4o',
    runtime_id: 'openai-v1',
    process_type: 'direct',
    human_intervention_level: 0,
    pipeline_steps: 1,
    timestamp: new Date().toISOString(),
    nonce: `nonce-${Date.now()}-${Math.random().toString(36)}`,
  },
});
```
