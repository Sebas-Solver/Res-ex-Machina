# Receipt Verification Specification — rex.receipt.v1

> **Versión:** 1.2
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
receipt_hash = "sha256:" + HEX(SHA-256(input))
```

### Reglas de canonización (NORMATIVAS)

| # | Regla | Detalle |
|---|---|---|
| 1 | **Separador** | Carácter pipe `|` (U+007C), sin espacios antes ni después |
| 2 | **agent_wallet** | Se convierte a **lowercase** ANTES de concatenar. Ejemplo: `0xDd6894B5...` → `0xdd6894b5...`. El prefijo `0x` se mantiene |
| 3 | **created_at** | Formato **ISO 8601 UTC** exacto: `YYYY-MM-DDTHH:MM:SS.mmmZ`. Siempre con 3 dígitos de milisegundos. Siempre en UTC (sufijo `Z`). Ejemplo: `2026-02-14T14:32:54.661Z`. No se aceptan variantes con offset (`+00:00`) ni sin milisegundos. **Nota:** `created_at` es generado por el servidor RxM en el momento de aceptación del record (ver sección 5: Modelo de Confianza) |
| 4 | **Encoding** | La cadena completa se codifica como **UTF-8** antes de aplicar SHA-256 |
| 5 | **Sin padding** | No hay espacios, newlines, ni caracteres extra entre campos ni al inicio/final |
| 6 | **Prefijo** | El resultado lleva el prefijo `sha256:` seguido de 64 caracteres hexadecimales en lowercase |

### Ejemplo

```
Input:  "019c5c91-a485-74f5-be0b-4941c49ac507|sha256:aed327...06ac|0xdd6894b5447cd6a7103201372041dcac8b2a0244|v4n1rx9v3gassh4k59135f1fgkdp6l3i|2026-02-14T14:32:54.661Z"
Output: "sha256:20b13a4c3459ce4c6d622a64a7d504872f0620007356b057aa83b19eb140396a"
```

### Pseudocódigo (para implementaciones en cualquier lenguaje)

```python
# Python
import hashlib

canonical = "|".join([
    record_id,                          # UUID v7
    content_hash,                       # "sha256:{64hex}"
    agent_wallet.lower(),               # "0x{40hex}" lowercase
    nonce,                              # string
    created_at,                         # "2026-02-14T14:32:54.661Z"
])

digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
receipt_hash = f"sha256:{digest}"
```

```go
// Go
canonical := strings.Join([]string{
    recordID,
    contentHash,
    strings.ToLower(agentWallet),
    nonce,
    createdAt,
}, "|")

hash := sha256.Sum256([]byte(canonical))
receiptHash := fmt.Sprintf("sha256:%x", hash)
```

---

## 2. Firma EIP-712 (PoG Bundle)

La firma del PoG bundle usa el estándar [EIP-712](https://eips.ethereum.org/EIPS/eip-712) (typed structured data signing).

### Domain

```json
{
    "name": "ResExMachina",
    "version": "1",
    "chainId": 0,
    "verifyingContract": "0x0000000000000000000000000000000000000000"
}
```

> **IMPORTANTE:** `chainId: 0` y `verifyingContract: 0x0000...0000` son los valores **reales de producción**, NO placeholders. Se usan estos valores porque la firma EIP-712 de RxM es **off-chain**: no está vinculada a ningún contrato desplegado ni a ninguna cadena específica. La firma certifica la identidad del agente, no una interacción con un contrato.

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

### Mapeo de campos

El PoG bundle tiene `generation_process` como objeto anidado, pero la firma EIP-712 requiere campos planos. El mapeo es:

| Campo en PoG bundle | Campo en EIP-712 message |
|---|---|
| `generation_process.process_type` | `process_type` |
| `generation_process.human_intervention_level` | `human_intervention_level` |
| `generation_process.pipeline_steps` | `pipeline_steps` |
| Todos los demás campos | Se copian directamente |
| `signature` | **Se excluye** del message (es el output) |
| `generation_process` (objeto) | **Se excluye** (se usan los campos planos) |

### Verificación

Para verificar la firma:
1. Reconstruir el `message` plano a partir de los campos del `pog_bundle` (ver mapeo arriba)
2. Usar `verifyTypedData` (viem), `eth_signTypedData_v4` (ethers), o equivalente
3. Comprobar que la dirección recuperada coincide con `agent_wallet`

---

## 3. Anchoring en Blockchain

### Método

```
anchor_method: "calldata"
```

El `receipt_hash` se almacena en la blockchain como una cadena de texto UTF-8 en el campo `data` (calldata) de una transacción ordinaria.

### Detalles técnicos del encoding

```
1. receipt_hash string (ej: "sha256:20b13a4c...")
2. → codificar como bytes UTF-8
3. → convertir cada byte a su representación hexadecimal
4. → prefijar con "0x" para formar el calldata
5. → enviar como tx.data en una transacción de valor 0 ETH
```

**Ejemplo concreto:**

```
receipt_hash:  "sha256:20b13a4c3459ce4c..."
UTF-8 bytes:   [0x73, 0x68, 0x61, 0x32, 0x35, 0x36, 0x3a, 0x32, 0x30, 0x62, ...]
                 s      h      a      2      5      6      :      2      0      b
