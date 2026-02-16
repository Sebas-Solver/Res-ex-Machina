<p align="center">
  <strong>⚖️ RES EX MACHINA</strong><br/>
  <em>El primer registro neutral y automatizado donde los agentes de IA<br/>dejan huella verificable de sus creaciones</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/estado-Alpha%20Privada-brightgreen" alt="Estado: Alpha Privada"/>
  <img src="https://img.shields.io/badge/versión-v1.0.0--alpha.2--dev-blue" alt="Versión: v1.0.0-alpha.2-dev"/>
  <img src="https://img.shields.io/badge/tests-125%20passing-brightgreen" alt="Tests: 125 passing"/>
  <img src="https://img.shields.io/badge/CI-GitHub%20Actions%20(Node%2020%2B22)-success" alt="CI: GitHub Actions (Node 20+22)"/>
  <img src="https://img.shields.io/badge/coverage-v8-informational" alt="Coverage: v8"/>
  <img src="https://img.shields.io/badge/licencia-Apache%202.0-lightgrey" alt="Licencia: Apache 2.0"/>
</p>

---

## 🧬 ¿Qué es Res ex Machina?

**Res ex Machina** es una plataforma de **registro técnico de hechos de generación por IA**. No juzga, no valida, no modera. Solo registra y ancla criptográficamente.

Cuando un agente de IA genera un output (texto, imagen, código, audio...), puede registrar ese hecho en Res ex Machina con un **Proof of Generation (PoG)** firmado. El sistema:

1. ✅ Verifica la firma criptográfica del agente (EIP-712)
2. ✅ Registra el hecho con timestamp inmutable
3. ✅ Verifica el pago del fee on-chain
4. ✅ Ancla el registro en una blockchain L2 EVM
5. ✅ Devuelve un receipt verificable por terceros

> **"La cosa surgida de la máquina"** — Un registro que no dice si algo es bueno, legal o original. Solo dice: *esto fue declarado como generado por esta identidad técnica, en este momento*.

---

## 🎯 Problema que resuelve

| Problema actual | Solución Res ex Machina |
|---|---|
| Los outputs de IA no tienen trazabilidad verificable | Registro inmutable con firma criptográfica |
| No existe un sistema de registro **positivo** para IA | PoG: el agente declara proactivamente lo que genera |
| Los agentes generan sin dejar memoria verificable | Timeline verificable por hash o por record ID |
| El cumplimiento regulatorio (EU AI Act) requiere trazabilidad | Registro neutral, público y auditable |

---

## 🏗️ Principios fundacionales

```
NEUTRALIDAD     → No juzga contenido. Registra hechos.
INMUTABILIDAD   → Lo registrado no se borra, no se modifica.
AUTOMATIZACIÓN  → Diseñado para agentes, no para humanos.
VERIFICABILIDAD → Todo es verificable criptográficamente.
NO CUSTODIA     → El agente controla su identidad (wallet).
```

---

## 📦 Qué se registra (y qué NO)

### ✅ Siempre se registra
- `content_hash` — SHA-256 del output generado
- `agent_wallet` — Identidad criptográfica del agente
- `timestamp` — Momento de generación declarado
- `pog_bundle` — Proof of Generation v1 firmado (EIP-712)
- `generation_process` — Tipo, nivel de intervención humana, pipeline
- Estado de anchoring on-chain

### ❌ Nunca se registra (en v1)
- El contenido en sí (solo el hash)
- Detección de IA / scoring de originalidad
- Validación humana de ningún tipo
- Análisis semántico ni moderación
- Claims de copyright

---

## 🛠️ Arquitectura (v1)

```
Agente IA ──────────── API REST ──────────── PostgreSQL
  (wallet)    EIP-712     │                    (records)
                          │
                     Redis (queue)
                          │
                    Anchor Worker ────── Blockchain L2
                     (BullMQ)            (anchoring)
```

### Stack tecnológico

| Componente | Tecnología |
|---|---|
| API | Fastify + TypeScript (ESM) |
| Base de datos | PostgreSQL + Drizzle ORM |
| Cola de trabajos | Redis + BullMQ |
| Blockchain | viem + L2 EVM (Base Sepolia testnet / multi-chain) |
| Firma | EIP-712 (verifyTypedData) |
| Tests | Vitest (125 tests, 10 suites) + cobertura v8 |
| CI/CD | GitHub Actions (Node 20+22, coverage) |
| Seguridad | Helmet, CORS, Rate Limit |

### Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/v1/health` | — | Estado del sistema (DB, Redis, L2) |
| `POST` | `/v1/records` | Wallet (EIP-712) | Registrar un hecho de generación |
| `POST` | `/v1/records?wait_for_anchor=true` | Wallet (EIP-712) | Crear + esperar anchoring (max 25s) |
| `GET` | `/v1/records/{id}` | — | Consultar por ID |
| `GET` | `/v1/records/verify?content_hash=` | — | Verificar por hash |
| `GET` | `/v1/records` | — | Listar records por wallet (filtros, paginación, sort) |
| `GET` | `/v1/records/mine` | Wallet (EIP-191) | Listar records propios del agente |
| `GET` | `/v1/records/{id}/export` | — | Exportar receipt verificable |
| `GET` | `/v1/records/{id}/export?mode=compact` | — | Receipt compacto (solo verificación) |

### Anti-abuso
- **Fee on-chain** obligatorio — verificado con 5 checks (exists, confirmed, amount, recipient, recent)
- **Rate limiting** — 100 req/min global, 10 req/min POST /records
- **Idempotencia** — content_hash unique (409)
- **Nonce único** — por wallet, anti-replay (409)
- **Body limit** — 64KB máximo
- **Helmet** — Headers de seguridad automáticos

---

## 🧪 Tests

```
125 tests en 10 suites — todos passing ✅

 ✓ errors.test.ts       (9)   — ApiError + factories
 ✓ receipt.test.ts      (4)   — SHA-256 receipt hash
 ✓ schemas.test.ts      (26)  — Validación Zod (incl. provenance_metadata)
 ✓ fee.test.ts          (9)   — Fee on-chain (5 checks)
 ✓ records-get.test.ts  (18)  — GET /:id, /verify, /export, DX features
 ✓ records-list.test.ts (11)  — GET /v1/records (filtros, paginación, sort)
 ✓ invariants.test.ts   (14)  — Invariantes del sistema
 ✓ dx-features.test.ts  (13)  — stateInfo + explorer utilities
 ✓ wallet-auth.test.ts  (9)   — Middleware de auth por firma
 ✓ formatters.test.ts   (10)  — Formateadores de respuesta
```

---

## 🧪 Probar la API (testers)

¿Quieres probar la API sin montar el entorno de desarrollo? → **[Testing Quickstart](Docs/testing-quickstart.md)** (5 minutos)

- 📋 **[Colección Postman](Docs/postman-collection.json)** — Importa en Postman y prueba todos los endpoints
- 🔧 **[Script E2E](scripts/test-alpha.ts)** — Test automatizado (registra, ancla, verifica, exporta)

---

## 🚀 Quickstart

```bash
# 1. Clonar e instalar
git clone https://github.com/Sebas-Solver/Res-ex-Machina.git
cd Res-ex-Machina
npm install

# 2. Configurar entorno
cp .env.example .env
# Editar .env con tus valores

# 3. Levantar infraestructura
docker compose up -d

# 4. Ejecutar migraciones
npm run db:push

# 5. Arrancar API + Worker
npm run dev              # API en localhost:3000
npm run worker:anchor    # Worker de anchoring
```

### Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo (tsx watch) |
| `npm test` | Ejecutar 125 tests |
| `npm run test:coverage` | Tests con reporte de cobertura (v8) |
| `npm run build` | Build de producción |
| `npm run db:push` | Aplicar migraciones |
| `npm run db:generate` | Generar migraciones |
| `npm run worker:anchor` | Worker de anchoring BullMQ |
| `npm run check` | Type checking con tsc |
| `npm run alpha:happy` | Test happy path (Agente A) |
| `npm run alpha:adversarial` | Test adversarial (Agente D) |
| `npm run alpha:all` | Ambos tests alpha |
| `npx tsx scripts/verify-receipt.ts` | Verificador CLI de receipts |

---

## 📁 Estructura del proyecto

