# Res ex Machina — Guide for Humans

> * Means in Latin "Thing made by the machine"* — A registry where AIs leave a trail of what they create.
>
> **⚠️ Alpha version** — This is a testing version. Data may be wiped. It runs on the Base Sepolia test network.

---

## What is Res ex Machina?

Imagine a **registry of digital works for artificial intelligence**. 

When an AI generates something — a text, an image, code, a song — there is no verifiable record of who created it, when, or under what conditions. Res ex Machina (RxM) solves exactly that.

RxM is a **public, neutral and immutable registry** where AI agents (or the people who use them) can leave a verifiable technical seal that "this AI generated this, at this time, in this way". Like a registry certificate, but automatic and for machines.

### The registry certificate analogy

| Traditional notary/registry | Res ex Machina |
|---------------------|----------------|
| You go to the notary/registry with a document | Your AI sends the output data to RxM |
| The notary/registrar puts a seal with a date | RxM generates a receipt with an immutable timestamp |
| The seal stays in the notary's/registry's books | The record is anchored on blockchain |
| You can request a certified copy | You can export the verifiable receipt |
| You cannot erase a notary act or registry certificate | You cannot erase an RxM record |

---

## What does RxM do?

1. **Registers facts** — "This AI generated this output at this time"
2. **Generates a verifiable receipt** — A receipt anyone can check  
3. **Anchors the record on blockchain** — To make it immutable and independent of us
4. **Allows verification** — Was this content registered? When? By whom?

### What information is stored?

- **Always:** the digital fingerprint of the content (hash), who registered it (wallet), when, and the details of the generation process (which model, what parameters, etc.)
- **Never:** the real content. RxM does not store your text, image or code. Only the proof that it existed.

### What RxM does NOT do?

| What it DOES NOT do | Why |
|----------------|---------|
| ❌ Does not save the content | Only saves the digital fingerprint (like a fingerprint, not the person) |
| ❌ Does not detect if something is AI | That is a detector, RxM is a *positive* registry |
| ❌ Does not evaluate quality | Does not judge if something is good or bad |
| ❌ Does not manage copyright | Does not say who "owns" something, only who registered it |
| ❌ Does not moderate content | Does not decide if something is appropriate or not |
| ❌ Does not require human validation | Registration is automatic, there is no prior approval |

---

## How does it work? (Simple version)

The process has 4 steps:

```
   YOUR AI                    RxM                    BLOCKCHAIN
   generates something → registers the fact   → anchors forever
       ↓                       ↓                         ↓
   hash + signature     immediate receipt       immutable proof
```

### Step by step:

1. **Your AI generates an output** (text, image, whatever)
2. **The digital fingerprint is calculated** from the output (a unique code called "hash")
3. **It is digitally signed** with the AI's technical identity (its "wallet")
4. **A symbolic fee** is paid (anti-spam, ~$0.01)
5. **RxM registers everything** and returns an immediate receipt
6. **In the background**, RxM anchors the record on blockchain to make it permanent

> **Result:** You have a receipt that proves your AI generated that content at that time. No one can erase that record, not even us.

---

## Key Concepts (Glossary)

| Concept | What it is | Analogy |
|----------|--------|----------|
| **Hash** | Digital fingerprint of a file. A unique code that identifies the content without revealing it | Like a physical fingerprint: identifies without showing the person |
| **Wallet** | Digital technical identity. A pair of cryptographic keys | Like an electronic ID for machines |
| **EIP-712 Signature**| Standardized digital signature proving who sent the record | Like the electronic signature of a document |
| **Fee** | Symbolic fee paid for each registration (anti-spam) | Like a minimal administrative fee |
| **Receipt** | The proof you receive after registering | Like a sealed registration receipt |
| **Anchoring**| The process of recording the registry on blockchain | Like archiving the receipt in a permanent public registry |
| **PoG (Proof of Generation)** | The "proof package" with all the generation data | Like the complete technical dossier of the registration |
| **Blockchain** | Public and immutable database shared by thousands of computers | Like an accounting book no one can alter |

---

## Important things you should know

### What exactly is a wallet?

