# Arquitectura del Servidor MCP (v1.0.0)

> **Version**: 1.0  
> **Date**: 2026-05-13  
> **Status**: Approved for Alpha  

Este documento detalla la arquitectura para implementar el servidor MCP (Model Context Protocol) de Res-ex-Machina (RxM). El servidor funcionará como un integrador seguro entre los clientes LLM (agentes) y la blockchain, garantizando un control estricto sobre las operaciones financieras y los datos.

## Modelo de Seguridad: Sidecar Criptográfico con Aislamiento de Secretos

**Cryptographic Sidecar with Tool-Level Guardrails:**
El servidor MCP de RxM actuará como un sidecar criptográfico local. El LLM nunca accede a claves privadas, RPCs ni direcciones de pago arbitrarias. El servidor expone tools de alto nivel, y aplica límites de gasto persistentes, límites de registros y allowlists de red de forma independiente al LLM.

**Read-only by Default:**
Por defecto, el MCP arranca en modo de solo lectura. Las tools que firman o pagan solo se activan si `MCP_ENABLE_WRITE_TOOLS=true` y existe una private key válida.

---

## 1. Configuración y Secretos

El servidor no usará mnemonics en la v0.1 para minimizar la superficie de ataque. Los secretos se inyectarán vía variables de entorno.

**Configuración Core & Network**
```env
MCP_TRANSPORT=stdio
MCP_API_URL=https://res-ex-machina-api.onrender.com/v1
MCP_RPC_URL=https://sepolia.base.org
MCP_CHAIN_ID=84532
MCP_ALLOWED_CHAIN_IDS=84532
MCP_ALLOW_MAINNET=false
MCP_FEE_RECEIVER_ADDRESS=0x...
```

**Transporte HTTP (Seguridad Adicional)**
```env
MCP_HTTP_HOST=127.0.0.1
MCP_HTTP_PORT=8787
MCP_HTTP_AUTH_TOKEN=your_secure_token
MCP_ALLOW_REMOTE_HTTP=false
```

**Autenticación y Permisos**
```env
MCP_PRIVATE_KEY=0x... (Requerido solo para write tools)
MCP_WALLET_ADDRESS=0x... (Permite balance read-only sin exponer private key)
MCP_ENABLE_WRITE_TOOLS=false
MCP_CONFIRMATION_MODE=require # require | auto | dry-run
MCP_RECORDING_POLICY=explicit
```

**Guardrails Financieros**
```env
MCP_MAX_RXM_FEE_WEI=10000000000000000
MCP_MAX_GAS_COST_WEI=500000000000000
MCP_MAX_TOTAL_TX_COST_WEI=10500000000000000
MCP_MAX_SPEND_PER_DAY_WEI=50000000000000000
MCP_MAX_RECORDS_PER_DAY=20
MCP_SPEND_STATE_PATH=~/.rxm-mcp/state.sqlite
```

---

## 2. Arquitectura del Ledger

El ledger local no estará acoplado rígidamente a un motor de base de datos específico para evitar problemas de compilación en ciertos entornos. Utilizará un diseño de puertos y adaptadores:
- `src/ledger/Ledger.ts` (Interfaz abstracta)
- `src/ledger/SqliteLedger.ts` (Implementación principal con better-sqlite3)
- `src/ledger/MemoryLedger.ts` (Implementación para tests/fallback)

El ledger almacena:
- Operaciones financieras exitosas.
- **Intentos fallidos de auditoría** (bloqueo por límites superados, modo dry-run, fallos de mismatch, bloqueos HTTP, etc.).

---

## 3. Integración con la API y Comportamiento Agéntico

Para alinear el MCP con el catálogo de errores de RxM (`Docs/10-specs/error-catalog.md`) y el sistema de colas (`BullMQ`), el MCP operará de la siguiente manera:

