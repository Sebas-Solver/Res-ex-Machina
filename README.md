<p align="center">
  <strong>⚖️ RES EX MACHINA</strong><br/>
  <em>El primer registro neutral y automatizado donde los agentes de IA<br/>dejan huella verificable de sus creaciones</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/estado-diseño-blue" alt="Estado: Diseño"/>
  <img src="https://img.shields.io/badge/versión-v1.1--draft-orange" alt="Versión: v1.1 draft"/>
  <img src="https://img.shields.io/badge/licencia-TBD-lightgrey" alt="Licencia: TBD"/>
</p>

---

## 🧬 ¿Qué es Res ex Machina?

**Res ex Machina** es una plataforma de **registro técnico de hechos de generación por IA**. No juzga, no valida, no modera. Solo registra y ancla criptográficamente.

Cuando un agente de IA genera un output (texto, imagen, código, audio...), puede registrar ese hecho en Res ex Machina con un **Proof of Generation (PoG)** firmado. El sistema:

1. ✅ Verifica la firma criptográfica del agente
2. ✅ Registra el hecho con timestamp inmutable
3. ✅ Ancla el registro en una blockchain L2 EVM
4. ✅ Devuelve un receipt verificable por terceros

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

## 🛠️ Arquitectura (v1 MVP)

```
Agente IA ──────────── API REST ──────────── PostgreSQL
  (wallet)    EIP-712     │                    (records)
                          │
                     Redis (queue)
                          │
                     Blockchain L2
                      (anchoring)
```

### Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/v1/health` | — | Estado del sistema |
| `POST` | `/v1/records` | Wallet (EIP-712) | Registrar un hecho de generación |
| `GET` | `/v1/records/{id}` | — | Consultar por ID |
| `GET` | `/v1/records/verify?content_hash=` | — | Verificar por hash |
| `GET` | `/v1/records/{id}/export` | — | Exportar receipt verificable |

### Anti-abuso
- **Fee on-chain** obligatorio en token nativo L2 (micro-pago)
- **Rate limiting** por wallet
- **Idempotencia** por content_hash
- **Nonce único** por wallet (anti-replay)

---

## 📁 Documentación

| Documento | Descripción |
|---|---|
| [`prd-v1.md`](Docs/10-specs/prd-v1.md) | Product Requirements Document (v1.1) |
| [`pog-v1-spec.md`](Docs/10-specs/pog-v1-spec.md) | Especificación Proof of Generation v1 |
| [`fee-flow-v1.md`](Docs/10-specs/fee-flow-v1.md) | Flujo de verificación de fee on-chain |
| [`openapi-v1.yaml`](Docs/10-specs/openapi-v1.yaml) | OpenAPI 3.1 Spec |
| [`error-catalog.md`](Docs/10-specs/error-catalog.md) | Catálogo de errores de la API |
| [`invariants.yml`](Docs/00-foundation/invariants.yml) | 24 invariantes del sistema |
| [`threat-model.md`](Docs/20-security/threat-model.md) | Threat Model STRIDE + Attack Trees |

---

## 🔐 Seguridad por diseño

El sistema tiene **24 invariantes** que nunca se violan:

- **INV-001**: Los records son permanentes — no se borran
- **INV-005**: Ningún humano valida ni invalida un record
- **INV-007**: La plataforma NO custodia claves privadas
- **INV-009**: Todo PoG debe estar firmado por el agente declarado
- **INV-012**: No hay registro sin fee pagado
- **INV-022**: No hay scoring, rankings ni etiquetas de fiabilidad

> Ver lista completa en [`invariants.yml`](Docs/00-foundation/invariants.yml)

---

## 🗺️ Roadmap

| Versión | Alcance |
|---|---|
| **v1 (MVP)** | Registro básico, PoG v1, anchoring L2, API REST, fee on-chain |
| **v1.1** | Batch endpoint, webhooks de estado |
| **v2** | Content pointers, record versioning, fee fiat + créditos |
| **v3** | Smart contracts, reputación (datos, no juicios), marketplace |

---

## 🤝 Filosofía del proyecto

> *"El sistema proporciona datos; la interpretación es responsabilidad del usuario."*

Res ex Machina **no emite juicios**. No dice si algo es original, bueno, legal o valioso. Es un **notario técnico**: registra declaraciones firmadas y las ancla en el tiempo.

Esto es deliberado. En un mundo donde la generación por IA es cada vez más ubicua, lo que falta no es un juez, sino un **registro neutral de hechos**.

---

## 📜 Estado actual

🟡 **En fase de diseño** — La documentación técnica está completa. La implementación aún no ha comenzado.

---

## 📫 Contacto

- **Autor**: [@Sebas-Solver](https://github.com/Sebas-Solver)
- **Email**: sebas.solver@gmail.com
