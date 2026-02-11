# Runbook de Operaciones — Res ex Machina

## Contacto

- **Responsable**: @Sebas-Solver
- **Email**: sebas.solver@gmail.com

---

## 1. RPC de la L2 caído o lento

### Síntomas
- `/v1/health` reporta `l2.status: "degraded"` o `"down"`
- Anchoring jobs fallan con `RPC error` o timeout
- Cola de BullMQ crece

### Acciones
1. Verificar estado del RPC en el dashboard del proveedor
2. Si RPC public, cambiar a un nodo alternativo:
   ```bash
   # .env
   L2_RPC_URL=https://polygon-rpc-alternativo.com
   ```
3. Reiniciar el worker:
   ```bash
   npm run worker:anchor
   ```
4. Los jobs pendientes se re-ejecutarán automáticamente (backoff exponencial)
5. Verificar que la cola se vacía:
   ```bash
   # Comprobar en Redis
   redis-cli LLEN bull:anchor:wait
   ```

### Impacto
- **API sigue aceptando registros** — los records se crean con `state: pending_anchor`
- **Anchoring se retrasa** hasta que el RPC vuelva
- **No hay pérdida de datos** — los jobs están en Redis

---

## 2. Cola de BullMQ atascada

### Síntomas
- Jobs en estado `waiting` o `delayed` creciendo
- Worker no procesa
- `/v1/health` muestra Redis healthy

### Acciones
1. Verificar que el worker está corriendo:
   ```bash
   # ¿Proceso vivo?
   ps aux | grep anchor.worker
   ```
2. Si el worker murió, reiniciar:
   ```bash
   npm run worker:anchor
   ```
3. Si hay jobs `failed`, revisar logs para el motivo
4. Para reintentar jobs fallidos manualmente:
   ```bash
   # Desde la app o un script:
   # Los jobs con attempts restantes se reintentan solos
   # Si agotaron intentos, quedan en "failed"
   ```
5. Si hay que limpiar la cola (emergencia):
   ```bash
   redis-cli DEL bull:anchor:failed
   ```

### Impacto
- Records se crean pero no se anclan
- Los usuarios ven `state: pending_anchor` indefinidamente
- No hay pérdida de datos

---

## 3. Error rate alto (>5% respuestas 5xx)

### Síntomas
- Logs con `"request completed with error"` frecuentes
- Status 500 en respuestas

### Acciones
1. Revisar logs estructurados:
   ```bash
   # Filtrar por errores 5xx
   cat logs/app.log | jq 'select(.status_code >= 500)'
   ```
2. Identificar el patrón (¿siempre el mismo endpoint? ¿misma wallet?)
3. Causas comunes:
   - **DB caída** → verificar conexión PostgreSQL
   - **Redis caído** → verificar conexión Redis
   - **OOM** → revisar uso de memoria del container
4. Reiniciar API:
   ```bash
   docker compose restart api
   ```

---

## 4. Reintentar anchoring sin romper idempotencia

### Contexto
- Cada job usa `jobId: recordId` → **BullMQ no permite duplicados**
- Si un job falla todos los reintentos, queda en `failed`
- El record está en `state: anchor_failed`

### Procedimiento seguro
1. Verificar que el record existe y está en `anchor_failed`:
   ```sql
   SELECT record_id, state, anchor_retries, anchor_error_reason
   FROM records
   WHERE record_id = '<UUID>';
   ```
2. Resetear el estado para re-encolar:
   ```sql
   UPDATE records
   SET state = 'pending_anchor',
       anchor_retries = 0,
       anchor_error_reason = NULL
   WHERE record_id = '<UUID>'
     AND state = 'anchor_failed';
   ```
3. Encolar manualmente (script o endpoint admin futuro):
   ```typescript
   import { enqueueAnchorJob } from './services/queue.js';
   await enqueueAnchorJob(recordId, receiptHash);
   ```
4. Verificar que se procesa:
   ```bash
   redis-cli LLEN bull:anchor:active
   ```

### Seguridad
- La idempotencia está garantizada por `jobId = recordId`
- Si el job ya existe en la cola, BullMQ lo ignora
- La DB tiene UNIQUE en `receipt_hash` → no hay doble anchoring

---

## 5. Base de datos llena o lenta

### Acciones
1. Verificar espacio:
   ```sql
   SELECT pg_size_pretty(pg_database_size('rexm'));
   ```
2. Verificar queries lentas:
   ```sql
   SELECT query, mean_exec_time, calls
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```
3. Los índices ya cubren las queries principales:
   - `idx_records_agent_wallet` → queries por wallet
   - `idx_records_state` → worker busca `pending_anchor`
   - `idx_records_created_at` → ordenar por fecha
   - `idx_records_fee_tx_hash` → verificar fee no reusado

---

## 6. Arranque limpio desde cero

```bash
# 1. Levantar infra
docker compose up -d

# 2. Esperar healthchecks (30s aprox)
docker compose ps  # todos "healthy"

# 3. Aplicar migraciones
npm run db:push

# 4. Arrancar API
npm run dev

# 5. Arrancar worker
npm run worker:anchor

# 6. Verificar
curl http://localhost:3000/v1/health
```

---

## Métricas clave a monitorizar

| Métrica | Cómo obtenerla | Alerta si... |
|---|---|---|
| % 5xx | Logs: `status_code >= 500` | > 1% en 5 min |
| Latencia p95 | Logs: `response_time_ms` | > 3000ms |
| Cola waiting | `redis-cli LLEN bull:anchor:wait` | > 100 jobs |
| Cola failed | `redis-cli LLEN bull:anchor:failed` | > 0 |
| Anchors ok/failed | DB: `SELECT state, COUNT(*) FROM records GROUP BY state` | failed > 5% |
| Health check | `GET /v1/health` | degraded > 5 min |
