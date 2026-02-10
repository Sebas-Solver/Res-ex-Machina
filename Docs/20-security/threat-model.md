# Threat Model — Res ex Machina v1

> **Versión**: 1.0  
> **Estado**: Draft  
> **Fecha**: 2026-02-10  
> **Metodología**: STRIDE + Attack Trees  
> **Skills utilizadas**: `threat-modeling-expert`, `stride-analysis-patterns`, `attack-tree-construction`, `api-security-best-practices`

---

## 1. Alcance del sistema

### 1.1 Descripción

Res ex Machina es un registro técnico de hechos de generación por IA. Los agentes de IA (identificados por wallet criptográfica) envían bundles probatorios (PoG) que se almacenan en Postgres y se anclan en una blockchain L2 EVM.

### 1.2 Diagrama de flujo de datos (DFD)

```
                    ┌─────────────────────────────────────────────┐
                    │              TRUST BOUNDARY 0               │
                    │              (Internet público)              │
                    │                                             │
                    │  ┌──────────────┐                           │
                    │  │  Agente IA   │ ──── Entidad externa      │
                    │  │  (wallet)    │      no confiable         │
                    │  └──────┬───────┘                           │
                    │         │                                   │
                    └─────────┼───────────────────────────────────┘
                              │
                              │ HTTPS + EIP-712 signed payload
                              │ + fee_tx_hash
                              │
                    ┌─────────┼───────────────────────────────────┐
                    │         │    TRUST BOUNDARY 1               │
                    │         ▼    (API perimetral)               │
                    │  ┌──────────────┐                           │
                    │  │  API Server  │ ──── Proceso principal    │
                    │  │  (validación)│                           │
                    │  └──┬───┬───┬──┘                           │
                    │     │   │   │                               │
                    └─────┼───┼───┼───────────────────────────────┘
                          │   │   │
              ┌───────────┘   │   └───────────┐
              │               │               │
              ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  PostgreSQL  │ │  Redis       │ │  Blockchain   │
    │  (records)   │ │  (rate limit │ │  L2 (anchor   │
    │              │ │   + queue)   │ │   + fee check)│
    └──────────────┘ └──────────────┘ └──────────────┘
      Data Store       Data Store       External Entity
      (confiable)      (confiable)      (semi-confiable)
```

### 1.3 Fronteras de confianza

| ID | Frontera | De → A | Riesgo |
|---|---|---|---|
| TB-0 | Internet → API | Agente → API Server | **ALTO**: entrada no confiable |
| TB-1 | API → Base de datos | API Server → Postgres | MEDIO: inyección, escalada |
| TB-2 | API → Blockchain L2 | API Server → RPC Node | MEDIO: disponibilidad, fiabilidad |
| TB-3 | API → Redis | API Server → Redis | BAJO: datos efímeros |

---

## 2. Activos

| Activo | Sensibilidad | Descripción |
|---|---|---|
| **Records** | CRÍTICA | Hechos de generación inmutables |
| **PoG Bundles** | ALTA | Pruebas criptográficas firmadas |
| **Firmas EIP-712** | ALTA | Identidad criptográfica del agente |
| **fee_tx_hash** | ALTA | Prueba de pago on-chain |
| **receipt_hash** | ALTA | Hash de integridad del recibo |
| **Claves privadas del servidor** | CRÍTICA | Keys para anchoring on-chain |
| **Claves RPC/API** | ALTA | Acceso al nodo L2 |
| **Metadata de registros** | MEDIA | Tags, content_type, timestamps |
| **Config del fee** | MEDIA | fee_receiver_address, monto mínimo |

---

## 3. Análisis STRIDE

### 3.1 Spoofing (Suplantación de identidad)

