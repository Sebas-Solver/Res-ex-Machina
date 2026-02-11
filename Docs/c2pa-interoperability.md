# Interoperabilidad con Estándares de Procedencia

> **Versión**: v1.1 (febrero 2026)
> **Estado**: Diseño aprobado, implementación a partir de v1.1

---

## 1. Posicionamiento

### Tesis central

RxM es **agnóstico al formato del asset**. No le importa si es una imagen, un texto, un vídeo o código. Registra el **evento de generación**, no el contenido.

Los estándares de procedencia embebida (C2PA, IPTC, XMP, etc.) viajan **con el archivo**. RxM vive **fuera del archivo**. Son capas complementarias:

```
┌─────────────────────────────────────────────┐
│         ESTÁNDARES EMBEBIDOS                │
│  C2PA   → manifiesto firmado (X.509/JUMBF)  │
│  IPTC   → metadatos de origen fotográfico   │
│  XMP    → metadata extensible (Adobe)       │
│  Schema.org → metadatos web semánticos      │
│                                             │
│  🔑 Viajan CON el archivo                   │
│  ⚠️ Se pierden si se stripean metadatos     │
└────────────────────┬────────────────────────┘
                     │  complementario
┌────────────────────▼────────────────────────┐
│         REGISTRO EXTERNO (RxM)              │
│  - PoG firmada (EIP-712 / wallet)           │
│  - Receipt anclado on-chain                 │
│  - Permanente e independiente del archivo   │
│                                             │
│  🔑 Vive FUERA del archivo                  │
│  ✅ Permanece aunque el archivo desaparezca │
└─────────────────────────────────────────────┘
```

### 5 puntos clave

1. **RxM es agnóstico al formato del asset** — no necesita acceder al archivo
2. **Puede registrar referencias** a manifiestos C2PA u otros estándares
3. **No implementa watermarking ni fingerprinting** — esas son competencias de C2PA
4. **No sustituye C2PA; lo complementa** — capas distintas del stack
5. **Puede coexistir con doble atestación temporal** — PKI timestamp + blockchain anchor

### Identidad organizacional vs técnica

Dos niveles de identidad que no compiten, se complementan:

| | C2PA | RxM |
|---|---|---|
| **Tipo** | Identidad organizacional | Identidad técnica |
| **Mecanismo** | Certificado X.509 (PKI) | Wallet EIP-712 (cripto) |
| **Ejemplo** | "Adobe firmó este manifiesto" | "Esta wallet generó este contenido" |
| **Modelo** | Centralizado (CA emite cert) | Descentralizado (agente crea wallet) |

Esto refuerza **OP-4** (identidad técnica ≠ personalidad jurídica):
- Firma organizacional (cert) — quién lo distribuye
- Firma de agente (wallet) — quién lo generó
- **Dos niveles de procedencia** sobre el mismo contenido

### Lo que RxM NO hace (y no debe hacer)

- ❌ Watermarking / fingerprinting (soft bindings)
- ❌ Embeber manifiestos en archivos (hard bindings JUMBF)
- ❌ Firmar con certificados X.509
- ❌ Detectar manipulación de bytes
- ❌ Decidir si un contenido es "auténtico"

### Lo que RxM SÍ aporta que los estándares embebidos no cubren

- ✅ Registro **permanente e inmutable** independiente del archivo
- ✅ Anclaje on-chain con timestamp blockchain
- ✅ Identidad técnica de agentes IA por wallet
- ✅ Idempotencia y anti-replay (nonce + content_hash)
- ✅ Neutralidad jurídica radical
- ✅ Prueba que sobrevive a la pérdida total del archivo o sus metadatos

---

## 2. Diseño técnico: `provenance_metadata` (v1.1)

### Schema genérico con discriminador `standard`

```typescript
// Un solo campo flexible para CUALQUIER estándar de procedencia
const provenanceMetadataSchema = z.object({
    /** Discriminador: qué estándar de procedencia se referencia */
    standard: z.enum([
        'c2pa',         // Content Credentials (C2PA)
        'iptc',         // IPTC Photo Metadata
        'xmp',          // XMP (Extensible Metadata Platform)
        'schema_org',   // Schema.org
        'custom',       // Estándar personalizado
    ]),

    /** SHA-256 del manifiesto/bloque de metadatos del estándar */
    manifest_hash: z.string()
        .regex(/^sha256:[a-f0-9]{64}$/)
        .describe('Hash del manifiesto o bloque de metadatos'),

    /** Identificador del generador o herramienta que creó los metadatos */
    claim_generator: z.string().max(256).optional()
        .describe('Ej: "Adobe Photoshop 26.0", "c2patool/0.9.0"'),

    /** Emisor o firmante del estándar (CN del cert X.509 para C2PA) */
    issuer: z.string().max(256).optional()
        .describe('Ej: "Adobe Inc.", "Reuters"'),

    /** Assertions o propiedades relevantes */
    assertions: z.array(z.string().max(128)).max(20).optional()
        .describe('Ej: ["c2pa.do_not_train", "c2pa.created"]'),

    /** URI al manifiesto original (si es público) */
    manifest_uri: z.string().url().max(1024).optional()
        .describe('URL donde se puede obtener el manifiesto completo'),
}).optional();
```

