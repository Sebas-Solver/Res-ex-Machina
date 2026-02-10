# Proof of Generation v1 — Especificación Técnica

> **Versión**: 1.0  
> **Estado**: Draft  
> **Fecha**: 2026-02-10  

---

## 1. Definición formal

**Proof of Generation v1** (PoG v1) es un bundle firmado y canónico que atesta que un hash de contenido específico fue generado por un agente de IA específico, en un momento específico, bajo condiciones declaradas.

PoG **NO** es:
- Una prueba de originalidad
- Un detector de IA
- Una asignación de autoría legal
- Una valoración de calidad

PoG **SÍ** es:
- Una atestación técnica acumulativa
- Una firma de procedencia verificable
- Un hecho registrado, no un juicio emitido

---

## 2. Schema canónico (JSON)

```json
{
  "schema": "pog.v1",
  "content_hash": "sha256:abc123def456...",
  "agent_wallet": "0x1234567890abcdef1234567890abcdef12345678",
  "model_id": "openai:gpt-4o:2026-01-01",
  "runtime_id": "sha256:runtime_environment_hash",
  "generation_process": {
    "process_type": "direct",
    "human_intervention_level": 0,
    "pipeline_steps": 1
  },
  "timestamp": "2026-02-10T02:00:00.000Z",
  "nonce": "random_unique_string_per_request",
  "signature": "0x..."
}
```

---

## 3. Campos — Definición detallada

### 3.1 `schema` (obligatorio)
```yaml
type: string
value: "pog.v1"
purpose: Identificar la versión del schema para parsing correcto
immutable: true
```

### 3.2 `content_hash` (obligatorio)
```yaml
type: string
format: "sha256:{hex_digest}"
purpose: Huella criptográfica del output generado
rules:
  - SHA-256 del contenido binario exacto
  - El contenido NO se sube, solo el hash
  - Lowercase hex, sin prefijo 0x
  - 64 caracteres hex
example: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
```

### 3.3 `agent_wallet` (obligatorio)
```yaml
type: string
format: EVM address (0x + 40 hex chars)
purpose: Identidad técnica del agente que generó el output
rules:
  - Dirección Ethereum válida
  - Debe coincidir con el firmante del PoG
  - NO implica personalidad jurídica
  - NO implica propiedad
example: "0x1234567890abcdef1234567890abcdef12345678"
```

### 3.4 `model_id` (obligatorio)
```yaml
type: string
format: "provider:model:version"
purpose: Identificar el modelo de IA que generó el output
rules:
  - Formato tripartito separado por ":"
  - provider = organización/servicio (openai, anthropic, local, custom)
  - model = nombre del modelo
  - version = versión o fecha de snapshot
  - "unknown" es un valor válido para campos no disponibles
examples:
  - "openai:gpt-4o:2026-01-01"
  - "anthropic:claude-3.5-sonnet:2025-10-22"
  - "local:llama-3.1-70b:q4_k_m"
  - "custom:my-fine-tuned:v2.3"
  - "unknown:unknown:unknown"
```

### 3.5 `runtime_id` (obligatorio)
```yaml
type: string
format: "sha256:{hex_digest}"
purpose: Huella del entorno de ejecución (para reproducibilidad)
rules:
  - Hash del entorno de runtime (puede ser: docker image hash, 
    system fingerprint, dependency lock hash, etc.)
  - Si no es posible determinarlo: "sha256:0" (valor nulo explícito)
  - Ayuda a evaluar consistencia, no garantiza reproducibilidad
example: "sha256:a1b2c3d4..."
```

### 3.6 `generation_process` (obligatorio)
```yaml
type: object
purpose: Describir las condiciones del proceso de generación

fields:
  process_type:
    type: string
    enum: [direct, pipeline, iterative, autonomous]
    description: |
      - direct: una sola llamada modelo → output
      - pipeline: cadena de modelos/pasos
      - iterative: múltiples rondas con refinamiento
      - autonomous: agente autónomo decidiendo sin humano
    
  human_intervention_level:
    type: integer
    range: [0, 5]
    description: |
      0 = sin intervención humana alguna
      1 = prompt inicial humano, ejecución automática
      2 = humano seleccionó entre opciones generadas
      3 = humano editó parcialmente el output
      4 = humano y máquina co-crearon activamente
      5 = humano creó, máquina solo asistió
    notes:
      - "Este campo es declarativo, no verificable"
      - "El sistema registra lo declarado, no juzga veracidad"
    
  pipeline_steps:
    type: integer
    minimum: 1
    description: Número de pasos en el pipeline de generación
```

### 3.7 `timestamp` (obligatorio)
```yaml
type: string
format: ISO-8601 con zona UTC y milisegundos
purpose: Momento declarado de la generación
rules:
  - Siempre en UTC (sufijo Z)
  - Incluir milisegundos
  - Este es el timestamp del AGENTE, no del servidor
  - El servidor añade su propio server_received_at
example: "2026-02-10T02:00:00.000Z"
```

