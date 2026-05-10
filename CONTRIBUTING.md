# Contributing to Res Ex Machina

Thank you for your interest in contributing to **Res Ex Machina** ⚖️ — the neutral, immutable registry where AI agents leave a verifiable trail of their creations.

This document explains how to set up the project locally, make changes, and submit them for review.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Architecture](#project-architecture)
- [System Invariants](#system-invariants)
- [Testing](#testing)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)

---

## Code of Conduct

Be respectful, constructive, and professional. We're building trust infrastructure — the same principles apply to our community.

---

## Getting Started

### Prerequisites

- **Node.js** 20 or 22 (LTS)
- **Docker** and Docker Compose
- **Git**

### Setup

```bash
# 1. Fork the repo and clone your fork
git clone https://github.com/<your-username>/Res-ex-Machina.git
cd Res-ex-Machina

# 2. Install dependencies
npm install

# 3. Create environment config
cp .env.example .env

# 4. Start infrastructure (PostgreSQL, Redis, Anvil test chain)
docker compose up -d postgres redis anvil

# 5. Create database tables
npx drizzle-kit push

# 6. Verify everything works
npm run dev
# In another terminal:
curl -s http://localhost:3000/v1/health | python3 -m json.tool
```

You should see all 3 checks (`database`, `redis`, `blockchain`) as `"ok"`.

---

## Development Workflow

### Useful Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start API with hot reload (tsx watch) |
| `npm test` | Run all 169 tests |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Tests with v8 coverage report |
| `npm run lint` | ESLint code quality check |
| `npm run lint:strict` | ESLint with zero warnings allowed |
| `npm run typecheck` | TypeScript type checking (no emit) |
| `npm run check` | All of the above in sequence |
| `npm run build` | Compile TypeScript for production |

### Before Submitting

Always run the full check before pushing:

```bash
npm run check
```

This runs `typecheck → lint:strict → test` in sequence. All three must pass.

---

## Project Architecture

```
src/
├── config/          # Environment, blockchain, Redis, Sentry
├── db/              # Drizzle ORM schema and connection
├── middleware/       # Rate limiting, auth, request processing
├── routes/          # Fastify route handlers (records, health, webhooks)
│   └── schemas/     # Zod validation schemas
├── services/        # Business logic (anchor, fee, signature, queue, webhooks)
├── utils/           # Shared utilities (errors, logger, URL validator)
└── workers/         # BullMQ workers (anchor, webhook dispatch)
```

### Key Design Decisions

- **Append-only database** — Records are never updated or deleted
- **Async anchoring** — On-chain transactions are processed via BullMQ queues, not synchronously
- **Structured logging** — Pino JSON logger in workers/services (not `console.log`)
- **SSRF protection** — Webhook URLs are validated against both IPv4 and IPv6 DNS resolution

---

## System Invariants

These are **absolute rules** that no contribution can violate. They are tested and enforced:

| ID | Rule |
|---|---|
| INV-001 | Records are **permanent** — NO UPDATE, NO DELETE |
| INV-003 | `content_hash` must match `sha256:{64 hex chars}` |
| INV-005 | Valid **EIP-712 signature** required for every record |
| INV-007 | Platform does **NOT custody** private keys |
| INV-012 | On-chain **fee must be verified** before registration |
| INV-014 | `nonce` must be **UNIQUE per wallet** (anti-replay) |
| INV-016 | `content_hash` must be **UNIQUE** (idempotency) |

If your PR breaks any invariant, it will be rejected regardless of the feature it adds.

---

## Testing

We use **Vitest** as the testing framework. Tests are in the `tests/` directory.

### Writing Tests

- Use `vi.mock()` to mock dependencies (DB, services, blockchain)
- Tests that import `src/routes/records.ts` **must mock `env.ts` first** to prevent `process.exit(1)`:

```typescript
// Always add this BEFORE other mocks
vi.mock('../src/config/env.js', () => ({
    env: {
        PORT: 3000,
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379',
        L2_RPC_URL: 'http://localhost:8545',
        L2_CHAIN_ID: 31337,
        FEE_RECEIVER_ADDRESS: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        FEE_MINIMUM_AMOUNT: 0.01,
        FEE_TX_MAX_AGE_HOURS: 24,
        ANCHOR_WALLET_PRIVATE_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    },
}));
```

### Test Categories

| File | What it tests |
|---|---|
| `pog-schema.test.ts` | Zod schema validation for PoG bundles |
| `records-batch.test.ts` | Batch endpoint + error factories |
| `invariants.test.ts` | System invariants enforcement |
| `records-get.test.ts` | GET endpoints (by ID, verify, export) |
| `webhooks.test.ts` | Webhook CRUD + error factories |
| `fee.test.ts` | Fee verification logic |
| `wallet-auth.test.ts` | EIP-191 wallet authentication |

---

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>

[optional body]

[optional footer(s)]
```

### Types

| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that doesn't add a feature or fix a bug |
| `test` | Adding or updating tests |
| `chore` | Build, CI, tooling changes |

### Examples

```
feat: Add multi-chain anchoring support

fix: Prevent duplicate on-chain transactions on BullMQ retry

docs: Update threat model with SSRF IPv6 mitigation

test: Add edge cases for batch endpoint validation
```

---

## Pull Request Process

1. **Fork** the repository and create a feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** following the architecture and invariants above

3. **Run the full check**:
   ```bash
   npm run check
   ```

4. **Commit** with a descriptive message following the convention

5. **Push** to your fork and open a Pull Request against `main`

6. **Describe** your PR clearly:
   - What problem does it solve?
   - What changes were made?
   - Are there any breaking changes?

### PR Requirements

- [ ] All tests pass (`npm test`)
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] No ESLint errors (`npm run lint`)
- [ ] No system invariants violated
- [ ] Documentation updated if needed (README, CHANGELOG, Docs/)
- [ ] New features include tests

---

## Reporting Issues

Use [GitHub Issues](https://github.com/Sebas-Solver/Res-ex-Machina/issues) to report bugs or request features.

### Bug Reports

Include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment (Node version, OS)
- Relevant logs (if any)

### Feature Requests

Include:
- Description of the feature
- Use case / motivation
- Impact on existing invariants (if any)

---

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).

---

Thank you for helping build trust infrastructure for the age of AI. ⚖️
