# Informe de Auditoría — Res ex Machina v1.0.0-rc2

**Fecha:** 2026-02-12  
**Auditor:** Antigravity (skills: `production-code-audit`, `api-security-best-practices`, `blockchain-developer`)  
**Alcance:** Revisión completa del código fuente y documentación del proyecto

---

## 1. Estado General

| Área | Resultado | Nota |
|------|-----------|------|
| **Seguridad API** | ✅ Excelente | Helmet, CORS, rate limiting, error sanitization, body limits |
| **Blockchain** | ✅ Bueno | Fee verification con 5 checks, RPCs paralelas, tx recency check |
| **Calidad de código** | ✅ Bueno | TypeScript estricto, Zod validation, factory errors, schemas bien tipados |
| **Testing** | ✅ Bueno | 63 unit tests + 2 agentes alpha (happy + adversarial) + regression test |
| **Documentación** | ✅ Al día | Actualizada con rc2 — error catalog, runbook, alpha report, changelog |
| **Base de datos** | ✅ Sólido | CHECK constraints, UNIQUE constraints, índices correctos |

> **Veredicto global:** El proyecto está en muy buen estado para una v1.0 alpha privada. No se encontraron vulnerabilidades críticas.

---

## 2. Seguridad — Hallazgos

### ✅ Lo que está bien hecho

1. **Error sanitization** — Nunca se exponen stack traces ni detalles internos al cliente (`apiErrorHandler` en `errors.ts`)
2. **Helmet** — Headers de seguridad activos (XSS, clickjacking, etc.)
3. **CORS** — Deshabilitado en producción (`origin: false`)
4. **Body limit** — 64KB max, validado en Fastify config
5. **Rate limiting** — 100 req/min global, 10 req/min por wallet en POST
6. **Env validation** — Todas las variables validadas con Zod al arrancar (`env.ts`). Si falta alguna, la app NO arranca
7. **Fee anti-reuse** — UNIQUE constraint en `fee_tx_hash` + check en código
8. **Nonce anti-replay** — Compound UNIQUE en `(agent_wallet, nonce)`

### ⚠️ Observaciones menores (no críticas para alpha)

| # | Observación | Riesgo | Recomendación | Prioridad |
|---|-------------|--------|---------------|-----------|
| S-1 | `ANCHOR_WALLET_PRIVATE_KEY` en `.env` | Bajo (solo dev) | En producción usar KMS (AWS/GCP) o Vault | v1.1 |
| S-2 | CORS `origin: true` en desarrollo permite cualquier origen | Ninguno (dev only) | Ya está `false` en producción ✅ | — |
| S-3 | Worker usa `console.log/error` en vez del logger de Fastify | Bajo | Migrar a pino logger compartido para logs uniformes | v1.1 |
| S-4 | No hay API key / auth para endpoints GET | Diseño (public data) | Correcto para v1 (datos públicos por diseño). Considerar API keys para rate limit diferencial en v1.1 | v1.1 |

---

## 3. Blockchain — Hallazgos

### ✅ Lo que está bien hecho

1. **Fee verification** — 5 checks completos: tx exists, confirmed (status=success), amount ≥ minimum, recipient correcto, recency ≤24h
2. **RPCs paralelas** — `getTransaction` + `getTransactionReceipt` en `Promise.all` (optimización rc2)
3. **Receipt status check** — Verifica `receipt.status === 'success'` (no solo existencia)
4. **Anchoring con reintentos** — BullMQ con backoff exponencial (5 intentos) + estado `anchor_failed`
5. **Formato de addresses** — Comparación case-insensitive con `.toLowerCase()`

### ⚠️ Observaciones menores

| # | Observación | Riesgo | Recomendación | Prioridad |
|---|-------------|--------|---------------|-----------|
| B-1 | `anchorRecord` recibe `''` como 2º argumento (contenthash vacío) | Bajo | Refactorizar firma de `anchorRecord` para no requerir este argumento no usado | v1.1 |
| B-2 | Sin gas estimation antes de anchor | Bajo | Añadir estimación de gas + alerta si > umbral para evitar tx fallidas en red congestionada | v1.1 |
| B-3 | `FEE_TX_MAX_AGE_MS` hardcodeado (24h) | Bajo | Mover a env variable para poder ajustar sin redeploy | v1.1 |