```
src/
├── app.ts                    # Entry point Fastify
├── config/
│   ├── blockchain.ts          # Clientes L2 compartidos (viem)
│   ├── env.ts                # Variables de entorno (Zod)
│   └── redis.ts              # Clientes Redis (BullMQ, health, rate limit)
├── db/
│   ├── index.ts              # Conexión Drizzle
│   └── schema.ts             # Modelo records
├── middleware/
│   ├── rateLimit.ts          # Rate limiting por IP (Redis + skipOnError)
│   └── walletAuth.ts         # Autenticación EIP-191 (GET /records/mine)
├── routes/
│   ├── health.ts             # GET /v1/health (cache 30s)
│   ├── records.ts            # POST + GET /v1/records
│   └── schemas/
│       ├── index.ts          # Validación Zod (PoG, createRecord, provenance)
│       └── listRecordsSchema.ts  # Validación query params GET /v1/records
├── services/
│   ├── anchor.ts             # Anchoring on-chain
│   ├── fee.ts                # Verificación fee (5 checks)
│   ├── queue.ts              # BullMQ job queue
│   ├── receipt.ts            # SHA-256 receipt hash
│   ├── recordsService.ts     # Lógica de negocio (validar, duplicados, crear)
│   ├── signature.ts          # EIP-712 verification
│   └── waitForAnchor.ts      # Polling DB para esperar anchoring
├── utils/
│   ├── errors.ts             # ApiError + factories
│   ├── explorer.ts           # URLs de blockchain explorer por chain
│   ├── stateInfo.ts          # Metadata estructurada de estados
│   └── uuid.ts               # UUID v7
└── workers/
    └── anchor.worker.ts      # Worker BullMQ
tests/
├── dx-features.test.ts
├── errors.test.ts
├── fee.test.ts
├── formatters.test.ts
├── invariants.test.ts
├── receipt.test.ts
├── records-get.test.ts
├── schemas.test.ts
├── records-list.test.ts
└── wallet-auth.test.ts
Docs/
├── 10-specs/                 # Especificaciones técnicas
├── 20-security/              # Threat model
└── 30-adr/                   # Architecture Decision Records
```

---

## 📁 Documentación

| Documento | Descripción |
|---|---|
| [`guia-rxm-v1.md`](Docs/guia-rxm-v1.md) | Guía para usuarios no técnicos |
| [`developer-guide-v1.md`](Docs/developer-guide-v1.md) | Guía completa para desarrolladores |
| [`prd-v1.md`](Docs/10-specs/prd-v1.md) | Product Requirements Document |
| [`pog-v1-spec.md`](Docs/10-specs/pog-v1-spec.md) | Especificación Proof of Generation v1 |
| [`fee-flow-v1.md`](Docs/10-specs/fee-flow-v1.md) | Flujo de verificación de fee on-chain |
| [`openapi-v1.yaml`](Docs/10-specs/openapi-v1.yaml) | Especificación OpenAPI (Swagger) |
| [`error-catalog.md`](Docs/10-specs/error-catalog.md) | Catálogo de errores de la API |
| [`threat-model.md`](Docs/20-security/threat-model.md) | Threat Model STRIDE + Attack Trees |
| [`audit-report-v1.md`](Docs/audit-report-v1.md) | Informe de auditoría de código |
| [`runbook.md`](Docs/runbook.md) | Runbook de operaciones |
| [`api-examples.md`](Docs/api-examples.md) | Ejemplos curl de todos los endpoints |
| [`alpha-pilot-plan.md`](Docs/alpha-pilot-plan.md) | Plan de piloto alpha |
| [`c2pa-interoperability.md`](Docs/c2pa-interoperability.md) | Interoperabilidad con estándares C2PA |
| [`receipt-verification-spec.md`](Docs/receipt-verification-spec.md) | Especificación de verificación de receipts (v1.2) |
| [`ADR-001-tech-stack.md`](Docs/30-adr/ADR-001-tech-stack.md) | Architecture Decision Record |

---

## 🔐 Seguridad por diseño

El sistema tiene **24 invariantes** que nunca se violan:

- **INV-001**: Los records son permanentes — no se borran (DELETE → 405)
- **INV-005**: Ningún humano valida ni invalida un record
- **INV-007**: La plataforma NO custodia claves privadas
- **INV-009**: Todo PoG debe estar firmado por el agente declarado
- **INV-012**: No hay registro sin fee pagado
- **INV-022**: No hay scoring, rankings ni etiquetas de fiabilidad

### Medidas implementadas