| ID | Amenaza | Objetivo | Impacto | Probabilidad | Riesgo |
|---|---|---|---|---|---|
| S-01 | Suplantación de wallet: firmar un PoG con una wallet que no es del agente real | PoG Bundle | ALTO | BAJO | 3 |
| S-02 | Robo de clave privada del agente y registrar en su nombre | Identidad del agente | CRÍTICO | BAJO | 4 |
| S-03 | Replay attack: reutilizar un PoG firmado legítimamente | POST /v1/records | ALTO | MEDIO | 6 |

**Mitigaciones implementadas:**
- [x] Verificación de firma EIP-712 (recovered signer == agent_wallet) → INV-009
- [x] Nonce único por wallet (UNIQUE constraint) → INV-014
- [x] No custodia de claves privadas → El agente es el único responsable

**Riesgos residuales:**
- ⚠️ S-02: Si un agente pierde su clave privada, cualquiera puede registrar en su nombre. **No es responsabilidad de la plataforma** (INV-007). La plataforma registra hechos, no garantiza control de identidad.

---

### 3.2 Tampering (Manipulación de datos)

| ID | Amenaza | Objetivo | Impacto | Probabilidad | Riesgo |
|---|---|---|---|---|---|
| T-01 | Modificar un record después de crearlo | Tabla `records` | CRÍTICO | MUY BAJO | 4 |
| T-02 | Inyección SQL a través de campos del PoG bundle (JSONB) | PostgreSQL | CRÍTICO | BAJO | 4 |
| T-03 | Manipulación del content_hash (enviar hash falso) | Integridad del hash | ALTO | ALTO | 9 |
| T-04 | Manipulación del timestamp en el PoG | Temporalidad | MEDIO | ALTO | 6 |

**Mitigaciones implementadas:**
- [x] Records inmutables — no existe UPDATE ni DELETE (INV-001, INV-002, INV-003)
- [x] CHECK constraint en content_hash (`^sha256:[a-f0-9]{64}$`)
- [x] CHECK constraint en state (solo valores permitidos)
- [x] Queries parametrizadas (requisito de implementación)
- [x] Anchoring on-chain (inmutabilidad criptográfica)

**Riesgos residuales:**
- ⚠️ T-03: La plataforma **no puede verificar que el hash corresponda a un contenido real**. Esto es by design — el sistema registra hechos declarados, no verifica contenido (INV-005, INV-006).
- ⚠️ T-04: El timestamp lo declara el agente. La plataforma añade `created_at` (hora del servidor) pero **no puede validar que el timestamp del agente sea verdadero**. Esto es explícito en PoG v1 Spec.

---

### 3.3 Repudiation (Repudio / Negación)

| ID | Amenaza | Objetivo | Impacto | Probabilidad | Riesgo |
|---|---|---|---|---|---|
| R-01 | Agente niega haber registrado un PoG | Trazabilidad | MEDIO | BAJO | 2 |
| R-02 | Plataforma niega haber recibido un registro | Confianza | ALTO | MUY BAJO | 3 |

**Mitigaciones implementadas:**
- [x] Firma EIP-712 criptográficamente vinculada al agente → no repudio por diseño
- [x] receipt_hash devuelto al agente como prueba de recepción
- [x] Anchoring on-chain → registro inmutable y verificable por terceros
- [x] Logs de auditoría (requisito de implementación)

**Riesgos residuales:**
- ✅ Riesgo mínimo. La firma criptográfica y el anchoring on-chain hacen que el repudio sea prácticamente imposible.

---

### 3.4 Information Disclosure (Divulgación de información)

| ID | Amenaza | Objetivo | Impacto | Probabilidad | Riesgo |
|---|---|---|---|---|---|
| I-01 | Enumerar registros de una wallet específica | Privacidad de agentes | MEDIO | MEDIO | 4 |
| I-02 | Fugas en mensajes de error (stack traces, rutas internas) | Info del sistema | BAJO | MEDIO | 2 |
| I-03 | Exposición de la clave privada del servidor de anchoring | Claves del sistema | CRÍTICO | BAJO | 4 |

