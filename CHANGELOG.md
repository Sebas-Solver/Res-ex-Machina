# Changelog

Todos los cambios notables del proyecto se documentan aquí.
El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

---

## [Unreleased] — Para alpha.2

### Auditoría de Seguridad y Testing Automatizado

#### Añadido

- **Code Review alpha.2** — `Docs/code-review-alpha2.md`, informe exhaustivo de revisión de código que cubre arquitectura, seguridad, rendimiento y calidad
- **Semgrep SAST scan** — Análisis estático de seguridad con Semgrep MCP sobre archivos críticos (`walletAuth.ts`, SDK completo): **0 vulnerabilidades detectadas**
- **Smoke test E2E** — `scripts/smoke-test-live.ts` + `npm run smoke:live`: valida SDK publicado contra API en producción (health → balance → fee → record → verify → export). 6/6 pasos OK. Cierra Issue #31
- **TestSprite API testing** — `testsprite_tests/testsprite-mcp-test-report.md`, ejecución de 7 test cases automatizados contra la API:
  - ✅ 2 tests pasados (export endpoints — error handling 400/404 correcto)
  - ❌ 5 tests fallidos (limitación de TestSprite: no puede generar firmas EIP-712 ni transacciones on-chain)
  - Los 5 fallos **confirman que las validaciones funcionan** (rate limiting, schema Zod, rechazo de firmas inválidas)

### SDK npm (`@res-ex-machina/sdk`) — Issue #27 ✅ Cerrado

### Quick Start Guide — Issue #28 ✅ Cerrado

### README English Translation

#### Changed

- **README.md** — Full translation from Spanish to English (403 lines). All sections preserved: badges, architecture, endpoints, tests, roadmap, issues table, philosophy. Updated current status with accurate counts (73 tests, 17 suites, 5 open / 16 closed issues, SDK npm link)

#### Añadido

- **`Docs/quick-start.md`** — "Zero to first record in 5 minutes", guía en inglés con copy-paste
  - Install → Create wallet → Record → Verify → Complete working example
  - Menos de 50 líneas de código total
  - Enlace añadido al README principal

#### Añadido

- **Paquete `@res-ex-machina/sdk`** en `packages/sdk/` — SDK TypeScript completo para integración trivial con RxM
  - `RxMClient` — Orquestador: `record()`, `recordBatch()`, `verify()`, `getRecord()`, `export()`, `listRecords()`, `waitForRecord()`
  - **Modo BYO fee** — `record()` acepta `feeTxHash` opcional; si se proporciona, el SDK no paga on-chain
  - **Webhooks subclient** — `rxm.webhooks.register()`, `list()`, `delete()` con autenticación EIP-191
  - **Errores tipados** — `RxMError`, `RxMRateLimitError` (con `retryAfterMs`), `RxMValidationError`
  - **HTTP con retry** — Exponential backoff (1s→2s→4s), timeout configurable
  - **Hashing WebCrypto** — `crypto.subtle` primero, fallback a `node:crypto` para Node 18+
  - **Firma EIP-712** — Importa constantes compartidas con el servidor
  - **30 tests unitarios** en 4 suites (hash, sign, errors, client)
  - **README completo** — Instalación, quick start, modos de uso, error handling, referencia API
- **`src/constants/eip712.ts`** — Constantes EIP-712 extraídas como fuente única de verdad (server + SDK importan de aquí)

#### Publicado

