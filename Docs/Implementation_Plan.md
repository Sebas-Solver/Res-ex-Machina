# Understanding Lock — Res ex Machina

> ✅ **ESTADO: MVP v1.0 COMPLETADO** (10 Feb 2026)
> Todas las decisiones de este documento fueron implementadas. Ver [CHANGELOG.md](../CHANGELOG.md) para detalles.
>
> Este documento se conserva como referencia histórica del brainstorming original.

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

> **Nota (Feb 2026):** C2PA ya no se considera competidor sino **complementario**.
> RxM es registro externo inmutable; C2PA es credencial embebida en el archivo.
> Ver `Docs/c2pa-interoperability.md` para el diseño del puente.

| Diferenciador | C2PA | Timestamps | IPFS | arXiv | NFTs | RxM |
|---|---|---|---|---|---|---|
| Registro positivo (no detección) | ❌ | ❌ | ❌ | ✅ parcial | ❌ | ✅ |
| Identidad técnica del agente IA | ❌ (org cert) | ❌ | ❌ | ❌ | ❌ | ✅ (wallet) |
| Metadata completa de generación | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (PoG) |
| Neutralidad jurídica | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Automatizado sin validación humana | ❌ | ✅ | ✅ | ❌ | ✅ parcial | ✅ |
| Independiente del archivo | ❌ (embebido) | ✅ | ❌ | ✅ | ❌ | ✅ |
| Interoperable con estándares embebidos | — | ❌ | ❌ | ❌ | ❌ | ✅ (v1.1) |

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

### v1.1: Interoperabilidad + Calidad
- `provenance_metadata` genérico (C2PA, IPTC, XMP, Schema.org, custom)
- Batch endpoint
- Webhooks de estado
- Doble atestación temporal (PKI + blockchain)

### v2-A: Historia y coherencia
- Versionado (`record_links`, tipos cerrados: `derived_from`, etc.)
- Estados (máquina de estados explícita con transiciones documentadas)
- Identidad dual: organizacional (cert X.509) + técnica (wallet)

### v2-B: Storage opcional
- Solo tras estabilizar hashes + receipts + links
- Storage = pointer + hash, nunca obligatorio, pricing separado

### v2-C: Claims mínimos
- Claim = flag + evidencia, sin resolución ni workflow complejo

### v3+: Ecosistema
- W3C Verifiable Credentials (receipts como VCs)
- Reputación de agentes (datos, no juicios), Smart contracts, Kleros, Compliance, SDKs

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
Decisión v1
Polygon PoS como implementación inicial, con abstracción obligatoria de la capa de anchoring.

Por qué
- Fees muy bajos (clave para fee always-on).
- Tooling y estabilidad probados.
- Indexación y exploradores maduros.
- Suficiente seguridad para hashes + timestamps (no custodia de valor).
```Yaml
anchoring:
  abstraction_required: true
  initial_chain: polygon_pos
  constraints:
    - evm_compatible
    - low_fees
    - public_explorer
```
Esto permite migrar a zkEVM / Arbitrum / Base sin refactor.


2. ¿Cuánto es el fee base mínimo? (¿$0.01? ¿$0.001?)
Decisión v1
$0.01 por registro (1 centavo de dólar), ajustable por config.

Por qué
- Suficientemente bajo para no frenar adopción.
- Suficientemente alto para desincentivar spam.
- Funciona bien con L2 baratas.
- Encaja con “sello notarial simbólico”.

Regla
- Fee siempre (no existe registro a coste cero).
- Visible en el receipt (aunque esté subvencionado).


3. ¿Cuántos credits en el pool inicial del free tier?
¿Cuántos credits en el pool inicial del free tier?
✅ Decisión v1

100 credits por wallet (subvencionados), no recargables automáticamente.

Por qué
- Permite probar integraciones reales.
- Evita farming infinito de wallets.
- Suficiente para POCs y tests.

Matiz importante
- Cada credit = cubre el fee base.
- El usuario ve el coste, aunque esté cubierto.
```Yaml 
free_tier:
  initial_credits: 100
  refill: false
```


4. ¿Dominio y marca visual? (logo, colores, etc.)
Decisión v1
- Marca: Res ex Machina (cerrada).

Dominio:
- Principal: resexmachina.io (si está disponible)
- Alternativa: resexmachina.xyz o rexm.io

Visual v1 (muy importante: sobriedad)
- Colores: monocromo + acento (negro/blanco/gris + azul o ámbar)
- Logo: tipográfico simple (wordmark), sin icono complejo
- Estilo: técnico, notarial, infra — no “AI flashy”

No inviertas tiempo en branding complejo en v1.
La credibilidad viene del registro, no del diseño.


5. ¿Licencia del código? (MIT, Apache 2.0, propietaria...)
Decisión recomendada
Apache 2.0 para el core no-infra (API, schemas, SDKs).

Por qué Apache 2.0
- Permite uso comercial.
- Incluye grant de patentes (importante para infra).
- Bien vista por empresas e instituciones.
- Compatible con “open protocol + managed service”.

Qué NO abrir (por ahora)
- Infra de producción (deploys, claves, config).
- Servicios managed.
- Runbooks internos sensibles.

```Yaml
license:
  core: Apache-2.0
  infra: proprietary
```

---

## 📄 Documentos producidos

1. ✅ **PRD v1** — [`prd-v1.md`](10-specs/prd-v1.md)
2. ✅ **Spec técnica PoG v1** — [`pog-v1-spec.md`](10-specs/pog-v1-spec.md)
3. ✅ **Fee flow v1** — [`fee-flow-v1.md`](10-specs/fee-flow-v1.md)
4. ✅ **Error catalog** — [`error-catalog.md`](10-specs/error-catalog.md)
5. ✅ **Threat model** — [`threat-model.md`](20-security/threat-model.md)
6. ✅ **ADR-001 Tech Stack** — [`ADR-001-tech-stack.md`](30-adr/ADR-001-tech-stack.md)

---

> Todas las decisiones documentadas aquí fueron implementadas en el MVP v1.0.
> Ver [CHANGELOG.md](../CHANGELOG.md) para la lista completa de cambios.