1. **Gestión de Colas Asíncronas**: 
   - El agente llama a `rxm_confirm_record_generation`. 
   - El servidor delega al SDK (`rxm.recordHash`), que hace POST a `/v1/records`. 
   - La API de RxM añade el registro a su `anchorQueue` en Redis de forma asíncrona y responde inmediatamente.
   - El MCP devuelve el estado `pending_anchor` al agente en 1-2 segundos. El agente puede seguir su trabajo y comprobar el resultado final on-chain usando `rxm_get_receipt` minutos más tarde, sin quedarse bloqueado esperando a la blockchain.

2. **Llamadas Múltiples (Batching)**:
   - El protocolo MCP soporta llamadas en paralelo a tools. El agente de IA puede generar múltiples hashes y llamar a `rxm_prepare_record_generation` concurrentemente.
   - Si el agente abusa de la API, el Ledger bloqueará preventivamente los registros usando la validación de estado local (`MCP_MAX_RECORDS_PER_DAY`).

3. **Fallos de Conexión y Catálogo de Errores**:
   - Todo timeout de red o error de API (`500 internal_error`, `503 service_unavailable`, `429 rate_limit_exceeded`) que reciba el SDK se atrapará de forma segura en el servidor MCP y se enviará al cliente LLM usando el standard MCP `isError: true` junto con un mensaje claro basado en `error-catalog.md`.
   - El agente verá el error humano y podrá decidir reintentar tras unos minutos.

4. **Prevención de Duplicados**:
   - Si se envía un registro que ya existe, la API de RxM devolvería un error `409 duplicate_content_hash`.
   - Para ahorrar gas de firma innecesario, el servidor MCP implementa un chequeo preventivo haciendo un pre-flight a `rxm_verify_hash`. Si existe, se devuelve un éxito indicando que ya está registrado, evitando que el agente asuma un fallo o pague doble.

---

## 4. Flujo de Escritura y Tools Expuestas al LLM

1. **`rxm_hash_content` (Read-only)**
2. **`rxm_verify_hash` (Read-only)**
3. **`rxm_verify_content` (Read-only)**
4. **`rxm_get_wallet_balance` (Read-only)**
5. **`rxm_get_receipt` (Read-only)**

**Flujo de Escritura en 2 Fases (Requiere `MCP_ENABLE_WRITE_TOOLS=true`)**

Para cumplir con las guías de seguridad MCP (OWASP) sobre confirmación humana explícita (`MCP_CONFIRMATION_MODE=require`), el MCP usa un flujo estricto:

6. **`rxm_prepare_record_generation`**
   - **Input**: `content`, `content_hash`, `model_id`, `tags`, `content_type`, `human_intervention` (`none`, `prompt_only`, `supervised`, `collaborative`, `unknown`).
   - **Lógica**: Prepara estimaciones, hace chequeo previo de duplicados y devuelve un `confirmation_id` efímero. No firma ni paga. (Este paso asume el rol de confirmación en la UI del host).
   
7. **`rxm_confirm_record_generation`**
   - **Input**: `confirmation_id`.
   - **Lógica**: Consume el `confirmation_id` una sola vez, chequea el ledger, firma, paga y registra usando la nueva función de bajo nivel `recordHash()` del SDK (para que el servidor no procese contenido en plano si no es necesario).

8. **`rxm_record_generation`** (Fast-path Automático)
   - Operación directa "One-Click" autorizada únicamente si `MCP_CONFIRMATION_MODE=auto`.

9. **`rxm_set_confirmation_mode`**
   - Cambia temporalmente la configuración de modo (`require`, `auto`, `dry-run`) durante la ejecución, dando control dinámico al humano.

---

## 5. Próximos Pasos en la Implementación
1. Implementar `rxm.recordHash()` en el SDK oficial.
2. Refactorizar el servidor MCP para separar el `Ledger` en interfaces abstractas.
3. Añadir middleware HTTP seguro para soporte remoto opcional y blindado.
4. Extender la suite de tests unitarios del paquete `mcp-server`.
