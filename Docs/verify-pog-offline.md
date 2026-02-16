# Cómo verificar un PoG offline

Este documento explica cómo verificar que un Proof of Generation (PoG) es auténtico **sin depender del servidor de Res ex Machina**.

---

## 1. Obtener el receipt

```bash
curl https://api.resexmachina.io/v1/records/{record_id}/export > receipt.json
```

Obtendrás un JSON como este:

```json
{
  "schema": "rex.receipt.v1",
  "record_id": "01936d8a-1234-7000-8000-000000000001",
  "content_hash": "sha256:a1b2c3d4e5f6...",
  "pog_bundle": {
    "schema": "pog.v1",
    "content_hash": "sha256:a1b2c3d4e5f6...",
    "agent_wallet": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "model_id": "openai:gpt-4o:2026-01",
    "runtime_id": "node-22.x",
    "generation_process": {
      "process_type": "direct",
      "human_intervention_level": 0,
      "pipeline_steps": 1
    },
    "timestamp": "2026-01-15T10:30:00.000Z",
    "nonce": "abc123def456ghi789",
    "signature": "0x..."
  },
  "receipt_hash": "sha256:...",
  "anchor": {
    "tx_hash": "0x...",
    "block": 58123456,
    "chain_id": 137,
    "anchored_at": "2026-01-15T10:31:22.000Z"
  }
}
```

---

## 2. Verificar la firma EIP-712

La firma demuestra que el `agent_wallet` declarado realmente firmó este PoG.

### Con viem (JavaScript/TypeScript)

```typescript
import { verifyTypedData } from 'viem';

const domain = {
  name: 'ResExMachina',
  version: '1',
  chainId: 0,
  verifyingContract: '0x0000000000000000000000000000000000000000',
};

const types = {
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
};

const pog = receipt.pog_bundle;
const message = {
  schema: pog.schema,
  content_hash: pog.content_hash,
  agent_wallet: pog.agent_wallet,
  model_id: pog.model_id,
  runtime_id: pog.runtime_id,
  process_type: pog.generation_process.process_type,
  human_intervention_level: pog.generation_process.human_intervention_level,
  pipeline_steps: pog.generation_process.pipeline_steps,
  timestamp: pog.timestamp,
  nonce: pog.nonce,
};

const isValid = await verifyTypedData({
  address: pog.agent_wallet,
  domain,
  types,
  primaryType: 'PoGBundle',
  message,
  signature: pog.signature,
});

console.log('Firma válida:', isValid); // true
```

### Con ethers.js

```typescript
import { ethers } from 'ethers';

const recoveredAddress = ethers.verifyTypedData(domain, types, message, pog.signature);
const isValid = recoveredAddress.toLowerCase() === pog.agent_wallet.toLowerCase();
console.log('Firma válida:', isValid);
```

---

## 3. Verificar el receipt_hash

El `receipt_hash` vincula de forma determinista todos los datos del registro.

```typescript
import { createHash } from 'crypto';

const canonical = [
  receipt.record_id,
  receipt.content_hash,
  receipt.pog_bundle.agent_wallet.toLowerCase(),
  receipt.pog_bundle.nonce,
  receipt.created_at,
].join('|');

const hash = createHash('sha256').update(canonical).digest('hex');
const expected = `sha256:${hash}`;

console.log('Receipt hash válido:', expected === receipt.receipt_hash); // true
```

---

## 4. Verificar el anchor on-chain

Si el record está anclado (`state: anchored`), puedes verificar que el `receipt_hash` fue grabado en la blockchain.

### Con un explorador

1. Ve a [Polygonscan](https://polygonscan.com/tx/{anchor.tx_hash})
2. En "Input Data", decodifica y verifica que contiene el `receipt_hash`

### Con viem (programático)

```typescript
import { createPublicClient, http } from 'viem';
import { polygon } from 'viem/chains';

const client = createPublicClient({
  chain: polygon,
  transport: http('https://polygon-rpc.com'),
});

const tx = await client.getTransaction({ hash: receipt.anchor.tx_hash });
// El input data contiene el receipt_hash
console.log('Anchor tx encontrada en bloque:', tx.blockNumber);
```

---

## 5. Verificar tu contenido contra el hash

Si tienes el contenido original, calcula su SHA-256 y compara:

```bash
# Linux/Mac
sha256sum mi_archivo.txt
# Output: a1b2c3d4e5f6... mi_archivo.txt

# Comparar con receipt.content_hash (sin el prefijo "sha256:")
```

```typescript
import { createHash } from 'crypto';
import fs from 'fs';

const content = fs.readFileSync('mi_archivo.txt');
const hash = `sha256:${createHash('sha256').update(content).digest('hex')}`;
console.log('Content hash match:', hash === receipt.content_hash);
```

---

## Resumen de verificación

| Check | Qué demuestra | Herramienta |
|---|---|---|
| Firma EIP-712 | El agent_wallet firmó este PoG | viem / ethers.js |
| Receipt hash | Los datos no fueron alterados | SHA-256 |
| Anchor on-chain | El registro existía en esa fecha | Polygonscan / viem |
| Content hash | Tu contenido coincide con lo registrado | sha256sum |
