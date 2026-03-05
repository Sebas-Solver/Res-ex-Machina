# ⚖️ Ejecutar Res ex Machina — Guía paso a paso

## 🆕 Primera vez (instalación completa)

### 1. Clonar el repositorio

```bash
cd ~/Documentos/ANTIGRAVITY
git clone https://github.com/Sebas-Solver/Res-ex-Machina.git
cd Res-ex-Machina
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Crear archivo de configuración

```bash
cp .env.example .env
```

> No hace falta modificar nada del `.env` para desarrollo local. Los valores por defecto ya apuntan a los servicios Docker.

### 4. Arrancar los servicios de infraestructura

```bash
docker compose up -d postgres redis anvil
```

Esto levanta 3 contenedores:

| Servicio | Puerto | Para qué sirve |
|---|---|---|
| **PostgreSQL** | 5432 | Base de datos de records y webhooks |
| **Redis** | 6379 | Cola de jobs (BullMQ) y rate limiting |
| **Anvil** | 8545 | Blockchain local de pruebas |

> ⏳ La primera vez tarda unos minutos en descargar las imágenes Docker.

### 5. Crear las tablas en la base de datos

```bash
npx drizzle-kit push
```

### 6. Arrancar la API

```bash
npm run dev
```

Cuando veas este mensaje, la API está lista:

```
⚖️  Res ex Machina API listening on port 3000
```

### 7. Verificar que todo funciona

En **otra terminal** (sin cerrar la anterior):

```bash
curl -s http://localhost:3000/v1/health | python3 -m json.tool
```

Deberías ver los 3 checks en `"ok"`:

```json
{
    "status": "ok",
    "checks": {
        "database": { "status": "ok" },
        "redis": { "status": "ok" },
        "blockchain": { "status": "ok" }
    }
}
```

✅ **¡Listo! Res ex Machina está funcionando.**

---

## 🔄 Siguientes veces (ya está todo instalado)

### Arrancar todo

```bash
cd ~/Documentos/ANTIGRAVITY/Res-ex-Machina

# 1. Levantar servicios Docker
docker compose up -d postgres redis anvil

# 2. Arrancar la API
npm run dev
```

### Parar todo

```bash
# Parar la API → Ctrl+C en la terminal donde esté corriendo

# Parar los servicios Docker
cd ~/Documentos/ANTIGRAVITY/Res-ex-Machina
docker compose down
```

> 💡 Usar `docker compose down` para los contenedores. Los datos de PostgreSQL y Redis se conservan entre reinicios gracias a los volúmenes Docker.

---

## 🧪 Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Arrancar API en modo desarrollo (hot reload) |
| `npm test` | Ejecutar los 73 tests |
| `npm run test:coverage` | Tests con informe de cobertura |
| `npm run check` | TypeScript + ESLint + Tests (todo junto) |
| `npm run lint` | Comprobar estilo del código |
| `npm run build` | Compilar para producción |
| `docker compose logs -f` | Ver logs de los servicios Docker |

---

## ❓ Solución de problemas

**La API dice "degraded":**
→ Los servicios Docker no están corriendo. Ejecuta `docker compose up -d postgres redis anvil`.

**`npm run dev` da error de variables de entorno:**
→ Falta el archivo `.env`. Ejecuta `cp .env.example .env`.

**`npx drizzle-kit push` falla:**
→ PostgreSQL no está arrancado. Ejecuta `docker compose up -d postgres` y espera unos segundos.

**El puerto 3000 está ocupado:**
→ Puede que el contenedor `api` de Docker esté corriendo. Páralo con `docker compose stop api` y usa `npm run dev` en su lugar.
