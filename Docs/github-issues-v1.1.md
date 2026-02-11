# Issues pendientes para GitHub — v1.1

> Estas issues se crearon como borrador porque `gh auth` no está configurado.
> Para crearlas, ejecuta `gh auth login` primero, o cópialas manualmente a GitHub.

---

## Issue #10: [v1.1] `provenance_metadata` — Campo genérico de interoperabilidad

**Labels:** enhancement, v1.1

### Descripción

Añadir campo opcional `provenance_metadata` al schema de `POST /v1/records` para vincular records con estándares de procedencia embebida (C2PA, IPTC, XMP, Schema.org).

### Schema

```typescript
provenance_metadata: z.object({
    standard: z.enum(['c2pa', 'iptc', 'xmp', 'schema_org', 'custom']),
    manifest_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    claim_generator: z.string().max(256).optional(),
    issuer: z.string().max(256).optional(),
    assertions: z.array(z.string().max(128)).max(20).optional(),
    manifest_uri: z.string().url().max(1024).optional(),
}).optional()
```

### Cambios necesarios

**`src/routes/schemas/index.ts`:**
- Añadir `provenanceMetadataSchema`
- Añadir campo opcional `provenance_metadata` a `createRecordSchema`

**`src/db/schema.ts`:**
- Añadir columna `provenanceMetadata: jsonb('provenance_metadata')`

**`src/routes/records.ts`:**
- Pasar `provenance_metadata` al INSERT
- Devolver en GET y export

**`tests/schemas.test.ts`:**
- Tests de validación: standard válido e inválido, manifest_hash formato, tamaños máximos
- Test de que el campo es opcional (backward compatible)

**Migración:**
```sql
ALTER TABLE records ADD COLUMN provenance_metadata JSONB;
CREATE INDEX idx_records_prov_standard ON records USING GIN ((provenance_metadata -> 'standard'));
```

### Referencia
- `Docs/c2pa-interoperability.md`
- OP-14 en Principios Fundacionales

---

## Issue #11: [v1.1] Batch endpoint — POST /v1/records/batch

**Labels:** enhancement, v1.1

### Descripción

Endpoint para registrar múltiples records en una sola llamada HTTP.

### Especificación
- `POST /v1/records/batch`
- Body: `{ records: CreateRecordInput[] }` (max 100 por batch)
- Respuesta: `{ results: { record_id, status, error? }[] }`
- Fee: un fee_tx por batch (o uno por record, TBD)
- Cada record individual se valida igual que POST /v1/records

---

## Issue #12: [v1.1] Webhooks de estado

**Labels:** enhancement, v1.1

### Descripción

Notificaciones push cuando un record cambia de estado (pending_anchor → anchored, o pending_anchor → anchor_failed).

### Especificación
- `POST /v1/webhooks` — registrar webhook
- `DELETE /v1/webhooks/:id` — eliminar webhook
- Payload: `{ event: "state_changed", record_id, old_state, new_state, anchor_tx_hash? }`
- Retry: 3 intentos con backoff exponencial
- Autenticación: HMAC-SHA256 del payload

---

## Issue #13: [v1.1] Doble atestación temporal

**Labels:** enhancement, v1.1

### Descripción

Registrar tanto el timestamp blockchain (anchor) como un timestamp PKI opcional (si el agente proporciona uno del estándar de procedencia).

### Cambios
- Campo opcional `pki_timestamp` en `provenance_metadata`
- Documentar la doble atestación en el export/receipt