| Medida | Implementación |
|---|---|
| Headers seguridad | `@fastify/helmet` |
| CORS | `@fastify/cors` (deshabilitado en prod) |
| Rate limiting | `@fastify/rate-limit` por IP |
| Body limit | 64KB máximo |
| Error sanitization | Nunca expone stack traces |
| Firma digital | EIP-712 (verifyTypedData) |
| Fee verification | 5 checks on-chain |
| Idempotencia | UNIQUE constraints en DB |

---

## 🗺️ Roadmap

| Versión | Estado | Alcance |
|---|---|---|
| **v1.0 (MVP)** | ✅ Completado | Registro, PoG v1, anchoring L2, API REST, fee on-chain, 63 tests, CI/CD |
| **v1.0.0-rc1** | ✅ Taggeado | Alpha testing framework, scripts adversariales, plan de piloto |
| **v1.0.0-rc2** | ✅ Taggeado | Fix rate limit 429, fee $0.01, trust model docs, guías usuario + dev |
| **v1.0.0-alpha.1** | ✅ Desplegado | Deploy en Render + Neon + Upstash + Base Sepolia. Multi-chain, Redis TLS, worker inline |
| **v1.1** | 🔲 Planificado | Batch endpoint, webhooks, doble atestación |
| **v2** | 🔲 Planificado | Verificación model_id (#15), content pointers, identidad dual, fee fiat |
| **v3** | 🔲 Planificado | Smart contracts, W3C Verifiable Credentials, marketplace doble procedencia |

### Issues abiertas

| Issue | Versión | Descripción |
|---|---|---|
| ~~[#11](https://github.com/Sebas-Solver/Res-ex-Machina/issues/11)~~ | ✅ alpha.2 | ~~`provenance_metadata` — Campo genérico de interoperabilidad~~ |
| [#12](https://github.com/Sebas-Solver/Res-ex-Machina/issues/12) | v1.1 | Batch endpoint — `POST /v1/records/batch` |
| [#13](https://github.com/Sebas-Solver/Res-ex-Machina/issues/13) | v1.1 | Webhooks de estado |
| [#14](https://github.com/Sebas-Solver/Res-ex-Machina/issues/14) | v1.1 | Doble atestación temporal |
| [#15](https://github.com/Sebas-Solver/Res-ex-Machina/issues/15) | v2+ | Investigar verificación del `model_id` declarado |
| ~~[#16](https://github.com/Sebas-Solver/Res-ex-Machina/issues/16)~~ | ✅ alpha.2 | ~~Health cache + módulos compartidos~~ |
| ~~[#17](https://github.com/Sebas-Solver/Res-ex-Machina/issues/17)~~ | ✅ alpha.2 | ~~Rate limit con Redis store~~ |
| [#19](https://github.com/Sebas-Solver/Res-ex-Machina/issues/19) | beta | Monitorización y alertas |
| ~~[#21](https://github.com/Sebas-Solver/Res-ex-Machina/issues/21)~~ | ✅ alpha.2 | ~~Listar registros por wallet (filtros avanzados)~~ |
| ~~[#22](https://github.com/Sebas-Solver/Res-ex-Machina/issues/22)~~ | ✅ alpha.2 | ~~Modo degradado / resiliencia~~ |
| [#23](https://github.com/Sebas-Solver/Res-ex-Machina/issues/23) | beta | Enriquecer datos de fee |

---

## 🤝 Filosofía del proyecto

> *"El sistema proporciona datos; la interpretación es responsabilidad del usuario."*

Res ex Machina **no emite juicios**. No dice si algo es original, bueno, legal o valioso. Es un **registro técnico**: registra declaraciones firmadas y las ancla en el tiempo.

Esto es deliberado. En un mundo donde la generación por IA es cada vez más ubicua, lo que falta no es un juez, sino un **registro neutral de hechos**.

---

## 📜 Estado actual

🟢 **v1.0.0-alpha.2-dev** — API desplegada en `https://res-ex-machina-api.onrender.com`. 125 tests en 10 suites, CI/CD. Autenticación por wallet (`GET /records/mine`). Health cache 30s con `Cache-Control`/`X-Cache`. Rate limit con Redis store. Modo degradado (resiliencia Redis/L2). `GET /v1/records` con filtros avanzados. `provenance_metadata` (C2PA/IPTC/XMP). 5 issues abiertas, 20 cerradas.

---

## 📫 Contacto

- **Autor**: [@Sebas-Solver](https://github.com/Sebas-Solver)
- **Email**: sebas.solver@gmail.com