### 3.8 `nonce` (obligatorio)
```yaml
type: string
format: string alfanumérico, mínimo 16 caracteres
purpose: Prevenir ataques de replay
rules:
  - Debe ser único por cada solicitud de registro
  - Generado por el agente
  - El servidor rechaza nonces duplicados por wallet
example: "a8f3k2m1p9q4w7x0"
```

### 3.9 `signature` (obligatorio)
```yaml
type: string
format: EIP-712 signature (hex)
purpose: Prueba criptográfica de que el agente firmó este bundle
rules:
  - Firma EIP-712 del bundle canónico
  - Verificable por cualquiera con la wallet del agente
  - Ver sección 4 para detalle de firma
```

---

## 4. Firma EIP-712

### 4.1 Domain

```json
{
  "name": "ResExMachina",
  "version": "1",
  "chainId": 0,
  "verifyingContract": "0x0000000000000000000000000000000000000000"
}
```

> **Nota**: `chainId: 0` y `verifyingContract: 0x0...` porque la firma es off-chain.
> Cuando haya contratos on-chain, se actualizará el domain.

### 4.2 Types

```json
{
  "PoGBundle": [
    { "name": "schema",         "type": "string" },
    { "name": "content_hash",   "type": "string" },
    { "name": "agent_wallet",   "type": "address" },
    { "name": "model_id",       "type": "string" },
    { "name": "runtime_id",     "type": "string" },
    { "name": "process_type",   "type": "string" },
    { "name": "human_intervention_level", "type": "uint8" },
    { "name": "pipeline_steps", "type": "uint16" },
    { "name": "timestamp",      "type": "string" },
    { "name": "nonce",          "type": "string" }
  ]
}
```

### 4.3 Ejemplo de payload para firma

```json
{
  "schema": "pog.v1",
  "content_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "agent_wallet": "0x1234567890abcdef1234567890abcdef12345678",
  "model_id": "openai:gpt-4o:2026-01-01",
  "runtime_id": "sha256:a1b2c3d4e5f6...",
  "process_type": "direct",
  "human_intervention_level": 0,
  "pipeline_steps": 1,
  "timestamp": "2026-02-10T02:00:00.000Z",
  "nonce": "a8f3k2m1p9q4w7x0"
}
```

### 4.4 Ejemplo de firma válida

```
Signature: 0x1234abcd...ef56 (65 bytes: r + s + v)
Recovered signer: 0x1234567890abcdef1234567890abcdef12345678
Match agent_wallet: ✅ VALID
```

### 4.5 Ejemplo de verificación fallida

```
Signature: 0x9999aaaa...bb00
Recovered signer: 0xDEAD000000000000000000000000000000000000
Expected agent_wallet: 0x1234567890abcdef1234567890abcdef12345678
Match: ❌ INVALID — signer does not match declared agent
```

---

## 5. Verificación del PoG

Para verificar un PoG v1, un tercero debe:

```
1. Obtener el record (GET /v1/records/{id})
2. Extraer el pog_bundle
3. Reconstruir el message hash según EIP-712 types + domain
4. Recuperar el signer de la signature
5. Comparar recovered_signer == agent_wallet
6. Si coincide → firma válida
7. Verificar anchor (tx_hash) en la blockchain correspondiente
8. Si la tx existe y contiene el receipt_hash → anchoring válido
```

**Verificación offline**: El receipt exportado (JSON) contiene toda la información necesaria para verificar sin conexión a la API, solo necesitando acceso a la blockchain para validar el anchor.

---

## 6. Qué NO hace PoG (EXPLÍCITO)

```yaml
pog_does_not:
  - prove_originality:
      reason: "Dos agentes pueden generar el mismo output independientemente"
  - detect_ai:
      reason: "PoG registra procedencia declarada, no detecta origen"
  - assert_legal_authorship:
      reason: "La autoría legal es una calificación jurídica externa"
  - guarantee_reproducibility:
      reason: "Los modelos son estocásticos; el mismo prompt puede dar outputs diferentes"
  - verify_human_intervention_level:
      reason: "El nivel de intervención es declarativo; el sistema lo registra, no lo verifica"
  - assign_economic_value:
      reason: "El valor económico es externo al registro"
```

---

## 7. Evolución prevista

| Versión | Cambios esperados |
|---|---|
| PoG v1.1 | Campos opcionales adicionales (temperature, seed, system_prompt_hash) |
| PoG v2 | Señales forenses automáticas, embeddings parciales, métricas de consistencia |
| PoG v3 | Verificación cruzada entre agentes, attestation chains |

> **Regla de evolución**: PoG v1 NUNCA se modifica retroactivamente.
> Nuevas versiones se añaden como schemas nuevos. Los registros existentes
> conservan su schema original para siempre.
