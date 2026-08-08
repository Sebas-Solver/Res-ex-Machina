# Índice de Skills para Res ex Machina

Guía de routing para agentes que trabajan en este repositorio. No sustituye
las instrucciones de cada skill: indica cuál cargar primero y qué combinación
usar según el tipo de tarea.

## Regla Principal

Para cualquier tarea del proyecto, cargar primero `res-ex-machina`. Esta skill
contiene la arquitectura, las invariantes y los gotchas específicos del
repositorio.

Antes de modificar código, combinar la skill de dominio con:

- `lint-and-validate` para ejecutar los checks apropiados después del cambio.
- `verification-before-completion` antes de afirmar que algo está terminado.
- `code-review-and-quality` antes de integrar cambios no triviales.

## Skills Bloqueadas en el Proyecto

Estas skills aparecen en `skills-lock.json` y forman el núcleo técnico actual:

| Skill                       | Uso en RxM                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drizzle`                   | Consultas, schema y migraciones Drizzle. Revisar siempre contra la skill especializada `drizzle-orm-expert` cuando el cambio sea de persistencia. |
| `nodejs-backend-patterns`   | Patrones de backend Node.js, Fastify y servicios.                                                                                                 |
| `nodejs-best-practices`     | Decisiones de runtime, async, errores y seguridad Node.js.                                                                                        |
| `typescript-advanced-types` | Tipos de contratos SDK/API, unions y límites de compilación.                                                                                      |
| `vitest`                    | Tests del servidor y estrategia de mocking.                                                                                                       |
| `zod`                       | Validación de payloads, headers, configuración y respuestas externas.                                                                             |
| `accessibility`             | Revisión del dashboard HTML si cambia la interfaz administrativa.                                                                                 |
| `frontend-design`           | Solo para cambios visuales del dashboard o status page.                                                                                           |
| `seo`                       | Solo para documentación pública, status page o superficies indexables.                                                                            |

## Skills Específicas del Dominio

| Área               | Skills                                                                                           | Cuándo activarlas                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Invariantes RxM    | `res-ex-machina`                                                                                 | Siempre. Protege append-only, hash, firma, fee, nonce y unicidad.       |
| API y contratos    | `api-and-interface-design`, `api-security-best-practices`, `openapi-spec-generation`             | Nuevos endpoints, cambios de respuesta, headers, auth o OpenAPI.        |
| Fastify/Node       | `backend-dev-guidelines`, `nodejs-backend-patterns`, `nodejs-best-practices`                     | Rutas, middleware, servicios, errores, lifecycle y configuración.       |
| Autenticación      | `auth-implementation-patterns`, `security-review`                                                | EIP-191, EIP-712, admin key, permisos o cambios de identidad.           |
| PostgreSQL/Drizzle | `drizzle-orm-expert`, `database-migration`, `postgres-best-practices`, `database-design`         | Schema, constraints, índices, transacciones, migraciones y backfills.   |
| Pagos              | `payment-integration`, `stripe-integration` solo si aplica Stripe, `api-security-best-practices` | Fee legacy, x402, idempotencia, settlement y reconciliación.            |
| Blockchain/EVM     | `blockchain-developer`, `solidity-security`, `web3-testing`, `spec-to-code-compliance`           | viem, firmas, calldata, redes, contratos, anchoring y pruebas on-chain. |
| BullMQ/Redis       | `bullmq-specialist`, `redis-cli`                                                                 | Workers, retries, stalled jobs, backpressure, DLQ y Redis.              |
| Webhooks/SSRF      | `security-audit`, `web-security-testing`, `api-security-best-practices`                          | URLs externas, DNS, redirect, HMAC, reintentos y entrega.               |
| MCP                | `mcp-builder`, `mcp-tool-developer`, `agent-tool-builder`                                        | Tools MCP, sidecar criptográfico, transportes, schemas y permisos.      |
| Testing            | `testing-qa`, `vitest-skill`, `unit-testing-test-generate`, `test-guard`                         | Tests unitarios, integración, mocks, cobertura y regresiones.           |
| E2E                | `e2e-testing`, `webapp-testing`, `browser-testing-with-devtools`                                 | API desplegada, dashboard, flujos completos y runtime web.              |
| CI/CD              | `ci-cd-and-automation`, `github-actions-advanced`, `security-scanning-security-dependencies`     | Gates, matrices, SCA, secretos, artefactos y workflows.                 |
| Containers         | `container-security-hardening`, `docker-expert`                                                  | Dockerfile, Compose, usuario no-root, contexto, SBOM y runtime.         |
| Release            | `pre-release-review`, `shipping-and-launch`, `production-audit`                                  | Antes de tag, publicación, despliegue o release pública.                |
| Documentación      | `documentation`, `docs-guard`, `api-documentation`, `changelog-automation`                       | README, guías, OpenAPI, changelog y auditorías documentales.            |
| Arquitectura       | `architecture`, `brooks-audit`, `brooks-debt`, `doubt-driven-development`                        | Cambios multi-módulo, decisiones de diseño y deuda estructural.         |

## Routing por Tarea

### Nueva funcionalidad API

1. `res-ex-machina`
2. `api-and-interface-design`
3. `backend-dev-guidelines` + `zod`
4. `api-security-best-practices`
5. `vitest` o `testing-qa`
6. `lint-and-validate` + `verification-before-completion`

### Cambio de base de datos

1. `res-ex-machina`
2. `drizzle-orm-expert`
3. `database-migration`
4. `postgres-best-practices`
5. `testing-qa` para base vacía, backfill y rollback
6. `pre-release-review` si afecta despliegue

### Cambio de pagos, x402 o anchoring

1. `res-ex-machina`
2. `blockchain-developer`
3. `payment-integration`
4. `api-security-best-practices`
5. `web3-testing`
6. `doubt-driven-development`
7. `pre-release-review`

### Cambio de workers, Redis o webhooks

1. `res-ex-machina`
2. `bullmq-specialist`
3. `security-audit`
4. `api-security-best-practices`
5. `testing-qa` con pruebas de retry, duplicado y caída de Redis
6. `production-audit` antes de producción

### Cambio del MCP Server

1. `res-ex-machina`
2. `mcp-builder` o `mcp-tool-developer`
3. `agent-tool-builder`
4. `auth-implementation-patterns` si cambia el modo HTTP/write
5. `container-security-hardening` si cambia el runtime
6. `testing-qa` y smoke test del tarball

### Auditoría o preparación de release

1. `res-ex-machina`
2. `repo-maintainer`
3. `security-audit`
4. `code-review-and-quality`
5. `pre-release-review`
6. `container-security-hardening`
7. `docs-guard`
8. `verification-before-completion`

## Gates Mínimos

Un cambio de código no debe considerarse listo hasta comprobar, según alcance:

```text
typecheck → lint:strict → unit tests → coverage → build
→ integration tests → artifact/tarball smoke test → security review
```

Para cambios de schema añadir:

```text
fresh PostgreSQL → migrate → schema inspection → rollback/recovery review
```

Para cambios de colas o pagos añadir:

```text
duplicate delivery → concurrent execution → retry → crash recovery
```

## Skills No Aplicables por Defecto

No cargar skills de frontend, SEO, mobile, marketing, scraping o documentos
ofimáticos salvo que la tarea toque explícitamente esas superficies. Mantener
el contexto centrado en API, persistencia, criptografía, colas, MCP y release.

## Referencias del Proyecto

- [`res-ex-machina`](../../README.md)
- [`Developer Guide`](./developer-guide-v1.md)
- [`Security Audit 2026-08-08`](../20-security/audit-report-2026-08-08.md)
- [`Contributing`](../../CONTRIBUTING.md)
- [`skills-lock.json`](../../skills-lock.json)