A wallet represents a **technical identity**. It is not necessarily a person: it can correspond to a person, a company, an organization, or an autonomous AI agent.

For maximum granularity and traceability, it is recommended to **use a different wallet for each AI agent**. This way each agent has its own identity in the registry, and you can easily distinguish which agent generated what content. If you use a single wallet for everything, all records will seem to be from the same "author".

### Can the AI lie about which model it used?

Yes, technically it can. The model field (`model_id`) is a **declarative assertion** by the agent. RxM records it and signs it cryptographically, but **cannot universally verify which model was actually executed**. It works similarly to an affidavit: the agent states "I used GPT-4o", RxM seals that statement, but does not check it for you.

What value does it have then? A lot:
- **Traceability**: there is a record of what the agent declared
- **Responsibility**: if an agent lies, the lie is recorded immutably
- **Consistency**: it can be cross-referenced with other data (dates, available models on that date, etc.)
- **Basis for future improvements**: we are investigating ways to more directly verify or corroborate the used model

### What if two AIs generate the same content?

The first record wins. RxM registers the **fact that someone sent that hash at that time**, not who was the "first to have the idea". If two agents generate exactly the same output, only the first will be able to register it — the second will receive a `duplicate_content_hash` error. Remember that RxM is not an intellectual property system, it is a registry of technical facts.

### What if the blockchain has a technical problem?

The record is created **immediately** in the RxM database (state `pending_anchor`). The blockchain anchoring is an additional permanence step that happens in the background. If the blockchain has temporary problems, your record will continue to exist in RxM; the system will automatically retry the anchoring up to 5 times.

---

## What happens if something temporarily fails?

RxM is designed to **keep working** even when parts of the system have problems. It's like a hospital with an emergency generator: if the main power goes out, essential services keep operating.

### If Redis goes down (the job queue)

| What happens | What RxM does |
|----------|-------------|
| The speed control (rate limit) switches to degraded mode | **Write operations (registration) are blocked** with a 503 error. Read operations (query, verify, export) continue with a conservative local limit. This prevents abuse during infrastructure issues |
| The blockchain anchoring cannot be queued | **The record is saved anyway** in the database. When Redis returns, anchoring will process |
| The health check shows "degraded" | Normal. It says `Retry-After: 30` so clients know when to try again |

### If the L2 blockchain goes down

| What happens | What RxM does |
|----------|-------------|
| Payments (fees) cannot be verified | Registry requests return a 402 error (expected) |
| Anchoring is impossible | The worker automatically retries up to 5 times |
| The health check shows "degraded" | Normal |

### Summary: your data is safe

> **The important part:** Your record *is never lost*. Even if Redis or the blockchain are temporarily down, the record is saved in the database. Pending steps (anchoring, job queue) are completed automatically when the service returns.
>
> Additionally, the API health check refreshes every 30 seconds (it has a 30s "cache"). This prevents making hundreds of unnecessary calls to systems that might be saturated.

---

## How to use v1.0?

### Important: v1.0 is API only

RxM v1.0 is an **API** (an interface for programs, not people). It has no buttons, no screen, no app. It's like a phone service: you call with a program and it answers you.

This means that to use RxM v1.0 you need:
- A program that knows how to "speak" with the API (an AI agent, a script, or any software)
- An Ethereum wallet (technical identity)
- Access to the blockchain network (to pay the fee)

### Available operations

| Operation | What it does | When to use |
|-----------|----------|---------------|
| **Register** | Creates a new generation record | Every time your AI generates something you want to certify |
| **Register and wait** | Same, but waits for blockchain anchor before responding (max 25s) | If you need the full confirmation in a single call |
| **Query** | Finds a record by its ID | If you want to see details of a specific record |
| **Verify** | Checks if a record exists for an specific content | If someone tells you "I generated this" and you want to verify it |
| **My records** | Lists all your agent's records | If you want to see what your AI has registered (requires auth) |
| **Export** | Downloads the complete record receipt | If you need a formal proof to present to someone |
| **Export (compact)** | Downloads only essential verification data | If an AI agent needs to verify quickly (saves tokens) |
| **Verify receipt** | Checks that a receipt is authentic | If you receive a receipt and want to confirm it hasn't been tampered with |

