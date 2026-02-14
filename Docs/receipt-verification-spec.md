# Receipt Verification Specification — rex.receipt.v1

> **Versión:** 1.0
> **Fecha:** 14 de febrero de 2026
> **Estado:** Alpha

---

## 1. Receipt Hash (receipt_hash)

El `receipt_hash` es una huella SHA-256 que vincula de forma determinista los campos clave de un registro. Es el valor que se ancla en la blockchain.

### Algoritmo

```
receipt_hash_algo: "sha256"
receipt_canonicalization: "pipe-separated"
```

### Cálculo

```
input = record_id | content_hash | agent_wallet_lowercase | nonce | created_at_iso8601
receipt_hash = "sha256:" + SHA-256(input)
```

**Reglas de canonización:**
1. Separador: `|` (pipe, U+007C)
2. `agent_wallet`: siempre en lowercase (`0xDd68...` → `0xdd68...`)
3. `created_at`: formato ISO 8601 con millisegundos y Z (`2026-02-14T14:32:54.661Z`)
4. Sin espacios ni padding entre campos
5. Encoding: UTF-8

### Ejemplo

```
Input:  "019c5c91-a485-74f5-be0b-4941c49ac507|sha256:aed327...06ac|0xdd6894b5447cd6a7103201372041dcac8b2a0244|v4n1rx9v3gassh4k59135f1fgkdp6l3i|2026-02-14T14:32:54.661Z"
Output: "sha256:20b13a4c3459ce4c6d622a64a7d504872f0620007356b057aa83b19eb140396a"
```

---

## 2. Firma EIP-712 (PoG Bundle)

La firma del PoG bundle usa el estándar [EIP-712](https://eips.ethereum.org/EIPS/eip-712) (typed structured data signing).

### Domain

```json
{
    "name": "ResExMachina",
    "version": "1",
    "chain_id": 0,
    "verifying_contract": "0x0000000000000000000000000000000000000000"
}
```

> `chain_id: 0` y `verifying_contract: 0x0` indican que la firma es off-chain (no vinculada a ningún contrato ni cadena específica).

### Types

```json
{
    "PoGBundle": [
        { "name": "schema", "type": "string" },
        { "name": "content_hash", "type": "string" },
        { "name": "agent_wallet", "type": "address" },
        { "name": "model_id", "type": "string" },
        { "name": "runtime_id", "type": "string" },
        { "name": "process_type", "type": "string" },
        { "name": "human_intervention_level", "type": "uint8" },
        { "name": "pipeline_steps", "type": "uint16" },
        { "name": "timestamp", "type": "string" },
        { "name": "nonce", "type": "string" }
    ]
}
```

### Verificación

Para verificar la firma:
1. Reconstruir el `message` a partir de los campos del `pog_bundle`
2. Usar `verifyTypedData` (viem) o equivalente con el domain y types anteriores
3. Comprobar que la dirección recuperada coincide con `agent_wallet`

---

## 3. Anchoring en Blockchain

### Método

```
anchor_method: "calldata"
```

El `receipt_hash` se codifica como UTF-8 en el campo `data` (calldata) de una transacción ordinaria con valor 0 ETH.

### Verificación on-chain

1. Obtener la transacción por `anchor.tx_hash` en la chain `anchor.chain_id`
2. Decodificar el campo `input` (calldata) de UTF-8 a string
3. Comparar con `anchor.anchored_hash` — deben ser idénticos

### Ejemplo

```
tx.input (hex): 0x736861...
tx.input (utf8): "sha256:20b13a4c3459ce4c6d622a64a7d504872f0620007356b057aa83b19eb140396a"
anchored_hash:   "sha256:20b13a4c3459ce4c6d622a64a7d504872f0620007356b057aa83b19eb140396a"
→ ✅ Match
```

---

## 4. Campos de Declaración (no verificados por la plataforma)

Los siguientes campos son **declaraciones firmadas del agente**, no verificadas por RxM:

| Campo | Descripción | Verificación |
|---|---|---|
| `model_id` | Identificador del modelo de IA utilizado | ❌ Declaración firmada |
| `runtime_id` | Identificador del entorno de ejecución | ❌ Declaración firmada |
| `process_type` | Tipo de proceso generativo | ❌ Declaración firmada |
| `human_intervention_level` | Nivel de intervención humana (0-4) | ❌ Declaración firmada |
| `pipeline_steps` | Número de pasos del pipeline | ❌ Declaración firmada |

Estos campos están firmados criptográficamente (EIP-712) por la `agent_wallet`, lo que garantiza que **el agente declaró esos valores**, pero no que sean verídicos. La verificación de veracidad de `model_id` se planifica para futuras versiones.

---

## 5. Objeto Receipt Completo (rex.receipt.v1)

```json
{
    "schema": "rex.receipt.v1",
    "record_id": "UUID v7",
    "content_hash": "sha256:...",
    "content_type": "text/plain",
    "visibility": "proof_only",
    "pog_bundle": {
        "schema": "pog.v1",
        "content_hash": "sha256:...",
        "agent_wallet": "0x...",
        "model_id": "string (claim)",
        "runtime_id": "string (claim)",
        "generation_process": { "..." },
        "timestamp": "ISO 8601",
        "nonce": "string",
        "signature": "0x... (65 bytes EIP-712)",
        "eip712_domain": {
            "name": "ResExMachina",
            "version": "1",
            "chain_id": 0,
            "verifying_contract": "0x0000..."
        }
    },
    "receipt_hash": "sha256:...",
    "verification": {
        "receipt_hash_algo": "sha256",
        "receipt_canonicalization": "pipe-separated",
        "receipt_fields": "record_id|content_hash|agent_wallet_lowercase|nonce|created_at_iso8601",
        "eip712_primary_type": "PoGBundle"
    },
    "fee": {
        "amount": "0.00020000",
        "currency": "ETH",
        "tx_hash": "0x...",
        "chain_id": 84532,
        "to": "0x..."
    },
    "anchor": {
        "tx_hash": "0x...",
        "block": 37655645,
        "chain_id": 84532,
        "anchored_at": "ISO 8601",
        "anchored_hash": "sha256:...",
        "anchor_method": "calldata"
    },
    "state": "anchored",
    "created_at": "ISO 8601"
}
```
