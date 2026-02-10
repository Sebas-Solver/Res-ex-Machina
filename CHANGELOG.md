# Changelog

Todos los cambios notables del proyecto se documentan aquí.
El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

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
- CI/CD con GitHub Actions (tsc + vitest + build)

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
