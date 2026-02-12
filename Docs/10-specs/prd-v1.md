# PRD v1 — Res ex Machina (Agent-Proof)

> **Versión**: 1.1  
> **Estado**: Draft (post-review)  
> **Fecha**: 2026-02-10  
> **Última revisión**: 2026-02-10 (resolución de gaps de review)  

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
  - fee_onchain_native_l2           # Fee on-chain en token nativo de la L2
  - json_receipt_export             # Exportar receipt verificable
  - rate_limiting_per_wallet        # Control de ráfaga por wallet
  - idempotency_by_content_hash     # Misma solicitud = mismo record
  - nonce_anti_replay               # Nonce único por wallet
  - health_endpoint                 # GET /v1/health (status del sistema)
  - anchor_failure_handling          # Estado anchor_failed + retries
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
  - provenance_metadata             # v1.1. C2PA/IPTC/XMP bridge (ver c2pa-interoperability.md)
  - search_advanced                 # v2+. Búsqueda avanzada
  - list_records_by_wallet          # v2+. Perfilado controlado (ver sección K)
  - fee_fiat_gateway                # v2. Fee en fiat
  - fee_credits_prepaid             # v2. Créditos prepagados
  - dual_identity                   # v2. Identidad org (X.509) + técnica (wallet)
```

---

## D) Endpoints

```yaml
endpoints:

  - method: GET
    path: /v1/health
    auth: none
    description: Estado del sistema
    response:
      status: 200
      body:
        - status                # "ok" | "degraded"
        - db                    # "ok" | "error"
        - chain                 # "ok" | "error" | "degraded"
        - version               # "v1"

  - method: POST
    path: /v1/records
    auth: wallet_signature (EIP-712)
    description: Registrar un nuevo evento de generación
    request_body:
      required:
        - content_hash          # SHA-256 del output (formato: sha256:{64hex})
        - pog_bundle            # PoG v1 completo y firmado
        - fee_tx_hash           # Hash de la tx de pago del fee (on-chain L2)
      optional:
        - content_type          # MIME type del output
        - tags                  # Etiquetas libres (array, max 10)
        - visibility            # proof_only | input_hash_only | content_optional
        - external_ref          # URL/pointer a contenido externo
    response:
      status: 201
      body:
        - record_id             # UUID v7 (time-ordered, generado en app)
        - content_hash          # Echo del hash enviado
        - receipt_hash          # Hash del receipt completo
        - state                 # "pending_anchor"
        - created_at            # ISO-8601
        - anchor                # null (se actualizará async)
    errors:
      400: invalid_payload (incluye content_hash malformado)
      401: invalid_signature
      402: fee_not_verified (fee_tx_hash inválido o no confirmado)
      409: duplicate_content_hash | duplicate_nonce
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
        - state                 # pending_anchor | anchored | anchor_failed
        - created_at
        - anchor                # tx_hash + block + chain_id (cuando exista)
        - receipt_hash
        - anchor_error_reason   # Solo si state == anchor_failed
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
    "amount": "0.01",
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
-- NOTA: record_id es UUID v7 (time-ordered), generado en la aplicación.
-- NO usar gen_random_uuid() que genera UUID v4 (aleatorio).
CREATE TABLE records (
    record_id         UUID PRIMARY KEY,  -- UUID v7, generado en app
    content_hash      VARCHAR(128) NOT NULL UNIQUE
                      CHECK (content_hash ~ '^sha256:[a-f0-9]{64}$'),
    content_type      VARCHAR(64),
    visibility        VARCHAR(32) NOT NULL DEFAULT 'proof_only'
                      CHECK (visibility IN ('proof_only', 'input_hash_only', 'content_optional')),
    pog_bundle        JSONB NOT NULL,
    nonce             VARCHAR(64) NOT NULL,
    agent_wallet      VARCHAR(42) NOT NULL,
    state             VARCHAR(32) NOT NULL DEFAULT 'pending_anchor'
                      CHECK (state IN ('pending_anchor', 'anchored', 'anchor_failed')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    receipt_hash      VARCHAR(128) NOT NULL,
    tags              TEXT[] DEFAULT '{}',
    external_ref      TEXT,
    fee_amount        NUMERIC(18, 8) NOT NULL,
    fee_currency      VARCHAR(8) NOT NULL,
    fee_tx_hash       VARCHAR(66) NOT NULL UNIQUE, -- 1:1 con record, no reutilizable
    anchor_tx_hash    VARCHAR(66),
    anchor_block      BIGINT,
    anchor_chain_id   INTEGER,
    anchor_error_reason TEXT,                -- Motivo del fallo (si anchor_failed)
    anchor_retries    INTEGER NOT NULL DEFAULT 0,
    anchored_at       TIMESTAMPTZ,
    
    -- Anti-replay: un nonce no puede reutilizarse por la misma wallet
    CONSTRAINT uq_wallet_nonce UNIQUE (agent_wallet, nonce)
);

-- Índices
CREATE INDEX idx_records_agent ON records(agent_wallet);
CREATE INDEX idx_records_state ON records(state);
CREATE INDEX idx_records_created ON records(created_at DESC);
CREATE INDEX idx_records_fee_tx ON records(fee_tx_hash);
```

---

## H) Flujo principal

### H.1 Happy path

```
Agente IA                    API Res ex Machina           Blockchain (L2)
    │                              │                            │
    │  1. Genera output            │                            │
    │  2. Calcula hash             │                            │
    │  3. Paga fee on-chain ──────────────────────────────────> │
    │  4. Obtiene fee_tx_hash      │                            │
    │  5. Construye PoG bundle     │                            │
    │  6. Firma (EIP-712)          │                            │
    │                              │                            │
    │──POST /v1/records───────────>│                            │
    │  (incluye fee_tx_hash)       │  7. Valida firma           │
    │                              │  8. Verifica fee_tx_hash   │
    │                              │  9. Verifica nonce         │
    │                              │  10. Verifica idempotencia │
    │                              │  11. Guarda record         │
    │                              │  12. Calcula receipt_hash  │
    │<──201 { record_id, state:    │                            │
    │       pending_anchor }───────│                            │
    │                              │                            │
    │                              │  13. Encola anchoring ────>│
    │                              │                            │  14. Tx on-chain
    │                              │<── Tx confirmada ──────────│
    │                              │  15. Actualiza record      │
    │                              │      state: "anchored"     │
    │                              │                            │
```

### H.2 Unhappy path: fallo de anchoring

```
API Res ex Machina                              Blockchain (L2)
    │                                                │
    │  13. Encola anchoring ────────────────────────>│
    │                                                │  Tx falla
    │<── Error / Timeout ───────────────────────────│
    │                                                │
    │  14. anchor_retries += 1                       │
    │  15. Si retries < 3: re-encolar con backoff    │
    │  16. Si retries >= 3:                          │
    │      state = "anchor_failed"                   │
    │      anchor_error_reason = "..."               │
    │                                                │
    │  ⚠️ El record SIGUE SIENDO VÁLIDO             │
    │  ⚠️ El PoG y el timestamp son inmutables      │
    │  ⚠️ Nada se borra, nada se invalida           │
    │  ⚠️ Un operador puede reintentar manualmente  │
    │                                                │
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
| Anti-spam | Fee on-chain + rate limit + idempotencia + nonce |
| Fee | On-chain en token nativo L2. Fiat/créditos en v2 |
| Hosting | EU preferido, arquitectura portable |
| Blockchain | L2 EVM compatible |
| Infra | Cloud + Postgres + Redis + S3-compatible |
| Anchoring | Retry automático (3x). Estado anchor_failed si agotado |

---

## J) Glosario rápido

| Término | Significado |
|---|---|
| **Record** | Un registro de hecho de generación |
| **PoG** | Proof of Generation — bundle probatorio |
| **Anchor** | Ancla on-chain (tx + block) |
| **Receipt** | Paquete exportable verificable (JSON) |
| **Agent** | Entidad técnica (wallet) que genera y firma |
| **Fee** | Micro-pago on-chain obligatorio por registro |
| **State** | Estado actual: `pending_anchor`, `anchored`, `anchor_failed` |
| **Nonce** | Valor único por wallet que previene replay attacks |

---

## K) Principios de perfilado por wallet (diseño anticipado)

> **Contexto**: No hay listado público por wallet en v1, pero el sistema se **diseña** para soportar perfilado controlado en versiones futuras.

```yaml
profiling_rules:
  
  public_in_v1:
    - verification_by_content_hash    # Cualquiera puede verificar un hash
    - verification_by_record_id       # Cualquiera puede consultar un record
  
  NOT_public_in_v1:
    - list_records_by_wallet          # NO hay listado público por wallet
    - agent_scoring                   # NO hay scoring
    - agent_reputation                # NO hay reputación
  
  future_profiling_service:
    description: |
      Servicio análogo al Registro Mercantil Español:
      - El registro base es público
      - Los informes de análisis son un servicio de pago, contractual
    
    access_control:
      - platform_admins               # Administradores de la plataforma
      - authorized_auditors            # Auditores / validadores / oráculos
      - enterprise_clients             # Clientes enterprise bajo contrato
    
    exposed_data:                      # Solo datos agregados, NUNCA juicios
      - total_records_count
      - temporal_windows
      - state_distribution             # anchored, failed, pending
      - registration_frequency
    
    FORBIDDEN_always:                  # Prohibido en CUALQUIER versión
      - scoring
      - rankings
      - reliability_labels
      - automatic_conclusions
    
    principle: |
      "El sistema proporciona datos; la interpretación es
      responsabilidad del usuario autorizado."
```
