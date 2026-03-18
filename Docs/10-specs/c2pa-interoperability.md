# Interoperability with Provenance Standards

> **Version**: v1.1 (February 2026)
> **Status**: Approved design, implementation starting v1.1

---

## 1. Positioning

### Central Thesis

RxM is **asset format agnostic**. It doesn't care if it's an image, a text, a video, or code. It logs the **generation event**, not the content.

Embedded provenance standards (C2PA, IPTC, XMP, etc.) travel **with the file**. RxM lives **outside the file**. They are complementary layers:

```
┌─────────────────────────────────────────────┐
│             EMBEDDED STANDARDS              │
│  C2PA   → signed manifest (X.509/JUMBF)     │
│  IPTC   → photographic origin metadata      │
│  XMP    → extensible metadata (Adobe)       │
│  Schema.org → web semantic metadata         │
│                                             │
│  🔑 Travels WITH the file                   │
│  ⚠️ Lost if metadata is stripped            │
└────────────────────┬────────────────────────┘
                     │  complementary
┌────────────────────▼────────────────────────┐
│             EXTERNAL REGISTRY (RxM)         │
│  - Signed PoG (EIP-712 / wallet)            │
│  - On-chain anchored receipt                │
│  - Permanent and independent of the file    │
│                                             │
│  🔑 Lives OUTSIDE the file                  │
│  ✅ Survives even if the file disappears    │
└─────────────────────────────────────────────┘
```

### 5 Key Points

1. **RxM is asset format agnostic** — it does not need access to the file
2. **Can record references** to C2PA manifests or other standards
3. **Does not implement watermarking or fingerprinting** — those are C2PA competencies
4. **Does not substitute C2PA; it complements it** — different stack layers
5. **Can coexist with double temporal attestation** — PKI timestamp + blockchain anchor

### Organizational vs Technical Identity

Two identity levels that don't compete, they complement:

| | C2PA | RxM |
|---|---|---|
| **Type** | Organizational identity | Technical identity |
| **Mechanism** | X.509 Certificate (PKI) | EIP-712 Wallet (crypto) |
| **Example** | "Adobe signed this manifest" | "This wallet generated this content" |
| **Model** | Centralized (CA issues cert) | Decentralized (agent creates wallet) |

This reinforces **OP-4** (technical identity ≠ legal personality):
- Organizational signature (cert) — who distributes it
- Agent signature (wallet) — who generated it
- **Two layers of provenance** on the same content

### What RxM does NOT do (and shouldn't do)

- ❌ Watermarking / fingerprinting (soft bindings)
- ❌ Embed manifests within files (hard bindings JUMBF)
- ❌ Sign with X.509 certificates
- ❌ Detect byte manipulation
- ❌ Decide if content is "authentic"

### What RxM DOES provide that embedded standards lack

- ✅ **Permanent and immutable** registry independent of the file
- ✅ On-chain anchoring with blockchain timestamp
- ✅ Technical identity of AI agents via wallet
- ✅ Idempotency and anti-replay (nonce + content_hash)
- ✅ Radical legal neutrality
- ✅ Proof that survives total loss of the file or its metadata

---

## 2. Technical Design: `provenance_metadata` (v1.1)

### Generic schema with `standard` discriminator

```typescript
// A single flexible field for ANY provenance standard
const provenanceMetadataSchema = z.object({
    /** Discriminator: which provenance standard is referenced */
    standard: z.enum([
        'c2pa',         // Content Credentials (C2PA)
        'iptc',         // IPTC Photo Metadata
        'xmp',          // XMP (Extensible Metadata Platform)
        'schema_org',   // Schema.org
        'custom',       // Custom standard
    ]),

    /** SHA-256 of the standard's manifest or metadata block */
    manifest_hash: z.string()
        .regex(/^sha256:[a-f0-9]{64}$/)
        .describe('Manifest or metadata block hash'),

    /** Identifier of the generator or tool that created the metadata */
    claim_generator: z.string().max(256).optional()
        .describe('Ex: "Adobe Photoshop 26.0", "c2patool/0.9.0"'),

    /** Issuer or signer of the standard (CN of X.509 cert for C2PA) */
    issuer: z.string().max(256).optional()
        .describe('Ex: "Adobe Inc.", "Reuters"'),

    /** Relevant assertions or properties */
    assertions: z.array(z.string().max(128)).max(20).optional()
        .describe('Ex: ["c2pa.do_not_train", "c2pa.created"]'),

    /** URI to original manifest (if public) */
    manifest_uri: z.string().url().max(1024).optional()
        .describe('URL where full manifest can be retrieved'),
}).optional();
```

