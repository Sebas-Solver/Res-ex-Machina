# Informe de Revisión de Código — v1.0.0-alpha.1

> **Fecha:** 12 de febrero de 2026
> **Revisión por:** Antigravity (skills: architect-review, architecture)
> **Archivos revisados:** 17 archivos TypeScript (~1.577 líneas)

---

## Resumen ejecutivo

El código de Res ex Machina está en **estado excelente para una alpha**. La arquitectura es limpia, el código está bien tipado y documentado, la seguridad es sólida, y hay buena cobertura de tests (63 tests).

No se encontraron bugs ni vulnerabilidades críticas. Se identificaron **7 hallazgos** de optimización y mejora, priorizados para las fases alpha.2 y beta.

---

## Calificación general

| Aspecto | Nota | Detalles |
|---|:---:|---|
| **Arquitectura** | ⭐⭐⭐⭐ | Separación de capas correcta. Sin over-engineering |
| **Seguridad** | ⭐⭐⭐⭐ | EIP-712, Helmet, CORS, rate limit, no expone errores internos |
| **Calidad de código** | ⭐⭐⭐⭐⭐ | Tipado estricto, docs JSDoc, naming consistente |
| **Escalabilidad** | ⭐⭐⭐ | Adecuada para alpha. Rate limit en memoria limita el escalado |
| **Mantenibilidad** | ⭐⭐⭐⭐⭐ | Código fácil de entender, bien documentado |

---

## Puntos fuertes

1. **Clean Architecture** — Separación clara de responsabilidades (routes → services → db)
2. **Validación robusta** — Zod schemas + CHECK constraints en DB = doble barrera
3. **Error handling** — `ApiError` + factory functions, nunca expone stack traces
4. **Seguridad** — EIP-712, CORS restrictivo, Helmet, rate limit por IP+wallet
5. **Inmutabilidad** — INV-001 (no DELETE), records permanentes
6. **Graceful shutdown** — Drena requests, cierra cola y DB ordenadamente
7. **Tests** — 63/63 passing, ratio 1 test por cada 25 líneas

---

## Hallazgos

### H-1: Conexiones Redis duplicadas (Prioridad: ALTA)

**Archivos:** `queue.ts`, `anchor.worker.ts`, `health.ts`

Se crean 3 conexiones Redis independientes que cada una parsea `REDIS_URL`. El health check crea y destruye una conexión Redis cada vez que se llama, consumiendo ~3 comandos de Upstash por invocación (connect + PING + disconnect).

**Solución:** Extraer la configuración Redis a un módulo compartido `config/redis.ts` y reutilizar conexiones.

**Issue:** #16

---

### H-2: Clientes viem (blockchain) duplicados (Prioridad: MEDIA)

**Archivos:** `anchor.ts`, `fee.ts`, `health.ts`

Se crean clientes `publicClient` independientes en cada módulo. El health check crea uno nuevo en cada llamada.

**Solución:** Módulo compartido `config/blockchain.ts` con un solo `publicClient` y `walletClient`.

**Issue:** #16 (mismo refactor de Config compartido)

---

### H-3: Rate limit almacenado solo en memoria (Prioridad: MEDIA)

**Archivo:** `middleware/rateLimit.ts`

El rate limiting usa almacenamiento en memoria (comportamiento por defecto). Si se escala a múltiples instancias, cada una tiene su propio contador. Ya está documentado en el código (línea 16).

**Solución:** Migrar a Redis store de `@fastify/rate-limit` cuando se necesiten múltiples instancias.

**Issue:** #17

---

### H-4: Formatters de respuesta duplicados (Prioridad: BAJA)

**Archivo:** `routes/records.ts`

Las funciones `formatRecordResponse` (L193-221) y el bloque de export (L154-177) tienen lógica de formateo similar pero no idéntica. Riesgo de divergencia.

**Solución:** Unificar en un solo formatter reutilizable en un módulo separado.

**Issue:** #18

---

### H-5: Logs sin sanitización (Prioridad: BAJA)

**Archivo:** `app.ts` (L53)

La wallet del agente se logea directamente. Aunque las wallets son públicas por naturaleza, en el futuro podrían logearse datos sensibles por accidente si se añaden más campos.

**Solución:** Crear un helper de sanitización para los objetos de log.

**Issue:** #18 (mismo refactor de calidad)

---

### H-6: Health check no cachea resultados (Prioridad: MEDIA)

**Archivo:** `routes/health.ts`

Cada llamada al health check hace 3 conexiones reales (DB + Redis + blockchain). Con Render haciendo health checks frecuentes + monitorización, esto consume recursos innecesarios.

**Solución:** Cachear el resultado del health check durante 30 segundos.

**Issue:** #16

---

### H-7: Sin monitorización ni alertas (Prioridad: MEDIA para producción)

No hay sistema de monitorización de errores, latencia o alertas. Aceptable en alpha, necesario antes de producción real.

**Solución:** Integrar un servicio como Sentry (free tier) o similar.

**Issue:** #19

---

## Arquitectura actual

```
src/
├── app.ts              — Entry point + server + shutdown
├── config/env.ts       — Validación env vars (Zod)
├── db/
│   ├── index.ts        — Conexión PostgreSQL
│   └── schema.ts       — Schema Drizzle (records table)
├── middleware/
│   └── rateLimit.ts    — Rate limiting global + por ruta
├── routes/
│   ├── health.ts       — GET /v1/health
│   ├── records.ts      — CRUD /v1/records
│   └── schemas/        — Zod schemas de validación
├── services/
│   ├── anchor.ts       — Anchoring on-chain
│   ├── fee.ts          — Verificación de pagos
│   ├── queue.ts        — Cola BullMQ
│   ├── receipt.ts      — Receipt hash computation
│   ├── recordsService.ts — Lógica de negocio
│   └── signature.ts    — EIP-712 verification
├── utils/
│   ├── errors.ts       — ApiError + factories
│   └── uuid.ts         — UUID v7 generator
└── workers/
    └── anchor.worker.ts — Worker de anchoring
```

---

## Plan de acción

### Para alpha.2 (próxima iteración)
- [ ] #16 — Refactor: módulos compartidos de config (Redis + blockchain + cacheo health)
- [ ] #18 — Refactor: formatters unificados + sanitización de logs

### Para beta
- [ ] #17 — Rate limit con Redis store
- [ ] #19 — Monitorización y alertas (Sentry o similar)

### Issues existentes (v1.1/v2+)
- #11 — provenance_metadata
- #12 — Batch endpoint
- #13 — Webhooks de estado
- #14 — Doble atestación temporal
- #15 — Investigación verificación model_id