### Ejemplos de uso por estándar

**C2PA:**
```json
{
    "standard": "c2pa",
    "manifest_hash": "sha256:a1b2c3...",
    "claim_generator": "Adobe Firefly 3.0",
    "issuer": "Adobe Inc.",
    "assertions": ["c2pa.created", "c2pa.do_not_train"],
    "manifest_uri": "https://verify.contentauthenticity.org/inspect/..."
}
```

**IPTC:**
```json
{
    "standard": "iptc",
    "manifest_hash": "sha256:d4e5f6...",
    "claim_generator": "Lightroom Classic 14.0",
    "issuer": "Reuters",
    "assertions": ["iptc:DigitalSourceType=trainedAlgorithmicMedia"]
}
```

**Custom:**
```json
{
    "standard": "custom",
    "manifest_hash": "sha256:789abc...",
    "claim_generator": "mi-pipeline-v1",
    "assertions": ["do_not_train", "generated_with_rag"]
}
```

### Impacto en DB (v1.1)

```sql
ALTER TABLE records ADD COLUMN provenance_metadata JSONB;
CREATE INDEX idx_records_prov_standard ON records
    USING GIN ((provenance_metadata -> 'standard'));
```

### Impacto en API (v1.1)

- `POST /v1/records` acepta `provenance_metadata` (opcional, backward compatible)
- `GET /v1/records/:id` devuelve `provenance_metadata` si existe
- `GET /v1/records/:id/export` incluye `provenance_metadata` en el receipt
- **No rompe nada de v1.0** — todo es opcional

---

## 3. Sobre "Do Not Train"

### Posición de RxM

La señal "Do Not Train" es una **aserción factual**, no una garantía:

- **RxM registra**: "El creador declaró `do_not_train` en este contenido"
- **RxM no garantiza**: Que ningún sistema respete esa señal
- **RxM no enforce**: No puede impedir que un crawler la ignore

Coherente con:
- **OP-10** (anti-promesa): registrar la señal, no prometer el efecto
- **OP-2** (hecho precede calificación): registrar antes de interpretar
- **Principio 1**: hechos, no derechos

### Valor concreto

Tener la señal anclada en blockchain:
- Crea **evidencia temporal** de la intención declarada
- Permite **trazabilidad retroactiva** si hay litigio
- Complementa la señal del estándar embebido con un registro independiente

---

## 4. Doble atestación temporal

Combinar timestamps de dos sistemas independientes:

| Sistema | Mecanismo | Confianza |
|---|---|---|
| C2PA / IPTC | PKI timestamp authority (RFC 3161) | Infraestructura centralizada |
| RxM | Blockchain anchor (bloque + txHash) | Infraestructura descentralizada |

**Resultado:** Para falsificar la fecha habría que comprometer **ambos sistemas** independientemente → extremadamente difícil.

---

## 5. Visión: Infraestructura de confianza para economía creativa

### Lo que habilitan C2PA + RxM juntos

```
Archivo (C2PA)              Registro (RxM)
    │                           │
    │ "no fue manipulado"       │ "fue generado así"
    │ "Adobe lo firmó"          │ "esta wallet lo firmó"
    │ "do_not_train"            │ "do_not_train anclado"
    │                           │
    └───────────┬───────────────┘
                │
        DOBLE PROCEDENCIA
                │
    ┌───────────▼───────────────┐
    │  trazabilidad fuerte      │
    │  licenciamiento automático│
    │  verificación independiente│
    │  auditoría técnica        │
    └───────────────────────────┘
```

### Sectores objetivo

| Sector | Necesidad | Valor RxM + estándares |
|---|---|---|
| Agencias de noticias | Verificar origen de imágenes IA | Doble procedencia + anti-deepfake |
| Estudios creativos | Licenciar outputs IA | Registro + do_not_train + trazabilidad |
| Editoriales | Probar autoría humana vs IA | PoG con human_intervention_level |
| Archivo histórico | Preservar contexto de creación | Registro inmutable + export offline |
| Marketplaces IA | Monetizar outputs con confianza | Receipt verificable + C2PA embebido |

### Esto ya no es solo "registro"

Es **infraestructura de confianza para economía creativa**.

---

## 6. Consideraciones futuras

### W3C Verifiable Credentials (VCs)

Los receipts de RxM podrían emitirse como VCs:
- Issuer → API de RxM
- Subject → Content hash
- Credential → PoG + anchor data

Esto haría los receipts interoperables con el ecosistema de identidad descentralizada (DID).

### Generalización del campo

Si aparecen nuevos estándares, solo hay que añadir valores al enum `standard`:
```typescript
standard: z.enum(['c2pa', 'iptc', 'xmp', 'schema_org', 'w3c_vc', 'custom'])
```

Sin cambiar la estructura ni la API.