### Usage Examples per standard

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
    "claim_generator": "my-pipeline-v1",
    "assertions": ["do_not_train", "generated_with_rag"]
}
```

### DB Impact (v1.1)

```sql
ALTER TABLE records ADD COLUMN provenance_metadata JSONB;
CREATE INDEX idx_records_prov_standard ON records
    USING GIN ((provenance_metadata -> 'standard'));
```

### API Impact (v1.1)

- `POST /v1/records` accepts `provenance_metadata` (optional, backward compatible)
- `GET /v1/records/:id` returns `provenance_metadata` if it exists
- `GET /v1/records/:id/export` includes `provenance_metadata` in the receipt
- **Does not break anything from v1.0** — everything is optional

---

## 3. About "Do Not Train"

### RxM Position

The "Do Not Train" signal is a **factual assertion**, not a guarantee:

- **RxM records**: "The creator declared `do_not_train` on this content"
- **RxM does not guarantee**: That any system will respect that signal
- **RxM does not enforce**: Cannot stop a crawler from ignoring it

Consistent with:
- **OP-10** (anti-promise): record the signal, don't promise the effect
- **OP-2** (fact precedes classification): record before interpreting
- **Principle 1**: facts, not rights

### Concrete Value

Having the signal anchored on blockchain:
- Creates **temporal evidence** of declared intent
- Allows **retroactive traceability** if litigation occurs
- Complements embedded standard signal with an independent record

---

## 4. Double Temporal Attestation

Combining timestamps from two independent systems:

| System | Mechanism | Trust |
|---|---|---|
| C2PA / IPTC | PKI timestamp authority (RFC 3161) | Centralized infrastructure |
| RxM | Blockchain anchor (block + txHash) | Decentralized infrastructure |

**Result:** To forge the date one would have to compromise **both systems** independently → extremely difficult.

---

## 5. Vision: Trust Infrastructure for Creative Economy

### What C2PA + RxM enable together

```
File (C2PA)                 Registry (RxM)
    |                             |
    | "was not manipulated"       | "was generated like this"
    | "Adobe signed it"           | "this wallet signed it"
    | "do_not_train"              | "do_not_train anchored"
    |                             |
    └───────────┬─────────────────┘
                |
          DOUBLE PROVENANCE
                |
    ┌───────────▼─────────────────┐
    │  strong traceability        │
    │  automatic licensing        │
    │  independent verification   │
    │  technical audit            │
    └─────────────────────────────┘
```

### Target Sectors

| Sector | Need | RxM Value + standards |
|---|---|---|
| News Agencies | Verify origin of AI images | Double provenance + anti-deepfake |
| Creative Studios | License AI outputs | Registry + do_not_train + traceability |
| Publishers | Prove human vs AI authorship | PoG with human_intervention_level |
| Historial Archive | Preserve creation context | Immutable registry + offline export |
| AI Marketplaces | Monetize outputs with trust | Verifiable receipt + embedded C2PA |

### This is no longer just "registry"

It is an **independent technical traceability infrastructure**, designed to reinforce trust in digital creative markets.

---

## 6. Future Considerations

### W3C Verifiable Credentials (VCs)

RxM receipts could be issued as VCs:
- Issuer → RxM API
- Subject → Content hash
- Credential → PoG + anchor data

This would make receipts interoperable with the decentralized identity (DID) ecosystem.

### Field Generalization

If new standards appear, just add values to the `standard` enum:
```typescript
standard: z.enum(['c2pa', 'iptc', 'xmp', 'schema_org', 'w3c_vc', 'custom'])
```

Without changing the structure or the API.