**Mitigaciones implementadas:**
- [x] No existe endpoint de listado por wallet en v1 (INV-021)
- [x] Prohibido scoring/rankings/conclusiones automáticas (INV-022, INV-023, INV-024)
- [x] Mensajes de error genéricos (requisito de implementación)
- [x] Secrets management para claves (requisito de deployment)

**Riesgos residuales:**
- ⚠️ I-01: Los records individuales **son públicos por diseño** (GET por hash o por ID). Un atacante persistente podría intentar enumerar UUIDs (v7 es time-ordered). Mitigación: rate limiting en GET.
- ⚠️ I-03: Compromiso de la clave de anchoring permitiría crear transacciones fraudulentas. Mitigación: HSM o vault en producción + rotación de claves.

---

### 3.5 Denial of Service (Denegación de servicio)

| ID | Amenaza | Objetivo | Impacto | Probabilidad | Riesgo |
|---|---|---|---|---|---|
| D-01 | Spam masivo de registros con fees mínimos | API + DB + Chain | ALTO | MEDIO | 6 |
| D-02 | Agotamiento de recursos de la blockchain (gas wars) | Anchoring | ALTO | BAJO | 3 |
| D-03 | Flood de requests GET (sin autenticación) | API Server | MEDIO | ALTO | 6 |
| D-04 | Payload oversized en pog_bundle (JSONB muy grande) | API + DB | MEDIO | MEDIO | 4 |

**Mitigaciones implementadas:**
- [x] Fee obligatorio por registro → coste económico del spam (INV-012)
- [x] Rate limiting por wallet (429 Too Many Requests)
- [x] Idempotencia por content_hash (409 en duplicados)
- [x] Nonce único (409 en replay)

**Mitigaciones adicionales recomendadas (implementación):**
- [ ] **Rate limiting en GET** por IP (no requiere wallet)
- [ ] **Límite de tamaño** del pog_bundle (ej. max 16KB)
- [ ] **Límite de tags** ya definido (max 10) pero falta enforcement
- [ ] **WAF/Cloudflare** como primera línea de defensa
- [ ] **Queue sizing** para anchoring (bounded queue, backpressure)

---

### 3.6 Elevation of Privilege (Escalada de privilegios)

| ID | Amenaza | Objetivo | Impacto | Probabilidad | Riesgo |
|---|---|---|---|---|---|
| E-01 | Acceso admin a operaciones de anchoring | Anchor worker | CRÍTICO | BAJO | 4 |
| E-02 | Manipulación de fee_receiver_address | Configuración del fee | CRÍTICO | MUY BAJO | 4 |
| E-03 | Acceso a la base de datos directamente (bypass API) | PostgreSQL | CRÍTICO | BAJO | 4 |

**Mitigaciones implementadas:**
- [x] No existen roles de usuario en v1 — toda wallet es equivalente (INV-007)
- [x] No existen endpoints de admin expuestos en la API pública

**Mitigaciones adicionales recomendadas (implementación):**
- [ ] **Network isolation** — DB solo accesible desde API server
- [ ] **Principio de least privilege** — DB user de la API con permisos mínimos
- [ ] **Separación de claves** — clave de anchoring != clave de API
- [ ] **Audit log** de cambios de configuración

---

## 4. Attack Trees (amenazas críticas)

### 4.1 🌳 Registrar un PoG fraudulento

```
ROOT: Registrar PoG fraudulento (contenido que no generé)
├── [OR] Obtener firma válida
│   ├── [AND] Robar clave privada del agente víctima
│   │   ├── Phishing (social engineering)        [Coste: BAJO, Detección: MEDIA]
│   │   ├── Compromiso del servidor del agente   [Coste: ALTO, Detección: MEDIA]
│   │   └── Malware en entorno de ejecución      [Coste: MEDIO, Detección: BAJA]
│   └── [AND] Generar firma propia (wallet nueva)
│       └── Firmar PoG con wallet propia ← SIEMPRE POSIBLE
│           └── ⚠️ Riesgo aceptado: la plataforma NO verifica autoría,
│               solo registra la declaración del agente
│
├── [OR] Reutilizar PoG legítimo
│   ├── Replay con mismo nonce → BLOQUEADO (UNIQUE constraint)
│   └── Modificar nonce y re-firmar → Requiere clave privada original
│
└── [OR] Manipular datos post-registro
    ├── UPDATE en DB → BLOQUEADO (no existe UPDATE, INV-002)
    ├── DELETE en DB → BLOQUEADO (no existe DELETE, INV-001)
    └── Alterar anchoring → BLOQUEADO (blockchain inmutable)
```

