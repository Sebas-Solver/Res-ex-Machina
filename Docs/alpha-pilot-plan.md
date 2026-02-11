# Plan de Piloto Alpha — Res ex Machina

## Objetivo

Validar en 2 semanas que el sistema funciona en **condiciones reales** con agentes externos.

## Participantes

| Agente | Tipo | Stack | Responsable |
|---|---|---|---|
| **A** (nuestro) | Happy path, burst | TypeScript + viem | Equipo core |
| **B** (dev amigo) | Integración desde cero | TypeScript (siguiendo docs) | Integrador 1 |
| **C** (otro stack) | Compatibilidad | Python (eth_account) o Go | Integrador 2 |
| **D** (adversarial) | Ataque | TypeScript | Equipo core |

---

## Setup para integradores (B y C)

### 1. Clonar y arrancar

```bash
git clone https://github.com/Sebas-Solver/Res-ex-Machina.git
cd Res-ex-Machina
cp .env.example .env
docker compose up -d
npm install && npm run db:push
npm run dev          # terminal 1
npm run worker:anchor  # terminal 2
```

### 2. Verificar que todo funciona

```bash
curl http://localhost:3000/v1/health | jq
# → status: "healthy"
```

### 3. Leer los docs

- **API completa**: `Docs/api-examples.md`
- **Verificar offline**: `Docs/verify-pog-offline.md`
- **Errores**: `Docs/10-specs/error-catalog.md`

### 4. Crear tu primer record

Seguir los pasos de `Docs/api-examples.md`:

1. Generar wallet (viem, ethers, eth_account en Python)
2. Calcular SHA-256 de tu contenido
3. Firmar PoG con EIP-712
4. Enviar fee tx a Anvil (0.001 ETH mínimo)
5. POST /v1/records
6. Esperar anchoring
7. GET /verify + /export

---

## Escenarios obligatorios (acceptance tests)

| # | Escenario | Criterio | Script |
|---|---|---|---|
| 1 | Burst 20 records seguidos | 0 fallos, p95 < 3s | `agent-a-happy-path.ts` |
| 2 | Mismo content_hash duplicado | 409 con record_id | `agent-d-adversarial.ts` |
| 3 | Nonce replay (misma wallet) | 409 anti-replay | `agent-d-adversarial.ts` |
| 4 | Fee tx inválida | 402 fee_required | `agent-d-adversarial.ts` |
| 5 | Worker caído 30 min | Acepta receipts, ancla al volver | **Manual** |
| 6 | Fallo RPC/anchoring | anchor_failed + export ok | **Manual** |

### Test manual: Worker caído (escenario 5)

```bash
# 1. Crear 5 records (sin worker)
# 2. Verificar que state = pending_anchor
curl http://localhost:3000/v1/records/<id> | jq .state
# → "pending_anchor"

# 3. Esperar 30 min
# 4. Arrancar worker
npm run worker:anchor

# 5. Verificar que todos se anclaron
curl http://localhost:3000/v1/records/<id> | jq .state
# → "anchored"

# 6. Verificar NO duplicación
# → Solo 1 anchor tx por record (check DB)
```

### Test manual: Fallo RPC (escenario 6)

```bash
# 1. Detener Anvil
docker compose stop anvil

# 2. Crear records → deben crearse (state: pending_anchor)
# 3. Verificar que /export sigue funcionando
curl http://localhost:3000/v1/records/<id>/export | jq

# 4. Arrancar Anvil
docker compose start anvil

# 5. Worker retoma y ancla con backoff
```

---

## Métricas al final del piloto

| Métrica | Target | Cómo medir |
|---|---|---|
| p95 POST /records | < 3000ms | Output de `agent-a-happy-path.ts` |
| Anchoring mediano | < 5 min | Check timestamps DB |
| Anchor success rate | > 99% | `SELECT state, count(*) FROM records GROUP BY state` |
| Invariantes rotos | 0 | CI pipeline |
| Bugs de firma por integradores | Documentar | Feedback B y C |

---

## Criterio Go/No-Go

Tras la alpha, se puede hacer `git tag v1.0.0` si:

- [x] CI verde (tests + invariants)
- [x] /health OK (api + db + redis + rpc)
- [x] Worker idempotente + retries
- [ ] **Alpha:** 0 invariantes rotos
- [ ] **Alpha:** p95 < 3s
- [ ] **Alpha:** Anchor success > 99%
- [ ] **Alpha:** Al menos 1 integrador externo completó flujo

Si no pasan → `v1.0.0-rc2` con fixes.
