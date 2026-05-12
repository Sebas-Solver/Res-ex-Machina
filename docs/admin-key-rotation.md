# Rotación del ADMIN_API_KEY

## ¿Cuándo rotar?

- **Inmediatamente** si se sospecha de una filtración de la clave.
- **Cada 90 días** como medida preventiva (recomendado).
- Cuando un miembro del equipo con acceso deja la organización.

## Procedimiento

### 1. Generar una nueva clave

```bash
# Generar una clave de 32 bytes (64 caracteres hex)
openssl rand -hex 32
```

### 2. Actualizar en el servidor de producción

```bash
# Actualizar la variable de entorno
export ADMIN_API_KEY="nueva_clave_generada"

# Si usas Docker Compose:
# Editar .env con la nueva clave y reiniciar
docker compose down && docker compose up -d
```

### 3. Actualizar en GitHub Secrets (CI/CD)

1. Ir a **Settings → Secrets and variables → Actions**
2. Editar `ADMIN_API_KEY` con el nuevo valor
3. Confirmar que el próximo workflow utiliza la clave nueva

### 4. Actualizar clientes

- Notificar a todos los operadores que usen el admin dashboard
- Actualizar cualquier script o herramienta que use la clave antigua

### 5. Verificar

```bash
# Verificar que la nueva clave funciona
curl -H "X-Admin-Key: nueva_clave" https://tu-dominio.com/admin/stats

# Verificar que la clave antigua ya NO funciona
curl -H "X-Admin-Key: clave_antigua" https://tu-dominio.com/admin/stats
# Debe devolver 401 Unauthorized
```

### 6. Registrar la rotación

Documentar la fecha de rotación y el motivo en el log de operaciones.

## Notas de seguridad

- **Nunca** guardar la clave en archivos dentro del repositorio.
- La clave nunca se registra completa en logs (solo un fingerprint de 8 chars).
- Si se detecta un intento fallido de autenticación admin en los logs (`admin_auth_failed`),
  considerar rotar inmediatamente.
