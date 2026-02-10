# Understanding Lock — Res ex Machina

> **Este documento es el resumen consolidado de todo el brainstorming.**
> Si lo confirmas, paso a producir los documentos de diseño (PRD v1, Spec PoG v1, Invariantes).

---

## 🔒 Qué se está construyendo

**Res ex Machina** es el primer registro neutral y automatizado donde los agentes de IA dejan trazas verificables de lo que generan, bajo su propia identidad técnica.

- Es un **registro de hechos técnicos**, no de derechos
- Es **content-agnostic**: registra la prueba de existencia y procedencia, no el contenido
- El registro **no depende de validación humana ex ante**
- La validación humana es **excepcional, no constitutiva**

---

## 👥 Para quién

| Segmento | Prioridad | Perfil |
|---|---|---|
| Developers / Builders de agentes IA | 🥇 Core | Bots y agentes que crean por su cuenta |
| Empresas / Startups con IA | 🥈 Secundario | Usan IA para generar contenido |
| Juristas / Peritos técnicos | 🎯 Táctico | Necesitan evidencia técnica verificable |
| Artistas / Creadores individuales | ⏳ No prioritario | Fase posterior |

---

## 🎯 Problemas que resuelve (orden de importancia)

1. **No existe un registro positivo** donde certificar outputs de IA
2. **Los agentes generan sin trazabilidad verificable**
3. **No hay forma estándar** de demostrar origen y condiciones
4. **Falta memoria histórica** de actividad de IAs
5. **Compliance y regulación** (importante, pero después)

---

## 💰 Modelo de negocio

- **Fee base universal** (anti-spam): siempre obligatorio, muy bajo, crypto o fiat
- **Free tier** = subsidio + límites (no gratuidad real). Cada registro paga fee base o usa credit pool inicial
- **Paid tiers** = bundles con descuento, fee reducido por registro, features adicionales, prioridad en anchoring

---

## 📦 Qué se registra

**Siempre** (campos mínimos del registro):
- `content_hash` (huella criptográfica)
- `timestamp`
- `agent_id` / wallet
- Proof of Generation bundle (PoG v1)
- `generation_process` metadata
- `human_intervention_level`
- `model` / `runtime` info
- `state`
- `on-chain anchor`

**Opcional** (con coste adicional):
- Contenido real (pointer a IPFS/S3/URL, nunca obligatorio)
- Storage = pointer + hash, pricing separado

**Nunca**:
- Editar contenido, versionar como editor, interpretar significado, evaluar calidad, curar

---

## 🔀 Diferenciación competitiva

Ninguna alternativa existente hace **todas estas cosas a la vez**:

| Diferenciador | C2PA | Timestamps | IPFS | arXiv | NFTs |
|---|---|---|---|---|---|
| Registro positivo (no detección) | ❌ | ❌ | ❌ | ✅ parcial | ❌ |
| Identidad del agente IA | ❌ | ❌ | ❌ | ❌ | ❌ |
| Metadata completa de generación | ❌ | ❌ | ❌ | ❌ | ❌ |
| Neutralidad jurídica | ❌ | ✅ | ✅ | ✅ | ❌ |
| Automatizado sin validación humana | ❌ | ✅ | ✅ | ❌ | ✅ parcial |

---

## 🚀 Roadmap

### MVP v1 (API-first, agent-safe)
- `POST /v1/records` — registrar
- `GET /v1/records/{id}` — consultar
- `GET /v1/records/verify?hash=` — verificar
- `GET /v1/records/{id}/export` — exportar receipt JSON
- Wallet auth (identidad técnica)
- PoG v1 schema + firma
- Anchor verificable (timestamp inmutable)
- Fee obligatorio
- **Sin UI rica** — solo consultas API

### v2-A: Historia y coherencia
- Versionado (`record_links`, tipos cerrados: `derived_from`, etc.)
- Estados (máquina de estados explícita con transiciones documentadas)

### v2-B: Storage opcional
- Solo tras estabilizar hashes + receipts + links
- Storage = pointer + hash, nunca obligatorio, pricing separado

### v2-C: Claims mínimos
- Claim = flag + evidencia, sin resolución ni workflow complejo

### v3+: Ecosistema
- Reputación de agentes, Smart contracts, Kleros, Compliance, SDKs, C2PA

### ❌ Out of Scope (v1) — siempre
- Detección de IA
- Scoring de originalidad
- Validación humana
- Moderación de contenido
- Análisis semántico
- "Mejoras" automáticas del output
- Copyright / IP claims

---

## ⚙️ Requisitos no funcionales (v1)

### Escala
- 100–1.000 registros/día, 5.000–50.000/mes
- Soporte batch: 100–1.000 registros por llamada
- Rate limits: 50–200 req/min por wallet (ampliable con pago)

### Disponibilidad
- SLA: 99.0% mensual
- Downtime planificado aceptable
- La API acepta registros aunque el anclaje esté en cola

### Latencia
- **Soft confirmation** (receipt inmediato): < 1–3 segundos
- **Hard confirmation** (anchored on-chain): 1–5 min típico, hasta 30–60 min aceptable

### Seguridad
- **NO custodia** de claves — usuario/agente gestiona sus claves
- Res ex Machina solo verifica firmas
- Público por defecto: hash, timestamp, wallet, estado, tx
- Privado por defecto: contenido, input/prompt
- Modos: `proof_only` (default), `input_hash_only`, `content_optional`

### Anti-abuso
- Fee por registro (siempre)
- Rate limits por wallet + IP
- Idempotencia por `bundle_hash` / `content_hash`
- Límites de tamaño por request

### Jurisdicción y hosting
- Hosting EU preferido, arquitectura portable
- Cloud tradicional en v1 (no hace falta descentralizar infra)
- Blockchain: L2 EVM compatible (fees bajos + confirmaciones rápidas)
- Infra: Cloud + Postgres + S3-compatible + colas (Redis/BullMQ)
- Docker-compose para v1, IaC después

---

## 📝 Asunciones documentadas

1. El público core sabe firmar transacciones (o tiene wrapper)
2. No se necesita custodia de claves en v1
3. L2 EVM se elegirá durante implementación (abstracción "EVM compatible")
4. El fee base se calibrará con datos reales post-lanzamiento
5. El credit pool inicial para free tier se definirá por economía del proyecto
6. La metadata de generación es configurable (para no filtrar secretos industriales)

---

## ❓ Preguntas abiertas

1. ¿Qué L2 EVM específica? (Base, Arbitrum, Polygon, Optimism...)
2. ¿Cuánto es el fee base mínimo? (¿$0.01? ¿$0.001?)
3. ¿Cuántos credits en el pool inicial del free tier?
4. ¿Dominio y marca visual? (logo, colores, etc.)
5. ¿Licencia del código? (MIT, Apache 2.0, propietaria...)

---

## 📄 Próximos documentos a producir (tras confirmación)

1. **PRD v1 "agent-proof"** — schemas, endpoints, invariantes, out-of-scope
2. **Spec técnica PoG v1** — definición formal, schema canónico, firma EIP-712
3. **Lista de invariantes del sistema** — reglas absolutas que nunca se pueden romper

---

> **¿Refleja esto correctamente tu visión de Res ex Machina?**
> Confirma o corrige lo que necesites antes de que pase a producir los documentos de diseño.
