# 🚀 Guía del Deploy Alpha — Res ex Machina

> Documento de referencia: todo lo que se configuró el 12/02/2026 para poner la API en producción.

---

## ¿Qué hemos hecho?

Hemos pasado Res ex Machina de funcionar **solo en tu ordenador** (localhost) a estar **disponible públicamente en internet**. Cualquier persona (o agente de IA) con la URL puede registrar creaciones.

**URL pública:** `https://res-ex-machina-api.onrender.com`

---

## Servicios donde te has registrado

Estos son los 4 servicios cloud que usamos. **Todos son gratuitos**.

### 1. Render.com — El servidor de la API

| | |
|---|---|
| **Qué es** | Un servicio cloud que ejecuta tu código y lo hace accesible por internet |
| **Para qué lo usamos** | Ejecutar la API de Res ex Machina (el servidor Fastify + el worker de anclaje) |
| **Plan** | Free (750 horas/mes) |
| **URL del panel** | [dashboard.render.com](https://dashboard.render.com) |
| **Tu servicio** | `res-ex-machina-api` (Web Service, Docker) |

**Cosas importantes:**
- El plan gratuito **apaga el servidor** si no recibe tráfico en ~15 minutos. La primera petición después tarda ~30 segundos (se llama "cold start")
- El servidor escucha en el **puerto 10000** (no el 3000 que usamos en local)
- El Health Check Path está configurado como `/` (la ruta raíz)

---

### 2. Neon — La base de datos PostgreSQL

| | |
|---|---|
| **Qué es** | PostgreSQL en la nube (como tener tu base de datos en internet) |
| **Para qué lo usamos** | Guardar todos los records registrados, sus hashes, estados, etc. |
| **Plan** | Free (0.5 GB de almacenamiento) |
| **URL del panel** | [console.neon.tech](https://console.neon.tech) |
| **Variable de entorno** | `DATABASE_URL` (la URL de conexión que pusiste en Render) |

**Cosas importantes:**
- La conexión usa **SSL** (cifrada), incluido en la URL automáticamente
- El schema de la base de datos se migró con `drizzle-kit push`
- Si algún día necesitas ver los datos directamente, Neon tiene un **SQL Editor** en su panel

---

### 3. Upstash — La cola Redis

| | |
|---|---|
| **Qué es** | Redis en la nube (una base de datos ultrarrápida para colas de trabajo) |
| **Para qué lo usamos** | La cola BullMQ que gestiona los trabajos de anclaje en blockchain |
| **Plan** | Free (10.000 comandos/día) |
| **URL del panel** | [console.upstash.com](https://console.upstash.com) |
| **Variable de entorno** | `REDIS_URL` (usa `rediss://` con doble S = conexión cifrada TLS) |

**Cosas importantes:**
- Upstash requiere **TLS** (conexión cifrada) — por eso la URL empieza con `rediss://` en vez de `redis://`
- También requiere **password** — viene incluido en la URL
- Tuvimos que actualizar 3 archivos del código para soportar esto: `queue.ts`, `anchor.worker.ts`, y `health.ts`

---

### 4. Base Sepolia — La blockchain de prueba

| | |
|---|---|
| **Qué es** | La red de pruebas (testnet) de Base, una blockchain L2 de Coinbase |
| **Para qué lo usamos** | Anclar los hashes de los records en la blockchain (inmutabilidad) |
| **Plan** | Gratis (es una testnet, el ETH no tiene valor real) |
| **RPC URL** | `https://sepolia.base.org` |
| **Chain ID** | `84532` |
| **Explorer** | [sepolia.basescan.org](https://sepolia.basescan.org) |

**Cosas importantes:**
- El ETH de testnet es gratuito y se obtiene en **faucets** (grifos)
- Tu wallet de **usuario de prueba** tiene fondos para pagar fees
- La wallet de **RxM** (la que ancla) necesita fondos para pagar gas → usa un faucet como [Alchemy](https://www.alchemy.com/faucets/base-sepolia)

---

## Variables de entorno en Render

Estas son **todas** las variables que configuraste en Render → Environment:

| Variable | Valor | Para qué sirve |
|---|---|---|
| `PORT` | `10000` | Puerto donde escucha la API (Render lo requiere) |
| `NODE_ENV` | `production` | Modo producción (activa el worker inline) |
| `LOG_LEVEL` | `info` | Nivel de logs |
| `DATABASE_URL` | `postgresql://...@...neon.tech/...` | Conexión a la base de datos Neon |
| `REDIS_URL` | `rediss://default:...@...upstash.io:6379` | Conexión a Redis Upstash (con TLS) |
| `L2_RPC_URL` | `https://sepolia.base.org` | URL del nodo blockchain |
| `L2_CHAIN_ID` | `84532` | ID de la cadena Base Sepolia |
| `FEE_RECEIVER_ADDRESS` | `0x...` | Dirección que recibe los fees |
| `FEE_MINIMUM_AMOUNT` | `0.0001` | Fee mínimo en ETH (bajo para testnet) |
| `FEE_TX_MAX_AGE_HOURS` | `24` | Máximo horas de antigüedad del pago |
| `ANCHOR_WALLET_PRIVATE_KEY` | `0x...` (secreto) | Clave privada de la wallet que ancla |

> [!CAUTION]
> La `ANCHOR_WALLET_PRIVATE_KEY` es **secreta**. Nunca la compartas ni la pongas en el código. Render la guarda cifrada.

---

## Cambios que hicimos en el código

| Archivo | Qué cambiamos | Por qué |
|---|---|---|
| `src/services/queue.ts` | Añadido TLS y password a Redis | Upstash requiere conexión cifrada |
| `src/workers/anchor.worker.ts` | Añadido TLS y password a Redis | Mismo motivo |
| `src/routes/health.ts` | Añadido TLS y password a Redis | El health check también se conecta a Redis |
| `src/app.ts` | Worker inline en producción | El plan gratuito de Render no tiene workers separados |
| `.env.example` | Documentadas opciones cloud | Referencia para futuros desarrolladores |
| `CHANGELOG.md` | Nueva sección alpha.1 | Historial de cambios |
| `README.md` | Badges, URL, roadmap | Reflejar el estado actual del proyecto |

---

## Problemas que encontramos y cómo los resolvimos

### 1. Puerto incorrecto
- **Problema:** Render usa puerto 10000, nosotros teníamos 3000
- **Solución:** Cambiar `PORT=10000` en Render → Environment

### 2. Redis sin TLS
- **Problema:** Upstash requiere `rediss://` (TLS), nuestro código solo soportaba `redis://`
- **Solución:** Actualizar las conexiones Redis en 3 archivos para detectar `rediss://` y activar TLS

### 3. Health check fallaba → deploy fallaba
- **Problema:** El health check creaba su propia conexión Redis sin TLS → fallaba → devolvía 503 → Render pensaba que la app estaba muerta
- **Solución:** Arreglar el health check + cambiar el Health Check Path a `/` como respaldo seguro

---

## Cómo verificar que todo funciona

Abre en el navegador:

1. **`https://res-ex-machina-api.onrender.com/`** — Debe mostrar el JSON de bienvenida
2. **`https://res-ex-machina-api.onrender.com/v1/health`** — Debe mostrar los 3 checks en "ok"

---

## Próximos pasos

1. **Conseguir ETH de testnet** para la wallet de RxM (faucet de Base Sepolia)
2. **Test completo:** Enviar un fee → crear un record → verificar que se ancla
3. **Monitorizar:** Revisar los logs en Render → Logs si algo falla

---

*Documento creado el 12/02/2026 durante el deploy alpha v1.0.0-alpha.1*
