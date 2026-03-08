# 🧪 Probar Res ex Machina en 5 minutos

> Guía rápida para desarrolladores que quieran probar la API.
>
> **⚠️ Versión alpha** — Testnet Base Sepolia. Los datos pueden ser borrados.

---

## Requisitos previos

| Requisito | Qué necesitas |
|-----------|---------------|
| **Node.js** | v20 o superior ([descargar](https://nodejs.org/)) |
| **Wallet Ethereum** | Una clave privada de una wallet de test (nunca uses tu wallet real) |
| **ETH de testnet** | Gratis en el faucet de Base Sepolia |

> ⚠️ **NUNCA uses una wallet con fondos reales.** Crea una wallet nueva solo para tests. Puedes crearla con MetaMask o con cualquier generador.

---

## Paso 1: Conseguir ETH de testnet (gratis)

El fee de registro cuesta ~0.01 ETH en Base Sepolia (una testnet, el ETH no tiene valor real).

1. Ve a **[Optimism Console (Superchain Faucet)](https://console.optimism.io/faucet)**
2. Conecta tu wallet o pega tu dirección
3. Selecciona **Base Sepolia** como red
4. Haz clic en "Claim" para recibir ETH de prueba
5. Recibirás ETH en ~30 segundos

> **Alternativa:** [Coinbase Base Sepolia Faucet](https://portal.cdp.coinbase.com/products/faucet)

---

## Paso 2: Ejecutar el test E2E (opción recomendada)

### 2a. Clonar el repositorio

```bash
git clone https://github.com/Sebas-Solver/Res-ex-Machina.git
cd Res-ex-Machina
npm install
```

### 2b. Configurar tu wallet

Crea un archivo `.env` en la raíz del proyecto:

```env
TEST_AGENT_PRIVATE_KEY=0xTU_CLAVE_PRIVADA_AQUI
```

### 2c. Ejecutar el test

```bash
npx tsx scripts/test-alpha.ts
```

El script hace todo automáticamente:
1. ✅ Verifica que la API está online
2. 💰 Comprueba tu balance
3. 💸 Paga el fee en Base Sepolia
4. ✍️ Firma el PoG bundle con EIP-712
5. 🚀 Crea el registro en la API
6. ⚓ Espera el anchoring (~30s)
7. 📋 Exporta el receipt verificable
8. 🔍 Verifica por content_hash

### Output esperado

```
═══════════════════════════════════════════
  🧪 Test E2E — Res ex Machina Alpha
═══════════════════════════════════════════

🔑 Wallet del agente: 0xTU_WALLET...
📡 Paso 0: Verificando que la API está online...
   ✅ API OK (DB: 12ms, Redis: 8ms, Blockchain: 150ms)

💸 Paso 3: Enviando fee de 0.0002 ETH...
   ✅ Confirmada en bloque 12345678

🚀 Paso 5: Enviando record a la API...
   ✅ Record creado exitosamente!

⚓ Paso 6: Esperando anchoring...
   ✅ ¡ANCLADO EN BLOCKCHAIN!
   🔗 Tx: https://sepolia.basescan.org/tx/0x...
```

---

## Paso 3: Probar manualmente con curl (alternativa)

Si prefieres probar endpoint por endpoint:

### Health check
```bash
curl https://res-ex-machina-api.onrender.com/v1/health
```

### Consultar un registro existente
```bash
# Reemplaza :id con un record_id real
curl https://res-ex-machina-api.onrender.com/v1/records/:id
```

### Verificar por hash
```bash
curl "https://res-ex-machina-api.onrender.com/v1/records/verify?content_hash=sha256:abc123..."
```

### Exportar receipt
```bash
# Modo completo
curl https://res-ex-machina-api.onrender.com/v1/records/:id/export

# Modo compacto (solo campos de verificación)
curl "https://res-ex-machina-api.onrender.com/v1/records/:id/export?mode=compact"
```

> **Nota:** Para crear registros con POST necesitas firmar con EIP-712. Usa el script `test-alpha.ts` o la colección de Postman incluida.

---

## Paso 4: Importar colección Postman (opcional)

1. Abre Postman
2. Click en **Import** > **File**
3. Selecciona `Docs/postman-collection.json` del repositorio
4. Los endpoints GET funcionarán directamente
5. Para POST, necesitas configurar las variables de la colección

---

## API de referencia rápida

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/v1/health` | GET | Estado del sistema |
| `/v1/records` | POST | Crear registro |
| `/v1/records` | GET | Listar records por wallet (filtros, paginación) |
| `/v1/records/batch` | POST | Crear hasta 100 registros en una llamada |
| `/v1/records?wait_for_anchor=true` | POST | Crear + esperar anchoring (max 25s) |
| `/v1/records/:id` | GET | Consultar registro |
| `/v1/records/mine` | GET | Mis registros (requiere walletAuth EIP-191) |
| `/v1/records/verify?content_hash=` | GET | Verificar por hash |
| `/v1/records/:id/export` | GET | Export completo |
| `/v1/records/:id/export?mode=compact` | GET | Export compacto |
| `/v1/webhooks` | POST | Registrar webhook (requiere walletAuth) |
| `/v1/webhooks` | GET | Listar webhooks propios |
| `/v1/webhooks/:id` | DELETE | Desactivar webhook |

**Base URL:** `https://res-ex-machina-api.onrender.com`

> ⚠️ La instancia de Render se "duerme" tras 15 min de inactividad. La primera llamada puede tardar ~30s en despertar.

---

## Novedades alpha.2

| Feature | Qué hace |
|---------|----------|
| `wait_for_anchor=true` | Espera hasta 25s a que el anchoring se complete en una sola llamada |
| `state_info` | Cada respuesta incluye `terminal`, `retryable` y `description` |
| `explorer_url` | URLs directas a BaseScan/Etherscan en los bloques `anchor` y `fee` |
| `mode=compact` | Export reducido ideal para agentes IA (ahorra tokens) |

---

## Troubleshooting

| Error | Causa | Solución |
|-------|-------|----------|
| `ECONNREFUSED` | La API está dormida (Render free tier) | Espera ~30s y reintenta |
| `fee_not_verified` | La tx de fee no se ha confirmado aún | Espera unos segundos y reintenta |
| `rate_limit_exceeded` | Demasiadas requests | Espera el tiempo indicado en `Retry-After` |
| `insufficient balance` | No tienes ETH en Base Sepolia | Usa el faucet (paso 1) |
| `duplicate_content_hash` | Ese contenido ya fue registrado | Normal si ejecutas el test dos veces con el mismo contenido |

---

## ¿Necesitas ayuda?

- 📖 [Developer Guide completo](./developer-guide-v1.md)
- 🔐 [Receipt Verification Spec](./receipt-verification-spec.md)
- 📝 [Guía para no-programadores](./guia-rxm-v1.md)
- 🐛 [Abrir un issue en GitHub](https://github.com/Sebas-Solver/Res-ex-Machina/issues)
