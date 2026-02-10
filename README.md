<p align="center">
  <strong>⚖️ RES EX MACHINA</strong><br/>
  <em>El primer registro neutral y automatizado donde los agentes de IA<br/>dejan huella verificable de sus creaciones</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/estado-MVP%20completado-brightgreen" alt="Estado: MVP completado"/>
  <img src="https://img.shields.io/badge/versión-v1.0.0-blue" alt="Versión: v1.0.0"/>
  <img src="https://img.shields.io/badge/tests-63%20passing-brightgreen" alt="Tests: 63 passing"/>
  <img src="https://img.shields.io/badge/CI-GitHub%20Actions-success" alt="CI: GitHub Actions"/>
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
| Blockchain | viem + L2 EVM (Polygon PoS) |
| Firma | EIP-712 (verifyTypedData) |
| Tests | Vitest (63 tests) |
| CI/CD | GitHub Actions |
| Seguridad | Helmet, CORS, Rate Limit |

### Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/v1/health` | — | Estado del sistema (DB, Redis, L2) |
| `POST` | `/v1/records` | Wallet (EIP-712) | Registrar un hecho de generación |
| `GET` | `/v1/records/{id}` | — | Consultar por ID |
| `GET` | `/v1/records/verify?content_hash=` | — | Verificar por hash |
| `GET` | `/v1/records/{id}/export` | — | Exportar receipt verificable |
| `DELETE` | `/v1/records/{id}` | — | 405 Method Not Allowed (INV-001) |

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
63 tests en 6 suites — todos passing ✅

 ✓ errors.test.ts       (9)   — ApiError + factories
 ✓ receipt.test.ts      (4)   — SHA-256 receipt hash
 ✓ schemas.test.ts      (14)  — Validación Zod
 ✓ fee.test.ts          (9)   — Fee on-chain (5 checks)
 ✓ records-get.test.ts  (13)  — GET /:id, /verify, /export
 ✓ invariants.test.ts   (14)  — Invariantes del sistema
```

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
| `npm test` | Ejecutar 63 tests |
| `npm run build` | Build de producción |
| `npm run db:push` | Aplicar migraciones |
| `npm run db:generate` | Generar migraciones |
| `npm run worker:anchor` | Worker de anchoring BullMQ |

---

## 📁 Estructura del proyecto

```
src/
├── app.ts                    # Entry point Fastify
├── config/
│   └── env.ts                # Variables de entorno (Zod)
├── db/
│   ├── index.ts              # Conexión Drizzle
│   └── schema.ts             # Modelo records
├── middleware/
│   └── rateLimit.ts          # Rate limiting por IP
├── routes/
│   ├── health.ts             # GET /v1/health
│   ├── records.ts            # POST + GET /v1/records
│   └── schemas/
│       └── index.ts          # Validación Zod
├── services/
│   ├── anchor.ts             # Anchoring on-chain
│   ├── fee.ts                # Verificación fee (5 checks)
│   ├── queue.ts              # BullMQ job queue
│   ├── receipt.ts            # SHA-256 receipt hash
│   └── signature.ts          # EIP-712 verification
├── utils/
│   ├── errors.ts             # ApiError + factories
│   └── uuid.ts               # UUID v7
└── workers/
    └── anchor.worker.ts      # Worker BullMQ
tests/
├── errors.test.ts
├── fee.test.ts
├── invariants.test.ts
├── receipt.test.ts
├── records-get.test.ts
└── schemas.test.ts
Docs/
├── 10-specs/                 # Especificaciones técnicas
├── 20-security/              # Threat model
└── 30-adr/                   # Architecture Decision Records
```

---

## 📁 Documentación

| Documento | Descripción |
|---|---|
| [`prd-v1.md`](Docs/10-specs/prd-v1.md) | Product Requirements Document (v1.1) |
| [`pog-v1-spec.md`](Docs/10-specs/pog-v1-spec.md) | Especificación Proof of Generation v1 |
| [`fee-flow-v1.md`](Docs/10-specs/fee-flow-v1.md) | Flujo de verificación de fee on-chain |
| [`error-catalog.md`](Docs/10-specs/error-catalog.md) | Catálogo de errores de la API |
| [`threat-model.md`](Docs/20-security/threat-model.md) | Threat Model STRIDE + Attack Trees |
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
| **v1.1** | 🔲 Planificado | Batch endpoint, webhooks de estado |
| **v2** | 🔲 Planificado | Content pointers, record versioning, fee fiat + créditos |
| **v3** | 🔲 Planificado | Smart contracts, reputación (datos, no juicios), marketplace |

---

## 🤝 Filosofía del proyecto

> *"El sistema proporciona datos; la interpretación es responsabilidad del usuario."*

Res ex Machina **no emite juicios**. No dice si algo es original, bueno, legal o valioso. Es un **notario técnico**: registra declaraciones firmadas y las ancla en el tiempo.

Esto es deliberado. En un mundo donde la generación por IA es cada vez más ubicua, lo que falta no es un juez, sino un **registro neutral de hechos**.

---

## 📜 Estado actual

🟢 **MVP v1.0 completado** — API funcional con 63 tests, CI/CD en GitHub Actions, 9 issues cerradas.

---

## 📫 Contacto

- **Autor**: [@Sebas-Solver](https://github.com/Sebas-Solver)
- **Email**: sebas.solver@gmail.com