---

## 4. Calidad de Código — Hallazgos

### ✅ Fortalezas

1. **TypeScript estricto** — Tipos bien definidos, sin `any` en interfaces públicas
2. **Factory pattern para errores** — Cada error tiene su función factory con código y mensaje fijo → inmutabilidad
3. **Schema validation con Zod** — Input validation antes de cualquier lógica de negocio
4. **DB schema robusto** — CHECK constraints para `state`, `visibility`, `content_hash`. Compound UNIQUE para anti-replay
5. **Idempotencia** — UNIQUE constraints + HTTP 409 para duplicados
6. **Estructura modular** — Separación clara: `routes/`, `services/`, `config/`, `utils/`, `workers/`, `db/`

### ⚠️ Observaciones

| # | Observación | Riesgo | Recomendación | Prioridad |
|---|-------------|--------|---------------|-----------|
| Q-1 | `records.ts` tiene 349 líneas — mucha lógica en un solo handler | Bajo | Extraer validación a un middleware o service en v1.1 | v1.1 |
| Q-2 | No hay graceful shutdown en `app.ts` | Medio | Añadir handler SIGTERM/SIGINT con `app.close()` para cerrar conexiones limpiamente | v1.1 |
| Q-3 | Worker no tiene graceful shutdown tampoco | Medio | `worker.close()` en SIGTERM para terminar jobs en curso antes de salir | v1.1 |

---

## 5. Documentación — Estado

| Documento | Estado | Acción tomada |
|-----------|--------|---------------|
| `alpha-test-report.md` | ✅ Al día | Actualizado con resultados rc2 (429 fix, 10/10 tests) |
| `CHANGELOG.md` | ✅ Al día | Añadida sección rc2 con fixes y cambios |
| `error-catalog.md` | ✅ Al día | Ya incluía 429 `rate_limit_exceeded` |
| `runbook.md` | ✅ Al día | 6 escenarios cubiertos, métricas correctas |
| `Implementation_Plan.md` | ✅ Al día | Marcado como referencia histórica |
| `tools-and-skills.md` | ✅ Al día | Skills y MCPs documentados |

---

## 6. GitHub Issues — Estado

| Issue | Título | Estado | Nota |
|-------|--------|--------|------|
| #1–#9 | Fases v1.0 | ✅ Cerradas | Todo el MVP implementado |
| #10 | Provenance metadata field | 🟢 Open (v1.1) | Diseño listo en `c2pa-interoperability.md` |
| #11 | Batch endpoint | 🟢 Open (v1.1) | — |
| #12 | Webhooks de estado | 🟢 Open (v1.1) | — |
| #13 | Doble atestación temporal | 🟢 Open (v1.1) | — |

---

## 7. Resumen de Skills utilizadas

| Skill | Uso |
|-------|-----|
| `production-code-audit` | Checklist de auditoría de código, estructura del informe |
| `api-security-best-practices` | Revisión de Helmet, CORS, rate limiting, error handling, input validation |
| `blockchain-developer` | Revisión de fee verification, anchoring, wallet management |

---

## 8. Recomendaciones para v1.1

Las observaciones S-1, B-1, B-2, B-3, Q-1, Q-2, Q-3 son todas **no críticas para alpha** pero deberían priorizarse para v1.1. Las más importantes son:

1. **Q-2/Q-3: Graceful shutdown** — Evita pérdida de datos si el proceso se mata durante un anchoring
2. **S-1: KMS para private key** — Fundamental antes de producción real
3. **Q-1: Refactor records.ts** — Crecerá con batch endpoint (#11)

> **Conclusión:** El proyecto está listo para alpha privada. La calidad del código es alta, las invariantes están protegidas, y la documentación está actualizada.
