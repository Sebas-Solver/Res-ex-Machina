# Posicionamiento: Res ex Machina ↔ C2PA

> **Versión**: v1.0 (febrero 2026)
> **Estado**: Propuesta para v1.1

---

## Tesis

C2PA y Res ex Machina operan en **capas distintas y complementarias** del stack de procedencia:

```
┌─────────────────────────────────────────┐
│           CONTENIDO DIGITAL             │
│  ┌───────────────────────────────────┐  │
│  │  C2PA: Content Credentials       │  │
│  │  - Manifiesto embebido (JUMBF)   │  │
│  │  - Hard binding (SHA-256 bytes)   │  │
│  │  - Soft binding (fingerprint)    │  │
│  │  - Certificado X.509             │  │
│  └───────────────────────────────────┘  │
│  El archivo "lleva" su procedencia      │
└────────────────────┬────────────────────┘
                     │
                     │  complementario
                     │
┌────────────────────▼────────────────────┐
│        REGISTRO EXTERNO (RxM)           │
│  - PoG firmada (EIP-712)                │
│  - Receipt anclado on-chain             │
│  - Registro permanente e independiente  │
│  - Verificable sin el archivo original  │
└─────────────────────────────────────────┘
```

## ¿Por qué son complementarios?

| Escenario | C2PA solo | RxM solo | C2PA + RxM |
|---|---|---|---|
| Archivo original intacto | ✅ | ✅ | ✅✅ |
| Metadatos stripeados por plataforma | ❌ | ✅ | ✅ |
| Captura de pantalla | 🟡 (soft binding) | ✅ | ✅✅ |
| Archivo desaparece | ❌ | ✅ | ✅ |
| Verificación programática | ✅ | ✅ | ✅✅ |
| "¿Quién lo generó?" (wallet técnica) | ❌ (org cert) | ✅ | ✅ |
| "¿Se pidió no entrenar?" | ✅ (assertion) | ✅ (metadato) | ✅✅ |

## Lo que RxM NO hace (y no debe hacer)

- ❌ Watermarking / fingerprinting (soft bindings)
- ❌ Embeber manifiestos en archivos (hard bindings JUMBF)
- ❌ Firmar con certificados X.509
- ❌ Detectar manipulación de bytes del archivo
- ❌ Decidir si un contenido es "auténtico"

Estas son competencias de C2PA. RxM las respeta sin duplicarlas.

## Lo que RxM SÍ aporta que C2PA no cubre

- ✅ Registro **permanente e inmutable** independiente del archivo
- ✅ Anclaje on-chain con timestamp blockchain (no solo PKI timestamp)
- ✅ Identidad técnica de agentes IA por wallet (vs. certificados org)
- ✅ Idempotencia y anti-replay (nonce + content_hash)
- ✅ Neutralidad jurídica radical (no promete derechos)
- ✅ Prueba que sobrevive a la pérdida total del archivo

---

## Diseño del puente C2PA (v1.1)

### Campo opcional en el schema del record

```typescript
// Dentro de createRecordSchema (Zod)
c2pa_metadata: z.object({
    manifest_hash: z.string()
        .regex(/^sha256:[a-f0-9]{64}$/)
        .describe('SHA-256 del manifiesto C2PA del asset'),
    claim_generator: z.string().max(256).optional()
        .describe('Identificador del software que generó el claim C2PA'),
    issuer: z.string().max(256).optional()
        .describe('CN del certificado X.509 del firmante C2PA'),
    assertions: z.array(z.string().max(128)).max(20).optional()
        .describe('Etiquetas de assertions C2PA relevantes, ej: "c2pa.do_not_train"'),
}).optional()
```

### Lo que NO se guarda

- ❌ El manifiesto completo (puede ser grande, >100KB)
- ❌ El contenido del asset
- ❌ El certificado X.509 completo
- ❌ Copia de los bytes vinculados

### Lo que SÍ se guarda

