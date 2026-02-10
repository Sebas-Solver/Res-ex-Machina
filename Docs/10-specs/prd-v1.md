# PRD v1 — Res ex Machina (Agent-Proof)

> **Versión**: 1.0  
> **Estado**: Draft  
> **Fecha**: 2026-02-10  

---

## A) Objetivo del MVP

El objetivo del MVP v1 es permitir a agentes de IA registrar eventos de generación de outputs, dejando una traza verificable (hash + PoG + timestamp) consultable públicamente, sin validación humana ex ante.

Res ex Machina es un **registro de hechos técnicos**, no de derechos. Es **content-agnostic** y **automatizado por defecto**.

---

## B) Scope IN

```yaml
scope_in:
  - register_generation_event       # POST /v1/records
  - agent_identity_via_wallet       # Auth por firma criptográfica
  - pog_v1_bundle_signed            # Proof of Generation v1 firmado
  - immutable_timestamp_anchor      # Ancla temporal verificable
  - public_verification_by_hash     # Consulta pública por hash
  - public_verification_by_id       # Consulta pública por record_id
  - fee_base_required               # Fee obligatorio por registro
  - json_receipt_export             # Exportar receipt verificable
  - rate_limiting_per_wallet        # Control de ráfaga por wallet
  - idempotency_by_content_hash     # Misma solicitud = mismo record
```

---

## C) Scope OUT (v1) — CRÍTICO

```yaml
scope_out:
  - ai_detection                    # NUNCA. No somos detectores
  - originality_scoring             # NUNCA. No evaluamos calidad
  - human_validation_flows          # NUNCA en v1. Excepción, no norma
  - content_moderation              # NUNCA. No somos editores
  - content_curation                # NUNCA. No somos curadores
  - semantic_analysis               # NUNCA. No interpretamos significado
  - copyright_or_ip_claims          # NUNCA. No asignamos derechos
  - content_storage                 # v2-B. Solo hash en v1
  - record_versioning               # v2-A. Links y derivaciones
  - state_machine                   # v2-A. Estados dinámicos
  - dispute_claims                  # v2-C. Claims y contra-claims
  - rich_ui_dashboard               # v2+. Solo API en v1
  - agent_reputation                # v3+. Scoring acumulativo
  - smart_contracts_execution       # v3+. Licencias y pagos
  - batch_endpoint                  # v1.1. Útil pero no mínimo
  - search_advanced                 # v2+. Búsqueda avanzada
```

---

## D) Endpoints

```yaml
endpoints:

  - method: POST
    path: /v1/records
    auth: wallet_signature (EIP-712)
    description: Registrar un nuevo evento de generación
    request_body:
      required:
        - content_hash          # SHA-256 del output
        - pog_bundle            # PoG v1 completo y firmado
      optional:
        - content_type          # MIME type del output
        - tags                  # Etiquetas libres (array, max 10)
        - visibility            # proof_only | input_hash_only | content_optional
        - external_ref          # URL/pointer a contenido externo
    response:
      status: 201
      body:
        - record_id             # UUID v7 (time-ordered)
        - content_hash          # Echo del hash enviado
        - receipt_hash          # Hash del receipt completo
        - state                 # "pending_anchor"
        - created_at            # ISO-8601
        - anchor                # null (se actualizará async)
    errors:
      400: invalid_payload
      401: invalid_signature
      402: fee_required
      409: duplicate_content_hash (idempotencia)
      429: rate_limit_exceeded

  - method: GET
    path: /v1/records/{id}
    auth: none (público)
    description: Consultar un registro por ID
    response:
      status: 200
      body:
        - record_id
        - content_hash
        - pog_bundle            # PoG v1 completo
        - state                 # pending_anchor | anchored
        - created_at
        - anchor                # tx_hash + block + chain_id (cuando exista)
        - receipt_hash
    errors:
      404: record_not_found

  - method: GET
    path: /v1/records/verify
    auth: none (público)
    description: Verificar existencia por hash
    query_params:
      - hash                    # content_hash a buscar
    response:
      status: 200
      body:
        - found: true/false
        - record_id             # Si existe
        - state
        - created_at
        - anchor
    errors:
      400: missing_hash_param

  - method: GET
    path: /v1/records/{id}/export
    auth: none (público)
    description: Exportar receipt verificable (JSON)
    response:
      status: 200
      content_type: application/json
      body:
        - record_id
        - content_hash
        - pog_bundle
        - receipt_hash
        - anchor
        - verification_instructions  # Cómo verificar offline
    errors:
      404: record_not_found
```

---

## E) Schemas versionados

### Record.v1

```json
{
  "schema": "record.v1",
  "record_id": "01957...",
  "content_hash": "sha256:abc123...",
  "content_type": "text/plain",
  "visibility": "proof_only",
  "pog_bundle": { "...ver PoG v1 spec..." },
  "state": "pending_anchor",
  "created_at": "2026-02-10T02:00:00Z",
  "anchor": null,
  "receipt_hash": "sha256:def456...",
  "tags": ["code", "agent-output"],
  "external_ref": null,
  "fee": {
    "amount": "0.001",
    "currency": "ETH",
    "tx_hash": "0x..."
  }
}
```

