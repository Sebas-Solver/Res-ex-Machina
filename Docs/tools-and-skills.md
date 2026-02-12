# Herramientas y Skills Disponibles

Este proyecto aprovecha un conjunto de **Skills de Antigravity** y **servidores MCP** para potenciar el desarrollo, testing y mantenimiento.

## 1. Antigravity Skills

El índice completo de skills disponibles se encuentra en:
`C:\Users\berke\.gemini\antigravity\skills_index.md`

### Skills Personales (Custom)
Estas skills están mantenidas manualmente en `C:\Users\berke\.gemini\antigravity\skills\custom` y **no se pierden** al actualizar las comunitarias:
- **Obsidian**: `obsidian-vault-reader`, `obsidian-note-manager`, `obsidian-daily-notes`.
- **Legal**: `boe-extractor`, `legal-citation-parser`.
- **Marketing**: `seo-copywriting-expert`.
- **Utilidades**: `orphan-finder`, `find-skills`.

### Skills de Blockchain y Web3 (Comunitarias)
Skills directamente relacionadas con la capa blockchain del proyecto:

| Skill | Descripción | Relevancia |
|-------|-------------|------------|
| `blockchain-developer` | Desarrollo Web3 completo: Viem, Ethers.js, EVM, Layer 2, smart contracts, seguridad | ⭐ Cubre toda la interacción con blockchain del proyecto |
| `web3-testing` | Testing de smart contracts con Hardhat/Foundry, fuzzing, mainnet forking | Testing de integración blockchain |
| `solidity-security` | Auditoría de smart contracts, vulnerabilidades, patrones seguros | Seguridad de contratos y anclaje |
| `bullmq-specialist` | BullMQ expert: colas Redis, jobs diferidos, workers, patrones de concurrencia | ⭐ Aplica directamente al `anchor.worker.ts` |

### Skills de Desarrollo General (Comunitarias)
Skills que cubren el resto del stack tecnológico:

| Skill | Descripción |
|-------|-------------|
| `typescript-pro` / `typescript-expert` | TypeScript avanzado con tipos genéricos |
| `docker-expert` | Contenedores y Docker Compose |
| `api-patterns` | Patrones de diseño de APIs REST |
| `api-security-best-practices` | Seguridad de APIs (rate limiting, CORS, autenticación) |
| `api-documentation-generator` | Generación de documentación OpenAPI |
| `testing-patterns` | Workflows de testing (Jest/Vitest) |

### Skills Disponibles para Instalar
Encontradas con `npx skills find` pero **aún no instaladas**. Si se instalan, deben ir en la carpeta `custom` para no perderse al actualizar las comunitarias:

| Skill | Comando de instalación | Utilidad |
|-------|----------------------|----------|
| `drizzle-migrations` | `npx skills add bobmatnyc/claude-mpm-skills@drizzle-migrations -g -y` | Migraciones con Drizzle ORM |
| `viem-siwe` | Disponible en skills.sh (buscar "viem") | Sign-In with Ethereum con viem |

> **⚠️ Importante**: Las skills comunitarias están en `C:\Users\berke\.gemini\antigravity\skills\skills\` y se actualizan con `git pull`. Las nuevas skills que se instalen deben colocarse en la carpeta `custom` para que no se sobreescriban.

## 2. MCP Servers (Herramientas Externas)

Podemos utilizar servidores MCP adicionales para tareas específicas de revisión y testing automatizado.

### GitHub MCP
Integrado para gestión de issues, PRs y búsquedas en el repositorio.
- **Uso**: Crear issues, listar PRs, comentar en reviews.

### Context7
Documentación actualizada de librerías y frameworks.
- **Uso**: Consultar docs de viem, Fastify, BullMQ, Drizzle u otras dependencias en tiempo real.

### TestSprite
Plataforma de testing autónomo.
- **Uso**: Generación automática de casos de prueba E2E y unitarios complejos.
- **Convenio**: Invocar para aumentar la cobertura de tests en módulos críticos (ej. `src/services/anchor.ts`).

### Semgrep
Análisis estático de código (SAST).
- **Uso**: Escaneo de seguridad y calidad de código.
- **Convenio**: Ejecutar periódicamente para detectar vulnerabilidades (OWASP Top 10) y antipatrones antes de releases mayores.

---

> **Nota**: Para utilizar TestSprite o Semgrep, asegúrate de que los servidores MCP correspondientes estén configurados en `mi-antigravity-config`.

---
*Última actualización: 2026-02-12*