**Conclusión**: La única vía posible es firmar con wallet propia un contenido que no generaste. Esto **no es un bug, es el diseño**: la plataforma registra declaraciones, no verifica generación real.

---

### 4.2 🌳 Hacer spam económicamente viable

```
ROOT: Llenar la DB con registros basura sin coste significativo
├── [OR] Evitar el fee
│   ├── POST sin fee_tx_hash → BLOQUEADO (402 fee_not_verified)
│   ├── fee_tx_hash falso → BLOQUEADO (verificación on-chain)
│   └── Reutilizar fee_tx_hash → BLOQUEADO (UNIQUE constraint)
│
├── [OR] Fee muy barato → enviar miles
│   └── El fee mínimo DEBE calibrarse para que el coste de spam
│       supere el beneficio. Si fee = $0.001 y envío 1M registros:
│       → Coste: $1.000 + gas fees
│       → ¿Beneficio del atacante? Ninguno directo.
│       → ⚠️ Riesgo: contaminación de la DB con datos basura.
│       → Mitigación: rate limit por wallet + fee calibrado
│
└── [OR] DDoS en endpoints GET (sin fee)
    ├── Flood de GET /v1/records/{id} → Rate limit por IP
    ├── Flood de GET /v1/records/verify → Rate limit por IP
    └── ⚠️ Mitigación: WAF + CDN + response caching
```

---

### 4.3 🌳 Comprometer la integridad del anchoring

```
ROOT: Crear anclas fraudulentas en la blockchain
├── [OR] Obtener la clave privada del anchor worker
│   ├── Acceso al servidor → MITIGACIÓN: hardened infra + vault
│   ├── Leak de variables de entorno → MITIGACIÓN: secrets management
│   └── Insider attack → MITIGACIÓN: multi-sig para anchoring (v2+)
│
├── [OR] Manipular el RPC node
│   ├── MITM en la conexión API → RPC node → MITIGACIÓN: TLS + trusted RPC
│   ├── RPC node comprometido → MITIGACIÓN: múltiples proveedores (failover)
│   └── Censura selectiva de transacciones → BAJO riesgo en L2 descentralizadas
│
└── [OR] Reorg attack en la L2
    └── 51% attack → EXTREMADAMENTE BAJO en L2 con finality rápida
        (protegida por la seguridad de L1)
```

---

## 5. Matriz de riesgo priorizada

```
                    IMPACTO
            Bajo   Medio   Alto   Crítico
           ┌──────┬──────┬──────┬──────┐
  Bajo     │      │ R-01 │ S-01 │ S-02 │
           │      │  (2) │  (3) │  (4) │
           ├──────┼──────┼──────┼──────┤
  Medio    │ I-02 │ I-01 │ S-03 │      │
PROB.      │  (2) │  (4) │ D-01 │      │
           │      │      │  (6) │      │
           ├──────┼──────┼──────┼──────┤
  Alto     │      │ D-04 │ D-03 │ T-03 │
           │      │  (4) │  (6) │  (9) │
           ├──────┼──────┼──────┼──────┤
  Crítico  │      │      │      │      │
           │      │      │      │      │
           └──────┴──────┴──────┴──────┘
```

### Top 5 riesgos

