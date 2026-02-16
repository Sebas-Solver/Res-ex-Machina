# Error Catalog — Res ex Machina API v1

> **Versión**: 1.0  
> **Fecha**: 2026-02-10  

---

## Formato de error

Todos los errores siguen este formato JSON:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Descripción legible del error",
    "details": {}
  }
}
```

- `code`: Código de error único (snake_case, en inglés)
- `message`: Descripción humana (en inglés)
- `details`: Objeto opcional con contexto adicional (nunca contiene datos sensibles)

---

## Errores por endpoint

### POST /v1/records

| HTTP | Código | Descripción | Cuándo |
|---|---|---|---|
| 400 | `invalid_payload` | Request body malformado o incompleto | Falta campo required, JSON inválido |
| 400 | `invalid_content_hash` | content_hash no cumple formato `sha256:{64hex}` | Formato incorrecto |
| 400 | `invalid_pog_schema` | pog_bundle no cumple schema PoG v1 | Campos faltantes, tipos incorrectos |
| 400 | `invalid_pog_version` | schema_version del PoG no es "pog-v1" | Versión no soportada |
| 400 | `invalid_tags` | Tags inválidos (más de 10, vacíos, o tipo incorrecto) | Array malformado |
| 400 | `invalid_visibility` | Valor no permitido para visibility | No es proof_only / input_hash_only / content_optional |
| 400 | `payload_too_large` | Request body excede límite de tamaño | Body > 64KB o pog_bundle > 16KB |
| 401 | `invalid_signature` | Firma EIP-712 inválida o no verificable | Firma malformada o corrupt |
| 401 | `signer_mismatch` | Signer recuperado ≠ agent_wallet del PoG | Wallet del firmante no coincide |
| 402 | `fee_not_verified` | fee_tx_hash no verificado on-chain | Tx no encontrada o no confirmada |
| 402 | `fee_insufficient` | Monto del fee insuficiente | value < fee mínimo |
| 402 | `fee_wrong_recipient` | Destinatario del fee incorrecto | to ≠ fee_receiver_address |
| 402 | `fee_tx_expired` | Transacción de fee demasiado antigua | Tx > 24h |
| 409 | `fee_tx_reused` | fee_tx_hash ya usado en otro record | Reutilización de pago |
| 409 | `duplicate_content_hash` | Ya existe un record con este content_hash | Idempotencia |
| 409 | `duplicate_nonce` | Este nonce ya fue usado por esta wallet | Anti-replay |
| 429 | `rate_limit_exceeded` | Demasiadas solicitudes por esta wallet | Superado el límite por ventana |

### GET /v1/records/mine

| HTTP | Código | Descripción | Cuándo |
|---|---|---|---|
| 401 | `missing_auth_headers` | Faltan headers de autenticación | No se envían X-Wallet-Address, X-Signature o X-Timestamp |
| 401 | `invalid_wallet_address` | Dirección de wallet inválida | X-Wallet-Address no cumple formato 0x + 40 hex |
| 401 | `auth_timestamp_expired` | Timestamp fuera de ventana | X-Timestamp inválido o fuera de la ventana de 5 minutos |
| 401 | `auth_signature_invalid` | Firma de wallet inválida | La firma EIP-191 no corresponde a la wallet declarada |

### GET /v1/records/{id}

| HTTP | Código | Descripción | Cuándo |
|---|---|---|---|
| 400 | `invalid_record_id` | ID no es un UUID válido | Formato incorrecto |
| 404 | `record_not_found` | No existe un record con este ID | UUID válido pero inexistente |

### GET /v1/records/verify?content_hash={hash}

| HTTP | Código | Descripción | Cuándo |
|---|---|---|---|
| 400 | `invalid_content_hash` | Hash no cumple formato requerido | Formato incorrecto |
| 404 | `record_not_found` | No existe un record con este hash | Hash válido pero no registrado |

### GET /v1/records/{id}/export

| HTTP | Código | Descripción | Cuándo |
|---|---|---|---|
| 400 | `invalid_record_id` | ID no es un UUID válido | Formato incorrecto |
| 404 | `record_not_found` | No existe un record con este ID | UUID válido pero inexistente |

### GET /v1/health

| HTTP | Código | Descripción | Cuándo |
|---|---|---|---|
| — | — | Este endpoint siempre devuelve 200 | Nunca falla (devuelve status: degraded si hay problemas) |

---

## Errores globales

| HTTP | Código | Descripción | Cuándo |
|---|---|---|---|
| 405 | `method_not_allowed` | Método HTTP no soportado | DELETE en cualquier endpoint, PUT en records |
| 415 | `unsupported_media_type` | Content-Type no es application/json | Header incorrecto |
| 500 | `internal_error` | Error interno del servidor | Error no esperado (nunca expone detalles) |
| 503 | `service_unavailable` | Servicio temporalmente no disponible | Mantenimiento o fallo de dependencias |

---

## Principios de errores

1. **Nunca exponer detalles técnicos** — No revelar stack traces, rutas, queries SQL, ni nombres de tablas.
2. **Códigos únicos y estables** — Un mismo código siempre significa lo mismo. Una vez publicado, no cambia.
3. **Mensajes en inglés** — Los mensajes son para desarrolladores, no para usuarios finales.
4. **Details opcionales** — Solo incluir contexto útil para debugging (ej: `{"field": "content_hash", "expected": "sha256:{64hex}"}`).
5. **Errores inmutables** — Añadir nuevos códigos es OK. Cambiar el significado de uno existente, NUNCA.