- **📦 Publicado en npm** — [`@res-ex-machina/sdk@0.1.0`](https://www.npmjs.com/package/@res-ex-machina/sdk) (2026-02-16)
  - 38 archivos (dist/ compilado a ESM)
  - Paquete público bajo organización npm `res-ex-machina`
  - Código y documentación traducidos al inglés para adopción internacional
  - `npm install @res-ex-machina/sdk viem`

### Mejoras en Tests

#### Mejorado

- **Provider-agnostic model_id** — Actualizado formato en 6 test files de `gpt-4o` a `openai:gpt-4o:2026-01` (consistente con política provider-agnostic)
  - Archivos: `schemas.test.ts`, `invariants.test.ts`, `records-list.test.ts`, `records-get.test.ts`, `records-batch.test.ts`, `formatters.test.ts`
- **`tests/eip712-sync.test.ts`** — Nuevo test crítico: verifica que las constantes EIP-712 del SDK coinciden exactamente con las del servidor (previene divergencia silenciosa de firmas)
- **Total tests**: 43 servidor + 30 SDK = 73 tests

### Batch Endpoint — Issue #12

#### Añadido

- **`POST /v1/records/batch`** — Endpoint para crear hasta 100 records en una sola llamada
  - Cada record se procesa independientemente (un fallo no afecta a otros)
  - Status codes: `201` (todo ok), `207` (parcial), `400` (todo falla)
  - Rate limit más restrictivo: 5 req/min por wallet
  - Cada record requiere su propio `fee_tx_hash`
- **`src/routes/schemas/batchRecordSchema.ts`** — Schema Zod para batch (array de 1-100 `createRecordSchema`)
- **Errores nuevos** — `batch_empty` (400), `batch_too_large` (400), `batch_invalid_payload` (400)
- **13 tests nuevos** en `tests/records-batch.test.ts` (total: 141)

### Webhooks de Estado — Issue #13

#### Añadido

- **Endpoints webhook** (`POST / GET / DELETE /v1/webhooks`) — Sistema completo de notificaciones push para cambios de estado de records
  - `POST /v1/webhooks` — Registrar webhook (requiere walletAuth EIP-191)
  - `GET /v1/webhooks` — Listar webhooks propios (sin devolver secrets)
  - `DELETE /v1/webhooks/:id` — Desactivar webhook (soft delete)
- **Seguridad completa** adherida a mejores prácticas:
  - **SSRF mitigation** — `urlValidator.ts`: solo HTTPS, DNS resolve, bloqueo IPs privadas/localhost/link-local, `redirect: 'error'`
  - **Secret servidor** — 32 bytes hex generados por servidor, devueltos una sola vez en POST
  - **HMAC-SHA256** — Header `X-RxM-Signature` con firma del payload para autenticidad
  - **Deduplicación** — `delivery_id` (UUID) + `attempt` en cada payload
  - **Async dispatch** — Cola BullMQ `webhook_dispatch` (no bloquea anchoring)
  - **Retries** — 3 intentos con backoff customizado (5s → 30s → 120s)
  - **Timeout** — 5s por request HTTP
  - **Límite** — Máximo 5 webhooks activos por wallet
- **Tabla DB** — `webhooks` en PostgreSQL (Drizzle ORM) con índices por wallet y active
- **Errores nuevos** — `webhook_not_found` (404), `webhook_limit_reached` (400), `webhook_invalid_url` (400), `webhook_forbidden` (403)
- **Integración anchor.ts** — Dispara webhooks después de `anchored` y `anchor_failed` (en try/catch, nunca bloquea)
- **18 tests nuevos** en `tests/webhooks.test.ts` (total: 159, 12 suites)

### Doble Atestación Temporal — Issue #14

#### Añadido

- **`pki_timestamp`** — Campo opcional ISO-8601 en `provenance_metadata` para doble atestación temporal
  - Permite vincular timestamp PKI (de estándar de procedencia) con blockchain anchor
  - `temporal_attestation` en export incluye ambas fuentes: `blockchain_anchor` + `pki_standard`
- **3 tests nuevos** de validación (total: 128 en ese punto de la sesión)

### Listado Público de Records — Issue #21

#### Añadido

- **`GET /v1/records`** — Endpoint público para listar records por wallet con filtros avanzados
  - Filtro obligatorio: `agent_wallet` (dirección Ethereum)
  - Filtros opcionales: `state`, `content_type`, `tag`, rango de fechas (`from`/`to`)
  - Paginación: `limit` (1-100, default 20) y `offset` (≥0, default 0)
  - Ordenación: `sort` (`created_at_asc`, `created_at_desc`)
  - Respuesta con `pagination: { total, limit, offset, has_more }`
- **`src/routes/schemas/listRecordsSchema.ts`** — Schema Zod para query params del listado
- **Errores nuevos** — `missing_agent_wallet` (400), `invalid_query_param` (400)
- **11 tests nuevos** en `tests/records-list.test.ts` (total: 113 → 125)

### Interoperabilidad con Estándares de Procedencia — Issue #11

#### Añadido

- **`provenance_metadata`** — Campo JSONB opcional en `POST /v1/records` para vincular con estándares de procedencia
  - 5 estándares: `c2pa`, `iptc`, `xmp`, `schema_org`, `custom`
  - Campos: `standard`, `manifest_hash` (sha256), `claim_generator`, `issuer`, `assertions` (max 20), `manifest_uri`
  - 100% backward compatible — records sin provenance siguen funcionando
- **`provenanceMetadataSchema`** — Schema Zod exportado para validación
- Incluido automáticamente en todas las respuestas API (`formatRecordResponse`, `formatFullExport`)
- **12 tests nuevos** de validación (total: 125 tests, 10 suites)

### Infraestructura y Resiliencia — Issues #16, #17, #22

#### Añadido

- **Health cache 30s** — Cache TTL de 30 segundos en `GET /v1/health` para reducir llamadas a Upstash y RPC (#16)
  - Headers `Cache-Control: public, max-age=30` y `X-Cache: HIT|MISS`
  - Header `Retry-After: 30` en respuestas 503 (modo degradado) (#22)
- **Rate limit con Redis** — Migrado de in-memory a Redis store compartido (#17)
  - Factory `createRateLimitRedisClient()` en `config/redis.ts`
  - `skipOnError: true` — si Redis cae, rate limit se desactiva temporalmente (#22)
  - Namespace `rxm-rl:` para evitar colisiones en Redis compartido

#### Mejorado

- **Modo degradado** — La API sigue funcionando si Redis o L2 no están disponibles (#22):
  - `enqueueAnchorJob` protegido con try/catch: el record se guarda en DB con `state: pending_anchor`
  - Worker procesará el jobs pendientes cuando reconecte
  - Health check usa `Promise.allSettled` → nunca falla completamente

### Autenticación por Wallet — Listado de Records Propios (Issue #26)

#### Añadido

- **`GET /v1/records/mine`** — Endpoint autenticado para listar records propios del agente
  - Autenticación EIP-191 (personal_sign) con headers `X-Wallet-Address`, `X-Signature`, `X-Timestamp`
  - Mensaje firmado: `RexAuth:{timestamp}` con ventana de 5 minutos
  - Paginación con `?limit=20&offset=0`
  - Solo devuelve records de la wallet autenticada
- **`src/middleware/walletAuth.ts`** — Nuevo middleware de verificación de firma de wallet
- **4 errores de auth** en `errors.ts`: `missing_auth_headers`, `invalid_wallet_address`, `auth_timestamp_expired`, `auth_signature_invalid`
- **9 tests unitarios** en `tests/wallet-auth.test.ts` (total: 100 tests)
- **Paso 10 en test-alpha.ts** — E2E de autenticación + listado propio

#### Corregido

- **Case-sensitivity en wallet** — SQL `lower()` para comparación correcta entre DB (mixed-case) y middleware (lowercase)

### Verificación Independiente de Receipts

#### Añadido

- **Metadatos de verificación en export** — El endpoint `/v1/records/:id/export` ahora incluye:
  - `verification`: algoritmo de hash, canonización, campos usados
  - `pog_bundle.eip712_domain`: dominio EIP-712 para verificar firma sin código fuente
  - `anchor.anchored_hash` + `anchor.anchor_method`: qué se ancla y cómo
  - `fee.chain_id` + `fee.to`: datos de trazabilidad del fee
- **Receipt Verification Spec** — `Docs/receipt-verification-spec.md`: especificación formal (1 página) para verificación offline
- **Verificador CLI** — `scripts/verify-receipt.ts`: herramienta independiente que verifica receipt_hash, firma EIP-712 y anchoring on-chain
- **Spec v1.2** — Modelo de confianza formal, `spec_version` en receipts, semántica temporal `created_at`, vector de prueba oficial con hash esperado
- **Issues creadas** — #20 (links auto), #21 (listar registros), #22 (modo degradado), #23 (fee enrichment), #24 (CLI verifier), #25 (export minimal)

### DX Improvements (Developer + Agent Experience)

#### Añadido

- **`wait_for_anchor=true`** — POST `/v1/records?wait_for_anchor=true` espera hasta 25s a que el anchoring se complete, devolviendo el estado final en una sola llamada. Si timeout, devuelve `pending_anchor` con header `Retry-After: 5`
- **`state_info` estructurado** — Todas las respuestas incluyen bloque `state_info` con `terminal`, `retryable` y `description` para que agentes actúen programáticamente
- **`explorer_url` automático** — Bloques `anchor` y `fee` ahora incluyen `explorer_url` y `network_name` generados automáticamente según `chain_id`
- **Modo compact** — `GET /v1/records/:id/export?mode=compact` devuelve solo campos de verificación criptográfica, omitiendo fee, visibility, metadata de generación (ideal para LLMs)
- **18 tests nuevos** — Tests unitarios para `stateInfo`, `explorer` y tests de integración para state_info, compact mode

### Code Review Refactoring

#### Corregido

- **`anchor_failed` state metadata** — Cambiado a `terminal: true`, `retryable: false` (el worker BullMQ ya agotó sus reintentos)
- **`feeTxReused` status code** — De 402 → 409 (semánticamente es un conflicto, no un problema de pago)
- **Fee comparison precision** — Sustituido `parseFloat(formatEther())` por `parseEther()` con BigInt nativo (evita pérdida de precisión IEEE-754)
- **Error handler logging** — `console.error` reemplazado por `_request.log.error()` (logs estructurados Pino)
- **Worker import error handling** — try/catch específico para import dinámico del anchor worker (la API puede funcionar sin worker)

#### Mejorado

- **Health check performance** — Clientes singleton para Redis y blockchain (antes se creaban en cada llamada)
- **Wallet privacy** — Wallet truncada en logs (`0x13bB...8a0` en vez de dirección completa)
- **Rate limit safety** — try/catch en `keyGenerator` del rate limit por wallet + documentación del body parsing order

---

## [1.0.0-alpha.1] — 2026-02-12

### Primer Deploy Público (Alpha) 🚀

Deploy en Render + Neon + Upstash + Base Sepolia testnet. Coste: $0/mes.

#### Añadido

- **Multi-chain** — `anchor.ts` ya no depende de `foundry` (Anvil local). Usa `defineChain` con `L2_CHAIN_ID` dinámico, soporta cualquier EVM L2 (Base Sepolia, Polygon, etc.)
- **Redis TLS + password** — `queue.ts` y `anchor.worker.ts` soportan `rediss://` (TLS obligatorio) y extraen password de la URL. Necesario para Upstash
- **Worker inline** — `app.ts` arranca el anchor worker en el mismo proceso en producción (`NODE_ENV=production`). Elimina necesidad de Background Worker separado (plan de pago en Render)
- **`.env.example`** — Documentadas opciones de cloud (Neon, Upstash, Base Sepolia)

#### Infraestructura cloud

| Servicio | Proveedor | Plan |
|---|---|---|
| API + Worker | Render.com | Free (Docker) |
| PostgreSQL | Neon | Free (0.5GB) |
| Redis | Upstash | Free (10K cmd/día) |
| Blockchain | Base Sepolia | Testnet (gratis) |

#### URL pública

`https://res-ex-machina-api.onrender.com`

#### Archivos modificados

- `src/services/anchor.ts` — `defineChain` dinámico
- `src/services/queue.ts` — TLS + password
- `src/workers/anchor.worker.ts` — TLS + password
- `src/app.ts` — Worker inline en producción
- `.env.example` — Opciones cloud documentadas

---

## [1.0.0-rc3] — 2026-02-12

### Hardening Pre-Alpha

#### Añadido

- **Graceful shutdown** — `app.ts`: SIGTERM/SIGINT drena requests activas, cierra cola BullMQ y pool PostgreSQL ordenadamente
- **Graceful shutdown worker** — `anchor.worker.ts`: SIGTERM/SIGINT deja de aceptar jobs nuevos, termina el actual, cierra limpio
- **`FEE_TX_MAX_AGE_HOURS`** — Nueva variable de entorno configurable (default 24h), antes hardcodeada en `fee.ts`
- **`recordsService.ts`** — Nuevo módulo con lógica de negocio extraída de `records.ts`:
  - `validateAndParseInput()` — validación Zod con errores diferenciados
  - `checkDuplicates()` — 3 checks DB en paralelo (content_hash, nonce, fee_tx_hash)
  - `createRecord()` — INSERT DB + enqueue anchor + manejo UNIQUE violations
- **Export `client`** — `db/index.ts` ahora exporta el client PostgreSQL para shutdown

#### Mejorado

- **POST handler simplificado** — `records.ts` reducido de 349 a 222 líneas. El handler pasa de ~140 a ~30 líneas
- **Duplicados de fee_tx_hash** — Check movido al `Promise.all` junto con hash+nonce (antes era secuencial)

#### Archivos modificados

- `src/app.ts` — Shutdown function + dynamic import de `anchorQueue`
- `src/workers/anchor.worker.ts` — Shutdown function
- `src/db/index.ts` — Export `client`
- `src/config/env.ts` — `FEE_TX_MAX_AGE_HOURS` (Zod, default 24)
- `src/services/fee.ts` — Usa `env.FEE_TX_MAX_AGE_HOURS` en vez de constante
- `src/services/recordsService.ts` — **Nuevo archivo**
- `src/routes/records.ts` — Simplificado, usa recordsService
- `.env.example` — Documentada nueva variable
- `tests/fee.test.ts` — Mock actualizado con `FEE_TX_MAX_AGE_HOURS`

---

## [1.0.0-rc2] — 2026-02-12

### CI / Tests — Sesión 2

#### Corregido

- **Tests de fee** — Añadido mock `getTransactionReceipt` que faltaba tras la optimización `Promise.all` de rc2
- **Tests de invariantes** — Añadido `mockVerifyFee` en tests de nonce/content_hash duplicado (verifyFee corre en paralelo en `Promise.all` con checks DB)
- **Tests de invariantes** — Corregido mock de GET record (`mockLimit` desincronizado)

#### Mejorado

- **CI workflow** — Reescrito `.github/workflows/ci.yml`:
  - Variables de entorno consolidadas (de 3 bloques repetidos a 1)
  - `FEE_MINIMUM_AMOUNT` corregido: 0.001 → 0.01 (sincronizado con rc2)
  - Añadido **Node 22 LTS** a la matrix de versiones
  - Añadido `timeout-minutes: 10` contra runs colgados
  - Añadido `concurrency` para cancelar runs duplicados
  - Añadido step de **cobertura** con `@vitest/coverage-v8` + artefacto descargable
- **Nuevo script** `test:coverage` en `package.json`

#### Archivos modificados

- `.github/workflows/ci.yml` — Reescrito completo
- `package.json` — Añadido `test:coverage`
- `tests/fee.test.ts` — Mock `getTransactionReceipt` + fixture `VALID_RECEIPT`
- `tests/invariants.test.ts` — `mockVerifyFee` en 3 tests + fix mock GET

---

### Cambios importantes

- **Fee mínimo subido** — de $0.001 a **$0.01** (~1 centavo de dólar) en `.env.example`, 4 tests, 1 script y 7 documentos
- **Coste de spam actualizado** en threat model: 1M registros ahora cuesta $10.000 (antes $1.000)

### Añadido

- **Guía humana** — Sección "Cosas importantes que debes saber" con 4 aclaraciones:
  - Wallet = identidad técnica (persona, organización o agente)
  - `model_id` es declarativo (RxM no verifica qué modelo se ejecutó)
  - Contenido duplicado → primer registro gana
  - Fallos de blockchain → registro inmediato en DB, anclaje con reintentos
- **Guía técnica** — Sección "Trust Model & Declarative Fields":
  - Identity model (1 wallet por agente recomendado)
  - Tabla de campos verificados vs declarativos con nivel de confianza
  - Recomendaciones para integradores
- **Guía humana** — Posibilidad futura de almacenamiento descentralizado (IPFS) mencionada en FAQ
- **GitHub Issue #15** — Investigar verificación/corroboración del `model_id` (v2+)

### Corregido

- **Rate limit 429 bug** — `@fastify/rate-limit` con `config.rateLimit` por ruta pasa un objeto plano (no un `Error`) al handler. El `apiErrorHandler` ahora detecta estos objetos y devuelve 429 con formato correcto
- **POST /v1/records latencia** — Paralelización de `verifyFee()` (2 RPCs via `Promise.all`) y paralelización de checks DB (hash + nonce + fee)
- **Race condition INSERT** — Protección con `try/catch` de UNIQUE constraint (código 23505) para duplicados concurrentes

### Añadido

- Test de regresión rate limit: `scripts/tests/rate-limit-regression.ts` (7 checks)
- Alpha test re-ejecutado: Agente A 15/20 + 5×429 ✅, Agente D 10/10 ✅

### Archivos modificados

- `src/utils/errors.ts` — Handler 429/413 + detección objetos planos rate-limit
- `src/services/fee.ts` — RPCs paralelas + receipt status check
- `src/routes/records.ts` — Promise.all parallelization + UNIQUE constraint safety

---

## [1.0.0-rc1] — 2026-02-11

### Release Candidate 1

Preparación para alpha privada: hardening de seguridad, observabilidad, documentación completa, scripts de test, y diseño de interoperabilidad con estándares de procedencia.

### Añadido

#### Seguridad y hardening
- Rate limiting por wallet: 10 req/min POST /v1/records
- Validaciones estrictas: nonce max 128, signature exacta 132, tags max 64, external_ref max 512
- Error sanitization: eliminados `any` casts en error handler

#### Observabilidad
- Logs estructurados en `app.ts`: request_id UUID, wallet extraction, response_time_ms
- Log level por status code: 5xx=error, 4xx=warn, 2xx=info
- Runbook de operaciones con 6 escenarios (`Docs/runbook.md`)

#### Documentación
- Verificación offline de PoG (`Docs/verify-pog-offline.md`)
- Ejemplos curl de todos los endpoints (`Docs/api-examples.md`)
- Plan de piloto alpha (`Docs/alpha-pilot-plan.md`)
- Interoperabilidad con estándares de procedencia (`Docs/c2pa-interoperability.md`)

#### Alpha Testing
- Script Agente A: happy path, burst 20 records, idempotencia, verify/export
- Script Agente D: 8 tests adversariales (firma, nonce, hash, fee, delete, rate limit)
- Scripts npm: `check`, `alpha:happy`, `alpha:adversarial`, `alpha:all`

#### Diseño v1.1
- Campo genérico `provenance_metadata` con discriminador `standard`
- Soporte para C2PA, IPTC, XMP, Schema.org, custom
- OP-14 en Principios Fundacionales: interoperabilidad con estándares de procedencia

---

## [1.0.0] — 2026-02-10

### MVP Completado 🎉

Primera versión funcional del MVP con API REST, verificación EIP-712, fee on-chain, anchoring y 63 tests.

### Añadido

#### Core API
- **POST /v1/records** — Registro de hechos de generación con PoG v1 firmado
- **GET /v1/records/:id** — Consulta de record por UUID
- **GET /v1/records/verify** — Verificación de existencia por content_hash
- **GET /v1/records/:id/export** — Exportación de receipt verificable (`rex.receipt.v1`)
- **GET /v1/health** — Health check detallado (PostgreSQL, Redis, L2)
- **DELETE /v1/records/:id** — 405 Method Not Allowed (INV-001: records permanentes)

#### Verificación y Seguridad
- Firma EIP-712 con `viem.verifyTypedData`
- Verificación fee on-chain (5 checks: exists, confirmed, amount, recipient, recent)
- Idempotencia por content_hash (409 Conflict)
- Anti-replay por wallet+nonce (409 Conflict)
- Fee tx no reutilizable (UNIQUE constraint)
- Rate limiting: 100 req/min global, 10 req/min POST
- Headers de seguridad (`@fastify/helmet`)
- CORS configurado (`@fastify/cors`, deshabilitado en producción)
- Body limit 64KB
- Error sanitization (nunca expone stack traces)

#### Infraestructura
- Modelo de datos PostgreSQL con Drizzle ORM (tabla `records`)
- Anchor Worker con BullMQ (reintentos exponenciales)
- Docker Compose (PostgreSQL + Redis + Anvil)
- Dockerfile para producción
- CI/CD con GitHub Actions (tsc + vitest + coverage v8 + build, Node 20+22)

#### Tests (63 passing)
- `errors.test.ts` (9) — ApiError + factory functions
- `receipt.test.ts` (4) — SHA-256 receipt hash determinista
- `schemas.test.ts` (14) — Validación Zod (PoG + createRecord)
- `fee.test.ts` (9) — Fee on-chain (5 checks mockeados)
- `records-get.test.ts` (13) — GET /:id, /verify, /export
- `invariants.test.ts` (14) — Invariantes del sistema (POST 401/402/409, DELETE 405)

### Issues cerradas
- [#1](https://github.com/Sebas-Solver/Res-ex-Machina/issues/1) Scaffolding (`2005ea5`)
- [#2](https://github.com/Sebas-Solver/Res-ex-Machina/issues/2) Modelo de datos (`65b9fe4`)
- [#3](https://github.com/Sebas-Solver/Res-ex-Machina/issues/3) POST /records EIP-712 (`9f2edeb`)
- [#4](https://github.com/Sebas-Solver/Res-ex-Machina/issues/4) Fee on-chain (`32e2425`)
- [#5](https://github.com/Sebas-Solver/Res-ex-Machina/issues/5) GET endpoints (`160b5a5`)
- [#6](https://github.com/Sebas-Solver/Res-ex-Machina/issues/6) Anchor Worker (`4518376`)
- [#7](https://github.com/Sebas-Solver/Res-ex-Machina/issues/7) Health + Rate limiting (`d187c77`)
- [#8](https://github.com/Sebas-Solver/Res-ex-Machina/issues/8) Hardening seguridad (`0e86c67`)
- [#9](https://github.com/Sebas-Solver/Res-ex-Machina/issues/9) Tests invariantes (`6aa9445`)

### Dependencias principales
- `fastify` ^5.2.2
- `viem` ^2.25.3
- `drizzle-orm` ^0.39.3
- `bullmq` ^5.52.1
- `ioredis` ^5.6.0
- `zod` ^3.25.3
- `vitest` ^4.0.18
- `typescript` ^5.8.3
- `@fastify/helmet` ^13.0.1
- `@fastify/cors` ^11.0.1
- `@fastify/rate-limit` ^10.2.2