### PoGBundle.v1

> Ver documento separado: `pog-v1-spec.md`

### Agent.v1

```json
{
  "schema": "agent.v1",
  "wallet": "0x1234...abcd",
  "first_seen": "2026-02-10T02:00:00Z",
  "total_records": 42,
  "last_record_at": "2026-02-10T02:30:00Z"
}
```

> **Nota**: Agent.v1 es un recurso derivado, no un endpoint CRUD.
> Se construye a partir del historial de registros.
> No hay endpoint de "crear agente" — el agente existe cuando registra.

---

## F) UX operativa mínima

```yaml
ui:
  purpose: operational_review_only
  target: operadores_y_supervisión_humana
  
  views:
    - records_table           # Lista de registros (solo lectura)
    - record_detail           # Detalle de un registro
    - verify_by_hash          # Verificar existencia por hash
  
  forbidden_actions:
    - approve                 # NUNCA. No se aprueba nada
    - reject                  # NUNCA. No se rechaza nada
    - edit_metadata           # NUNCA. Lo registrado es inmutable
    - delete_record           # NUNCA. Nada se borra
    - assign_authorship       # NUNCA. No se asigna autoría
  
  notes:
    - "La UI NO es producto en v1"
    - "Es una herramienta interna de supervisión"
    - "Los agentes y developers usan la API directamente"
    - "Si un humano necesita verificar, usa GET /verify"
```

---

## G) Modelo de datos (Postgres)

```sql
-- Tabla principal
CREATE TABLE records (
    record_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_hash    VARCHAR(128) NOT NULL UNIQUE,
    content_type    VARCHAR(64),
    visibility      VARCHAR(32) NOT NULL DEFAULT 'proof_only',
    pog_bundle      JSONB NOT NULL,
    agent_wallet    VARCHAR(42) NOT NULL,
    state           VARCHAR(32) NOT NULL DEFAULT 'pending_anchor',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    receipt_hash    VARCHAR(128) NOT NULL,
    tags            TEXT[] DEFAULT '{}',
    external_ref    TEXT,
    fee_amount      NUMERIC(18, 8) NOT NULL,
    fee_currency    VARCHAR(8) NOT NULL,
    fee_tx_hash     VARCHAR(66),
    anchor_tx_hash  VARCHAR(66),
    anchor_block    BIGINT,
    anchor_chain_id INTEGER,
    anchored_at     TIMESTAMPTZ
);

-- Índices
CREATE INDEX idx_records_agent ON records(agent_wallet);
CREATE INDEX idx_records_state ON records(state);
CREATE INDEX idx_records_created ON records(created_at DESC);
```

---

## H) Flujo principal (happy path)

```
Agente IA                    API Res ex Machina           Blockchain (L2)
    │                              │                            │
    │  1. Genera output            │                            │
    │  2. Calcula hash             │                            │
    │  3. Construye PoG bundle     │                            │
    │  4. Firma (EIP-712)          │                            │
    │                              │                            │
    │──POST /v1/records───────────>│                            │
    │                              │  5. Valida firma           │
    │                              │  6. Verifica fee           │
    │                              │  7. Verifica idempotencia  │
    │                              │  8. Guarda record          │
    │                              │  9. Calcula receipt_hash   │
    │<──201 { record_id, state:    │                            │
    │       pending_anchor }───────│                            │
    │                              │                            │
    │                              │  10. Encola anchoring ────>│
    │                              │                            │  11. Tx on-chain
    │                              │<── Tx confirmada ──────────│
    │                              │  12. Actualiza record      │
    │                              │      state: "anchored"     │
    │                              │                            │
```

---

## I) Requisitos no funcionales (resumen v1)

| Categoría | Objetivo |
|---|---|
| Escala | 100–1.000 reg/día, batch futuro |
| Latencia soft | < 3 seg (receipt inmediato) |
| Latencia hard | 1–5 min (anchor on-chain) |
| SLA | 99.0% mensual |
| Custodia | NO. Solo verificación de firmas |
| Anti-spam | Fee + rate limit + idempotencia |
| Hosting | EU preferido, arquitectura portable |
| Blockchain | L2 EVM compatible |
| Infra | Cloud + Postgres + Redis + S3-compatible |

---

## J) Glosario rápido

| Término | Significado |
|---|---|
| **Record** | Un registro de hecho de generación |
| **PoG** | Proof of Generation — bundle probatorio |
| **Anchor** | Ancla on-chain (tx + block) |
| **Receipt** | Paquete exportable verificable (JSON) |
| **Agent** | Entidad técnica (wallet) que genera y firma |
| **Fee** | Micro-pago obligatorio por registro |
| **State** | Estado actual del record (pending_anchor, anchored) |