| Rank | ID | Amenaza | Score | Estado |
|---|---|---|---|---|
| 1 | **T-03** | Hash falso (contenido inexistente) | 9 | **Aceptado** (by design) |
| 2 | **S-03** | Replay attack | 6 | **Mitigado** (nonce UNIQUE) |
| 3 | **D-01** | Spam con fees mínimos | 6 | **Parcialmente mitigado** |
| 4 | **D-03** | DDoS en endpoints GET | 6 | **Pendiente** (rate limit IP) |
| 5 | **T-04** | Timestamp manipulado | 6 | **Aceptado** (by design) |

---

## 6. Decisiones de seguridad

### Riesgos ACEPTADOS (by design)

Estos riesgos son consecuencia directa de los principios fundacionales:

| Riesgo | Por qué se acepta |
|---|---|
| Hash de contenido inexistente | La plataforma es **content-agnostic** (INV-005). No verifica contenido. |
| Timestamp declarado falso | La plataforma registra **declaraciones**, no hechos verificables. `created_at` del servidor es el ancla real. |
| Wallet robada usada para registrar | La plataforma **no custodia claves** (INV-007). La seguridad de la wallet es responsabilidad del agente. |

### Riesgos MITIGADOS

| Riesgo | Mitigación |
|---|---|
| Replay attack | Nonce UNIQUE por wallet |
| Suplantación de wallet | Verificación EIP-712 |
| Modificación post-registro | Inmutabilidad + anchoring |
| Spam | Fee on-chain + rate limit + idempotencia |
| Repudio | Firma criptográfica + receipt_hash + anchor on-chain |

### Riesgos PENDIENTES de implementación

| Riesgo | Mitigación recomendada | Prioridad |
|---|---|---|
| DDoS en GET endpoints | Rate limit por IP | **ALTA** |
| Payload oversized | Límite de tamaño pog_bundle (16KB) | MEDIA |
| Clave de anchoring comprometida | HSM / Vault / Multi-sig | MEDIA |
| Enumeración de UUIDs | Rate limit en GET + monitoring | BAJA |
| DB accesible directamente | Network isolation + least privilege | **ALTA** |

---

## 7. Recomendaciones de implementación

### Inmediatas (antes de producción)

1. **Rate limiting por IP** en todos los endpoints GET
2. **Límite de tamaño** del cuerpo de request (ej. 64KB max total, 16KB max pog_bundle)
3. **TLS 1.3** obligatorio en todas las conexiones
4. **Sanitización de errores** — nunca devolver stack traces ni rutas internas
5. **Network isolation** — PostgreSQL y Redis solo accesibles desde API

### Corto plazo (30 días post-launch)

1. **WAF** con reglas OWASP
2. **Secrets management** (Vault o equivalente) para claves de anchoring y RPC
3. **Audit logging** centralizado e inmutable
4. **Monitoring de anomalías** — picos de registros, wallets sospechosas

### Largo plazo (v2+)

1. **Multi-sig para anchoring** — require 2/3 firmas para anclar
2. **Múltiples RPC providers** — failover automático
3. **Bug bounty program** — incentivos para reportar vulnerabilidades
4. **Penetration testing** periódico

---

## 8. Inventario de invariantes de seguridad

| Invariante | Categoría STRIDE | Amenaza que mitiga |
|---|---|---|
| INV-001 (records_are_permanent) | Tampering | T-01 |
| INV-002 (no_update_fields) | Tampering | T-01 |
| INV-003 (no_delete_records) | Tampering | T-01 |
| INV-007 (no_custody) | Spoofing | S-02 (responsabilidad del agente) |
| INV-009 (pog_must_be_signed) | Spoofing | S-01 |
| INV-012 (fee_always_required) | DoS | D-01 |
| INV-014 (nonce_uniqueness) | Spoofing | S-03 |
| INV-019 (anchor_failed_valid) | Tampering | Integridad del record |
| INV-020 (fee_must_be_onchain) | DoS | D-01 |
| INV-021 (no_public_listing) | Info Disclosure | I-01 |
| INV-022 (no_scoring) | Info Disclosure | I-01 |