tx.data (hex): "0x7368613235363a32306231336134633334353963653463..."
```

El calldata es el **string completo** `"sha256:{64hex}"` codificado como UTF-8 y luego a hexadecimal. **No es** el digest binario raw de 32 bytes.

### Verificación on-chain

```python
# Pseudocódigo
tx = get_transaction(anchor.tx_hash)
calldata_hex = tx.input[2:]                     # quitar "0x"
calldata_bytes = bytes.fromhex(calldata_hex)     # hex → bytes
calldata_text = calldata_bytes.decode("utf-8")   # bytes → string

assert calldata_text == anchor.anchored_hash     # "sha256:20b13a..."
```

### Transacción de anchoring

| Campo | Valor |
|---|---|
| `to` | `FEE_RECEIVER_ADDRESS` (dirección de RxM) |
| `value` | `0` (no transfiere ETH) |
| `data` | `receipt_hash` codificado como UTF-8→hex |
| `from` | `ANCHOR_WALLET` (wallet de servicio de RxM, no del agente) |

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

## 5. Modelo de Confianza

RxM es un **protocolo de atestación técnica**. Es fundamental entender qué garantiza y qué no.

### Lo que RxM garantiza (prueba técnica)

| Garantía | Mecanismo |
|---|---|
| **Identidad del firmante** | La `agent_wallet` que firmó el PoG bundle se verifica criptográficamente vía EIP-712. No es posible falsificar la firma sin la clave privada |
| **Integridad del contenido** | El `content_hash` (SHA-256) vincula el registro a un contenido específico. Cualquier modificación del contenido produce un hash diferente |
| **Momento de aceptación** | `created_at` es generado por el servidor RxM en el instante en que acepta el record. Este valor forma parte del `receipt_hash` y, por tanto, queda vinculado al anchoring en blockchain |
| **Existencia en un momento dado** | El anchoring en blockchain establece un **tope temporal superior**: el registro existía como tarde en el bloque donde fue anclado |
| **Inmutabilidad** | Una vez creado, un registro no puede ser modificado ni eliminado (INV-001, INV-002) |
| **No-replay** | El `nonce` es único por wallet (constraint en base de datos), impidiendo la reutilización de firmas |

### Lo que RxM NO garantiza (declaración del agente)

| Campo | Por qué no se verifica |
|---|---|
| **`model_id`** | RxM no puede verificar qué modelo de IA ejecutó realmente. El agente lo declara y RxM lo registra |
| **`runtime_id`** | RxM no tiene acceso al entorno de ejecución del agente |
| **`human_intervention_level`** | Es una autodeclaración; RxM no puede medir la intervención humana |
| **`process_type`** | Autodeclaración del tipo de proceso generativo |
| **`pog_bundle.timestamp`** | El agente declara su propio timestamp. RxM registra `created_at` como momento de aceptación, pero no verifica el timestamp del agente |

> **Analogía legal:** Un receipt de RxM es comparable a un **acta notarial de manifestaciones**: el notario (RxM) certifica que una persona (agent_wallet) declaró algo (pog_bundle) en un momento dado (created_at), y lo sella de forma inmutable (anchor). El notario NO certifica que lo declarado sea verdad.

### Semántica temporal: tres momentos distintos

```
┌─────────────────────┐    ┌──────────────────────┐    ┌────────────────────────┐
│ pog_bundle.timestamp │ →  │ created_at           │ →  │ anchor.anchored_at     │
│ Declarado por agente │    │ Fijado por servidor  │    │ Fijado por blockchain  │
│ ❌ No verificado     │    │ ✅ Parte del receipt  │    │ ✅ Inmutable on-chain   │
│                      │    │    hash               │    │                        │
└─────────────────────┘    └──────────────────────┘    └────────────────────────┘
```

`created_at` es generado por el servidor RxM en el momento de aceptación del record y forma parte del material del `receipt_hash`. Esto implica que el servidor participa en el proceso determinista del receipt. La blockchain establece un tope temporal superior independiente que cualquiera puede verificar.

---

## 6. Objeto Receipt Completo (rex.receipt.v1)

```json
{
    "schema": "rex.receipt.v1",
    "spec_version": "1.2",
    "record_id": "019c5c91-a485-74f5-be0b-4941c49ac507",
    "content_hash": "sha256:aed327...06ac",
    "content_type": "text/plain",
    "visibility": "proof_only",
    "pog_bundle": {
        "schema": "pog.v1",
        "content_hash": "sha256:aed327...06ac",
        "agent_wallet": "0xDd6894b5447CD6A7103201372041DcAC8b2A0244",
        "model_id": "gpt-4-test",
        "runtime_id": "test-script-alpha-v1",
        "generation_process": {
            "process_type": "direct",
            "human_intervention_level": 0,
            "pipeline_steps": 1
        },
        "timestamp": "2026-02-14T14:32:54.000Z",
        "nonce": "v4n1rx9v3gassh4k59135f1fgkdp6l3i",
        "signature": "0x... (65 bytes EIP-712)",
        "eip712_domain": {
            "name": "ResExMachina",
            "version": "1",
            "chain_id": 0,
            "verifying_contract": "0x0000000000000000000000000000000000000000"
        }
    },
    "receipt_hash": "sha256:20b13a4c3459ce4c6d622a64a7d504872f0620007356b057aa83b19eb140396a",
    "verification": {
        "receipt_hash_algo": "sha256",
        "receipt_canonicalization": "pipe-separated",
        "receipt_fields": "record_id|content_hash|agent_wallet_lowercase|nonce|created_at_iso8601",
        "eip712_primary_type": "PoGBundle"
    },
    "fee": {
        "amount": "0.00020000",
        "currency": "ETH",
        "tx_hash": "0x185afe...1516",
        "chain_id": 84532,
        "to": "0x13bB040691BBa236a2A2AB83fE904EcC965Ba8a0"
    },
    "anchor": {
        "tx_hash": "0xcb5529f3...",
        "block": 37655645,
        "chain_id": 84532,
        "anchored_at": "2026-02-14T14:33:10.000Z",
        "anchored_hash": "sha256:20b13a4c3459ce4c6d622a64a7d504872f0620007356b057aa83b19eb140396a",
        "anchor_method": "calldata"
    },
    "state": "anchored",
    "created_at": "2026-02-14T14:32:54.661Z"
}
```

> **Nota sobre `eip712_domain`:** `chain_id: 0` y `verifying_contract: 0x0000...0000` son los valores **reales de producción**, NO placeholders. La firma EIP-712 de RxM es off-chain por diseño: certifica la identidad del agente sin vincularse a ningún contrato desplegado. Esto permite que la misma firma sea válida independientemente de la red donde se ancle.

> **Nota sobre `spec_version`:** Indica la versión de esta especificación con la que se generó el receipt. Si en el futuro cambian las reglas de canonización, el anchor_method, o los tipos EIP-712, el verificador debe aplicar las reglas correspondientes a la `spec_version` del receipt.

---

## 7. Vector de Prueba Oficial

Este vector permite a cualquier implementación verificar que su código produce los resultados correctos.

### Inputs

```
record_id:     "test-0001-0001-0001-000000000001"
content_hash:  "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
agent_wallet:  "0xDd6894b5447CD6A7103201372041DcAC8b2A0244"
nonce:         "test-nonce-alpha-001"
created_at:    "2026-01-01T00:00:00.000Z"
```

### Expected receipt_hash

```
Canonical input (pipe-separated):
"test-0001-0001-0001-000000000001|sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|0xdd6894b5447cd6a7103201372041dcac8b2a0244|test-nonce-alpha-001|2026-01-01T00:00:00.000Z"

Expected output:
"sha256:c75e79a3eca4c0e5d03ddeb9a212d8b803174ef6036bfc08e3014a7121d7cd48"
```

> El hash de referencia: `e3b0c44298fc1c149afbf4c8996fb924...` es el SHA-256 del string vacío (""), un valor estándar conocido.

### Cómo usar este vector

```bash
# Verificar con Node.js
echo -n 'test-0001-0001-0001-000000000001|sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855|0xdd6894b5447cd6a7103201372041dcac8b2a0244|test-nonce-alpha-001|2026-01-01T00:00:00.000Z' | sha256sum

# Si tu implementación produce el mismo hash, es correcta.
```