- ✅ Hash del manifiesto (para vincular)
- ✅ Quién lo firmó (issuer)
- ✅ Qué assertions relevantes contiene (ej. "do_not_train")
- ✅ Todo como metadato opcional, no como core del PoG

### Flujo

```
1. Agente genera contenido
2. Agente (o toolchain) crea Content Credentials (C2PA SDK)
3. Agente calcula hash del manifiesto C2PA
4. Agente envía POST /v1/records con:
   - pog_bundle (firma EIP-712)
   - c2pa_metadata.manifest_hash (opcional)
   - c2pa_metadata.assertions: ["c2pa.do_not_train"] (opcional)
5. RxM ancla receipt on-chain
6. Resultado: el asset tiene C2PA embebido + registro RxM externo
```

### Impacto en DB

```sql
-- Columna JSON opcional en records
ALTER TABLE records ADD COLUMN c2pa_metadata JSONB;
```

### Impacto en API

- POST /records: acepta `c2pa_metadata` (opcional, no rompe nada)
- GET /records/:id: devuelve `c2pa_metadata` si existe
- GET /export: incluye `c2pa_metadata` en el receipt

---

## Sobre "Do Not Train"

### Posición de RxM

La señal "Do Not Train" es una **aserción factual**, no una garantía:

- **RxM registra**: "El creador declaró que este contenido no debe usarse para entrenamiento"
- **RxM no garantiza**: Que ningún sistema respete esa señal
- **RxM no enforce**: No puede impedir que un crawler ignore la señal

Esto es 100% coherente con:
- **OP-10** (diseño anti-promesa): registrar señal, no prometer efecto
- **OP-2** (hecho precede calificación): registrar antes de interpretar
- **Principio 1**: hechos, no derechos

### Valor concreto

Aunque no sea "enforceable" técnicamente, tener la señal registrada y anclada en blockchain:
- Crea **evidencia temporal** de la intención declarada
- Permite **trazabilidad retroactiva** si hay litigio
- Complementa la señal C2PA con un registro independiente e inmutable

---

## Consideraciones adicionales no abordadas previamente

### 1. IPTC y otros metadatos

Además de C2PA, existen estándares de metadatos como:
- **IPTC Photo Metadata** (quién, cuándo, dónde)
- **XMP** (Adobe extensible metadata)
- **Schema.org** (metadatos web)

El campo `c2pa_metadata` se puede generalizar a un futuro `provenance_metadata` que acepte múltiples estándares.

### 2. W3C Verifiable Credentials

Los Verifiable Credentials (VCs) de W3C usan un modelo similar al de RxM:
- Issuer → Agent wallet
- Subject → Content hash
- Credential → PoG

Futuro: RxM podría emitir sus receipts como VCs, haciendo el ecosistema interoperable con identidad descentralizada (DID).

### 3. Atestación temporal cruzada

Combinar:
- Timestamp C2PA (PKI timestamp authority)
- Timestamp RxM (blockchain anchor)

Crea **doble atestación temporal** — muy difícil de falsificar porque requeriría comprometer ambos sistemas independientemente.

### 4. El problema de "quién generó" vs "quién firmó"

- C2PA dice: "esta organización (cert X.509) firmó este manifiesto"
- RxM dice: "esta wallet técnica firmó esta declaración de generación"

Son dos niveles de identidad:
- C2PA → identidad organizacional (Adobe, NYT, etc.)
- RxM → identidad técnica del agente (wallet)

En un ecosistema maduro, ambos coexisten: "Adobe Firefly (cert C2PA) generó esto con modelo X (wallet RxM)".

### 5. Mercado de contenidos verificados

A largo plazo, C2PA + RxM juntos habilitan un **mercado de contenidos con doble procedencia**:
- C2PA dice "este archivo no fue manipulado"
- RxM dice "este contenido fue generado así, por este agente, en esta fecha, y no debe usarse para training"

Esto tiene valor comercial directo para:
- Agencias de noticias
- Estudios creativos
- Marketplaces de IA generativa
