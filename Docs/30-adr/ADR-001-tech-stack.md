# ADR-001: Stack técnico v1

> **Estado**: Aprobado  
> **Fecha**: 2026-02-10  
> **Contexto**: Decisiones de implementación para el MVP v1  

---

## Decisión

| Capa | Tecnología | Versión mínima |
|---|---|---|
| Lenguaje | TypeScript | 5.x |
| Runtime | Node.js | 22 LTS |
| Framework API | Fastify | 5.x |
| ORM | Drizzle ORM | 0.38+ |
| Base de datos | PostgreSQL | 16 |
| Cola de tareas | BullMQ | 5.x |
| Cache / Queue backend | Redis | 7.x |
| Crypto / Blockchain | viem | 2.x |
| UUID | uuidv7 (paquete npm) | — |
| Testing | Vitest | 3.x |
| Contenedores | Docker Compose | — |
| Validación | Zod + JSON Schema (Fastify) | — |

---

## Justificación

### TypeScript + Node.js
- El ecosistema Ethereum (firmas EIP-712, RPC) es nativo en JS/TS.
- BullMQ es una librería Node.js.
- TypeScript añade seguridad de tipos, crítica para integridad de datos.

### Fastify (no Express, no NestJS)
- Validación integrada con JSON Schema (reutiliza nuestro OpenAPI spec).
- Mejor rendimiento que Express.
- Más ligero que NestJS para un MVP.

### Drizzle ORM (no Prisma, no raw SQL)
- Cerca de SQL real: permite definir CHECK constraints y UNIQUEs complejos.
- Type-safe con TypeScript.
- Migraciones automáticas.
- Más ligero que Prisma.

### viem (no ethers.js)
- Soporte nativo de primera clase para EIP-712.
- Diseñado para TypeScript desde cero.
- API moderna y ligera.

### Validación dual: Zod + JSON Schema
- **Zod**: validación programática en lógica de negocio (content_hash format, PoG schema).
- **JSON Schema (Fastify built-in)**: validación automática de payloads HTTP a nivel de framework.
- Ambos son complementarios y cubren capas distintas.

---

## Matices obligatorios (aprobados por el fundador)

### 1. UUID v7 generado en aplicación
```
- SÍ: import { uuidv7 } from 'uuidv7'; → record_id = uuidv7()
- NO: gen_random_uuid() en PostgreSQL
- Razón: time-ordered, controlado por app, sin dependencia de DB
```

### 2. BullMQ con retries/backoff + anchor_failed
```yaml
anchor_worker:
  retries: 3
  backoff:
    type: exponential
    delay: 5000       # 5s → 10s → 20s
  on_max_retries:
    state: anchor_failed
    anchor_error_reason: "max retries exceeded"
  idempotent: true    # re-procesar un job no duplica tx
```
- El worker debe ser **idempotente**: si re-procesa un job, verifica primero si la tx ya fue enviada.
- Un record con `anchor_failed` sigue siendo válido (INV-019).

### 3. Validación estricta de payloads
```
Capa 1 (Fastify):  JSON Schema automático → rechaza payloads malformados
Capa 2 (Zod):      Validación de negocio → content_hash regex, PoG schema
Capa 3 (DB):       CHECK constraints → última línea de defensa
```
- Ningún dato inválido llega a la base de datos.

---

## Estructura de carpetas prevista

```
src/
├── config/           # Variables de entorno, constants
├── db/
│   ├── schema.ts     # Drizzle schema (tabla records)
│   └── migrations/   # Migraciones SQL generadas
├── routes/
│   ├── health.ts     # GET /v1/health
│   ├── records.ts    # POST + GET /v1/records
│   └── schemas/      # JSON Schemas para Fastify
├── services/
│   ├── signature.ts  # Verificación EIP-712 (viem)
│   ├── fee.ts        # Verificación fee on-chain
│   ├── receipt.ts    # Cálculo de receipt_hash
│   └── anchor.ts     # Lógica de anchoring
├── workers/
│   └── anchor.worker.ts  # BullMQ worker
├── middleware/
│   └── rateLimit.ts  # Rate limiting
├── utils/
│   └── uuid.ts       # UUID v7 generation
└── app.ts            # Entry point Fastify
```

---

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Python / FastAPI | Ecosistema crypto menos maduro, BullMQ no disponible |
| Express | Sin validación integrada, más lento |
| NestJS | Demasiado pesado para MVP |
| Prisma | Difícil definir CHECK constraints complejos |
| ethers.js | API menos moderna, peor soporte EIP-712 nativo |
| gen_random_uuid() | No es time-ordered, no controlado por app |