> **alpha.2 Novelty:** Receipts now include direct links to the blockchain explorer. You can click and see the transaction directly on BaseScan, Etherscan, etc. You don't need to search for the transaction hash yourself.

### Real Example (simplified)

Imagine you have an AI agent that generates reports. You want every report to be registered:

1. **Your agent generates a report** → calculates its hash: `sha256:a1b2c3d4...`
2. **Your agent signs** the data with its wallet and pays the fee
3. **Your agent sends** everything to RxM → receives a receipt with ID `f8d2e7a1-...`
   - *Fast option:* if using `wait_for_anchor=true`, receives the complete confirmation immediately (without having to wait and query again)
4. **Days later**, someone asks: "Did your AI generate this?"
5. **You verify** in RxM with the report's hash → "Yes, registered on 02/12/2026 at 14:30"
6. **You export** the receipt as a formal proof (or in compact mode if an AI needs it)
7. **The third party verifies** the receipt with the CLI verifier → `✅ AUTHENTIC RECORD`

---

## Querying my own records

> **alpha.2 Novelty** — Your agent can now **list all its records** using the "My records" operation (`GET /records/mine`).

### How does it work?

The API needs to check that you are actually the one requesting the data (so no one can see another's records). It does this through a simple authentication mechanism:

1. Your agent generates a current timestamp
2. Your agent signs a message with its wallet that says: "It's me, and I'm asking for this right now"
3. Your agent sends the request along with the signature
4. RxM checks the signature and returns only the records for that wallet

It's like **showing your ID at a window**: the API verifies your identity before giving you the information.

### What data does it return?

A list of all records your agent has made, with pagination (if you have many records, it returns them in pages of 20).

### Possible errors

| Error | What it means | What to do |
|-------|-------------|----------|
| `missing_auth_headers` | Authentication signature missing | Your agent must include auth data |
| `invalid_wallet_address` | Wallet address is invalid | Check that the address is correct |
| `auth_timestamp_expired` | Timestamp is over 5 minutes old | Your agent must generate a new timestamp |
| `auth_signature_invalid` | Signature does not match | Check that the signing wallet is correct |

> **Note:** This authentication system is different from the one used to register (EIP-712). Listing records uses a simpler method called EIP-191 ("personal signature").

---

## Problems that may arise and how to solve them

### 1. "My record says `pending_anchor`"

**What it means:** The record saved successfully, but hasn't been written to the blockchain yet.

**Is it serious?** No. Your record already exists and is valid. Blockchain anchoring happens in the background and can take 1 to 5 minutes. The record was created, it's just waiting to be archived on blockchain to make it permanent.

**What to do:** Wait a few minutes and query again. If after 30 minutes it is still `pending_anchor`, there might be a problem connecting to the blockchain. The system will retry up to 5 times automatically.

---

### 2. "It says `rate_limit_exceeded` (code 429)"

**What it means:** You have sent too many requests in a short time.

**Is it serious?** No. It's an anti-spam protection.

**What to do:** Wait a few seconds (the response tells you how many) and try again. The limit is 10 records per minute per wallet.

---

### 3. "It says `duplicate_content_hash` (code 409)"

**What it means:** A record with the same digital fingerprint already exists. The same content cannot be registered twice.

**Is it serious?** No. It's an idempotency protection. If you register the same content twice, RxM tells you instead of creating a duplicate.

**What to do:** If it's the same content, you don't need to do anything — it's already registered. If you think it should be different, verify that the content actually changed.

---

### 4. "It says `fee_not_verified` (code 402)"

**What it means:** The payment fee could not be verified on the blockchain.

**Possible causes:**
- The payment transaction hasn't been confirmed on the blockchain yet
- An incorrect payment address was used
- The transaction is over 24 hours old
- The same transaction was already used for another record

**What to do:** Verify that the payment transaction confirms before sending the registration. Each record needs its own payment transaction (cannot be reused).

---

### 5. "It says `invalid_signature` (code 401)"

**What it means:** The digital signature could not be verified. Something went wrong when signing.

**What to do:** Verify that you are signing with the same wallet you indicate as `agent_wallet`. The signature must be EIP-712 with the exact format the system specifies.

---

### 6. "The record cannot be deleted"

**This is by design.** Records in RxM are permanent (immutable). They cannot be edited or deleted. Once created and anchored on blockchain, the record exists independently.

If you registered something by mistake, the record will continue to exist. However, since RxM only saves the digital fingerprint (not the content), no sensitive data is exposed.

---

## Frequently Asked Questions

### Does RxM keep my files?
**No.** It only saves the digital fingerprint (hash). It's like keeping a digital fingerprint without keeping the person. Your content remains yours and private. In the future we might offer the option to save files on decentralized storage like IPFS, but it will not be mandatory.

### How much does it cost?
The current fee is **~$0.01 per record** (one US cent). It is paid in cryptocurrency on the blockchain network. It is a symbolic cost to prevent spam.

### What if RxM becomes unavailable?
Blockchain anchoring allows independent verification, even without relying on the original server. Records anchored on the public blockchain can be verified by anyone with access to that blockchain and the exported receipt, without needing RxM to be operational.

### Can someone alter a record?
**No.** Once registered and anchored on blockchain, the information is immutable. Not even RxM administrators can modify an existing record.

### Does it count as legal proof?
RxM generates **verifiable technical evidence** (who, what, when, how). The legal value of that evidence depends on the jurisdiction and context. It is comparable to a certified timestamp: it is not a court sentence, but it is an objective technical proof that an expert can verify.

### Does it only work with AI?
In principle yes, it is designed to register outputs from AI agents. But technically, any digital content can generate a hash and be registered. What differentiates RxM from a simple timestamp is the **Proof of Generation (PoG)** — the specific data about the AI generative process.

### Do I need to know programming to use RxM?
For **v1.0, yes** — you need to interact with the API via code. Future versions will have a more accessible visual interface (dashboard). However, the idea is that **AI agents** will use RxM automatically, without the human user having to do anything manually.

### Is RxM a notary? Does it replace notary functions?
**No.** RxM is not a notary, nor an official public registry, nor does it replace any notarial or registry function. It does not have the status of a public notary, does not grant public faith, and does not produce documents with legal value equivalent to a notarial act.

RxM is a **private technical service** that generates verifiable evidence: it records technical facts (who signed what, when, with what process) and anchors them on blockchain to make them independent of the service itself. That technical evidence can be useful as a complementary **probationary means** in certain contexts, but its legal valuation will always depend on the jurisdiction, context, and the classification given by a court or competent authority.

In short: RxM generates **technical proofs**, not **legal acts**.

---

## States of a record

A record goes through these states:

```
  [ Record sent ]
         ↓
  ┌──────────────────┐
  │  pending_anchor  │  ← The record exists, but not yet written to blockchain
  └────────┬─────────┘
           ↓
     ┌─────┴─────┐
     ↓           ↓
┌─────────┐  ┌───────────────┐
│ anchored│  │ anchor_failed │
│    ✅   │  │    ❌         │
└─────────┘  └───────────────┘
  Complete     There was an error
  and written  writing to blockchain
  to blockchain (retries 5 times)
```

- **`pending_anchor`** — Normal. Waiting for the system to anchor it on blockchain (1-5 minutes)
- **`anchored`** — Perfect. The record is complete and is immutable
- **`anchor_failed`** — Rare. There was a technical problem. Admins can resolve it manually

> **alpha.2 Novelty — `state_info`:** Now the API response comes with an extra block called `state_info` that tells you, in clear language:
> - **Is it a final state?** (`terminal: true/false`) — If it won't change anymore
> - **Can it be retried?** (`retryable: true/false`) — If the system will automatically try again
> - **What does it mean?** (`description`) — A text description of what is happening
>
> This is especially useful for AI agents, which can decide what to do (wait, retry, continue...) without needing to interpret technical state names.

---

## Summary in one sentence

> **Res ex Machina is a technical registry for AI:** it registers, seals and certifies what each AI generated, when and how, permanently and verifiably.
