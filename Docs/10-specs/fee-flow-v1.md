# Fee Flow v1 — Especificación Técnica

> **Versión**: 1.0  
> **Estado**: Draft  
> **Fecha**: 2026-02-10  

---

## 1. Resumen

En v1, el fee es un **pago on-chain en el token nativo de la L2** (ETH en la mayoría de L2 EVM).

El agente paga el fee **antes** de llamar a la API. La API verifica que la transacción existe y está confirmada.

---

## 2. Flujo

```
Agente IA                       L2 Blockchain                API Res ex Machina
    │                               │                             │
    │  1. Calcula fee requerido     │                             │
    │     (consulta o fijo)         │                             │
    │                               │                             │
    │  2. Envía tx de pago ────────>│                             │
    │     (to: fee_receiver_address)│                             │
    │     (value: fee_amount)       │                             │
    │                               │  3. Tx confirmada           │
    │  4. Obtiene fee_tx_hash  <────│                             │
    │                               │                             │
    │  5. Incluye fee_tx_hash       │                             │
    │     en POST /v1/records ─────────────────────────────────>  │
    │                               │                             │
    │                               │  6. API verifica fee_tx_hash│
    │                               │     - Tx existe?            │
    │                               │     - Confirmada?           │
    │                               │     - Monto >= fee mínimo?  │
    │                               │     - Destinatario correcto?│
    │                               │     - fee_tx_hash no reusado│
    │                               │                             │
    │                               │  7. Si OK → crea record     │
    │  <─── 201 Created ──────────────────────────────────────────│
    │                               │                             │
```

---

## 3. Verificación del fee

La API verifica el `fee_tx_hash` consultando la L2:

```yaml
fee_verification:
  checks:
    - tx_exists: "La transacción existe en la L2"
    - tx_confirmed: "La tx tiene al menos N confirmaciones (ej. 1-3)"
    - tx_amount: "El value >= fee mínimo vigente"
    - tx_recipient: "El 'to' es la dirección oficial de fee_receiver"
    - tx_not_reused: "El fee_tx_hash no ha sido usado en otro record"
    - tx_recent: "La tx fue creada en las últimas N horas (ej. 24h)"
  
  on_failure:
    - 402: "fee_not_verified"
    - detail: "Razón específica del fallo"
```

---

## 4. Parámetros del fee

```yaml
fee_config:
  # Dirección que recibe los fees (controlada por Res ex Machina)
  fee_receiver_address: "0x..."  # Se define en deployment
  
  # Fee mínimo por registro (en wei o unidad nativa)
  fee_minimum_amount: "TBD"  # Se calibrará con datos reales
  
  # Moneda
  fee_currency: "ETH"  # Token nativo de la L2 elegida
  
  # Ventana de validez de la tx de fee
  fee_tx_max_age_hours: 24
  
  # Confirmaciones mínimas
  fee_tx_min_confirmations: 1
```

---

## 5. Modelo de datos

La tabla `records` ya incluye:

```sql
fee_amount    NUMERIC(18, 8) NOT NULL,
fee_currency  VARCHAR(8) NOT NULL,
fee_tx_hash   VARCHAR(66) NOT NULL,  -- Obligatorio
```

Tabla adicional para evitar reutilización de fee_tx_hash:

```sql
-- Cada fee_tx_hash solo puede usarse una vez
-- Esto se garantiza por el UNIQUE en records(fee_tx_hash)
-- No necesita tabla separada si fee_tx_hash es único en records

-- Alternativa si un fee_tx_hash puede cubrir múltiples registros (batch futuro):
-- CREATE TABLE used_fees (
--     fee_tx_hash VARCHAR(66) PRIMARY KEY,
--     used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--     record_id   UUID REFERENCES records(record_id)
-- );
```

> **Decisión v1**: Un `fee_tx_hash` = un `record`. Relación 1:1. 
> Se garantiza con UNIQUE constraint sobre `fee_tx_hash` en la tabla `records`.

---

## 6. Scope OUT (v1)

```yaml
fee_scope_out:
  - fiat_payments          # v2. Gateway de pago fiat
  - credit_pools           # v2. Créditos prepagados
  - tiered_pricing         # v2. Descuentos por volumen
  - batch_fee              # v1.1. Un fee para múltiples registros
  - fee_refunds            # NUNCA. Los fees no se devuelven
  - fee_negotiation        # NUNCA. El fee es público y fijo
```

---

## 7. Invariantes del fee

| ID | Regla |
|---|---|
| INV-012 | Ningún record puede existir sin fee pagado |
| INV-020 | El fee se verifica contra tx on-chain real |
| — | Un fee_tx_hash solo puede usarse una vez |
| — | Los fees no se devuelven |
| — | El fee es público y el mismo para todos (v1) |

---

## 8. Evolución prevista

| Versión | Cambios |
|---|---|
| v1 | Fee on-chain simple, token nativo L2, 1:1 con record |
| v1.1 | Batch: 1 fee → N records |
| v2 | Fiat gateway + créditos prepagados + tiered pricing |
| v3 | Smart contract de fee con lógica de descuentos automática |
