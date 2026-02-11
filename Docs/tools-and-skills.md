# Herramientas y Skills Disponibles

Este proyecto aprovecha un conjunto de **Skills de Antigravity** y **servidores MCP** para potenciar el desarrollo, testing y mantenimiento.

## 1. Antigravity Skills

El índice completo de skills disponibles se encuentra en:
`C:\Users\berke\.gemini\antigravity\skills_index.md`

### Skills Personales (Custom)
Estas skills están mantenidas manualmente en `tools/custom` y son específicas para nuestro flujo de trabajo:
- **Obsidian**: `obsidian-vault-reader`, `obsidian-note-manager`, `obsidian-daily-notes`.
- **Legal**: `boe-extractor`, `legal-citation-parser`.
- **Marketing**: `seo-copywriting-expert`.
- **Utilidades**: `orphan-finder`, `find-skills`.

### Skills de Desarrollo Relevantes
- `typescript-pro`: Expert TypeScript patterns.
- `nodejs-backend`: Node.js backend best practices.
- `docker-expert`: Container orchestration.
- `postgres-patterns`: Database optimization.
- `testing-patterns`: Jest/Vitest workflows.
- `security-audit`: Vulnerability assessment.

## 2. MCP Servers (Herramientas Externas)

Podemos utilizar servidores MCP adicionales para tareas específicas de revisión y testing automatizado.

### GitHub MCP
Integrado para gestión de issues, PRs y búsquedas en el repositorio.
- **Uso**: Crear issues, listar PRs, comentar en reviews.

### TestSprite (Opcional)
Plataforma de testing autónomo.
- **Uso potencial**: Generación automática de casos de prueba E2E y unitarios complejos.
- **Convenio**: Invocar para aumentar la cobertura de tests en módulos críticos (ej. `src/services/anchor.ts`).

### Semgrep (Opcional)
Análisis estático de código (SAST).
- **Uso potencial**: Escaneo de seguridad y calidad de código.
- **Convenio**: Ejecutar periódicamente para detectar vulnerabilidades (OWASP Top 10) y antipatrones antes de releases mayores.

---

> **Nota**: Para utilizar TestSprite o Semgrep, asegúrate de que los servidores MCP correspondientes estén configurados en `mari-antigravity-config`.
