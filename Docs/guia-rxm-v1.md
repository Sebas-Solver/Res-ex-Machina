# Res ex Machina — Guía para Humanos

> * Significa en latin "Cosa hecha por la máquina"* — Un registro donde las IAs dejan constancia de lo que crean.
>
> **⚠️ Versión alpha** — Esta es una versión de pruebas. Los datos pueden ser borrados. Funciona sobre la red de test Base Sepolia.

---

## ¿Qué es Res ex Machina?

Imagina un **registro de obras digitales para la inteligencia artificial**. 

Cuando una IA genera algo — un texto, una imagen, un código, una canción — no queda constancia verificable de quién lo creó, cuándo, ni bajo qué condiciones. Res ex Machina (RxM) resuelve exactamente eso.

RxM es un **registro público, neutral e inmutable** donde los agentes de IA (o las personas que los usan) pueden dejar un sello técnico verificable de que "esta IA generó esto, en este momento, de esta manera". Como un certificado registral, pero automática y para máquinas.

### La analogía del certificado registral

| Notaría/registro tradicional | Res ex Machina |
|---------------------|----------------|
| Vas al notario/registro con un documento | Tu IA envía los datos del output a RxM |
| El notario/registrador pone un sello con fecha | RxM genera un receipt con timestamp inmutable |
| El sello queda en los libros del notario/registro | El registro queda anclado en blockchain |
| Puedes pedir una copia certificada | Puedes exportar el receipt verificable |
| No puedes borrar un acta notarial o certificado registral | No se puede borrar un registro de RxM |

---

## ¿Qué hace RxM?

1. **Registra hechos** — "Esta IA generó este output en este momento"
2. **Genera un recibo verificable** — Un receipt que cualquiera puede comprobar  
3. **Ancla el registro en blockchain** — Para que sea inmutable y no dependas de nosotros
4. **Permite verificar** — ¿Este contenido fue registrado? ¿Cuándo? ¿Por quién?

### ¿Qué información se guarda?

- **Siempre:** la huella digital del contenido (hash), quién lo registró (wallet), cuándo, y los detalles del proceso de generación (qué modelo, qué parámetros, etc.)
- **Nunca:** el contenido real. RxM no guarda tu texto, tu imagen ni tu código. Solo la prueba de que existió.

### ¿Qué NO hace RxM?

| Lo que NO hace | Por qué |
|----------------|---------|
| ❌ No guarda el contenido | Solo guarda la huella digital (como una huella dactilar, no la persona) |
| ❌ No detecta si algo es de IA | Eso es un detector, RxM es un registro *positivo* |
| ❌ No evalúa la calidad | No juzga si algo es bueno o malo |
| ❌ No gestiona derechos de autor | No dice quién "posee" algo, solo quién lo registró |
| ❌ No modera contenido | No decide si algo es apropiado o no |
| ❌ No necesita validación humana | El registro es automático, no hay aprobación previa |

---

## ¿Cómo funciona? (Versión simple)

El proceso tiene 4 pasos:

```
   TU IA                    RxM                    BLOCKCHAIN
   genera algo    →    registra el hecho    →    ancla para siempre
       ↓                    ↓                         ↓
   hash + firma       receipt inmediato         prueba inmutable
```

### Paso a paso:

1. **Tu IA genera un output** (texto, imagen, lo que sea)
2. **Se calcula la huella digital** del output (un código único llamado "hash")
3. **Se firma digitalmente** con la identidad técnica de la IA (su "wallet")
4. **Se paga una tasa** simbólica (anti-spam, ~$0.01)
5. **RxM registra todo** y devuelve un receipt inmediato
6. **En segundo plano**, RxM ancla el registro en blockchain para hacerlo permanente

> **Resultado:** Tienes un receipt que demuestra que tu IA generó ese contenido en ese momento. Nadie puede borrar esa constancia, ni siquiera nosotros.

---

## Conceptos clave (glosario)

| Concepto | Qué es | Analogía |
|----------|--------|----------|
| **Hash** | Huella digital de un archivo. Un código único que identifica el contenido sin revelar el contenido | Como una huella dactilar: identifica sin mostrar a la persona |
| **Wallet** | Identidad técnica digital. Un par de claves criptográficas | Como un DNI electrónico para máquinas |
| **Firma EIP-712** | Firma digital estandarizada que demuestra quién envió el registro | Como la firma electrónica de un documento |
| **Fee** | Tasa simbólica que se paga por cada registro (anti-spam) | Como una tasa administrativa mínima |
| **Receipt** | El comprobante que recibes después de registrar | Como un justificante de registro sellado |
| **Anchoring** | El proceso de grabar el registro en blockchain | Como archivar el justificante en un registro público permanente |
| **PoG (Proof of Generation)** | El "paquete de prueba" con todos los datos de la generación | Como el expediente técnico completo del registro |
| **Blockchain** | Base de datos pública e inmutable compartida por miles de ordenadores | Como un libro contable que nadie puede alterar |

---

## Cosas importantes que debes saber

### ¿Qué es una wallet exactamente?

Una wallet representa una **identidad técnica**. No es necesariamente una persona: puede corresponder a una persona, una empresa, una organización, o un agente de IA autónomo.

Para obtener la mayor granularidad y trazabilidad, se recomienda **usar una wallet diferente por cada agente de IA**. Así cada agente tiene su propia identidad en el registro, y puedes distinguir fácilmente qué agente generó qué contenido. Si usas una sola wallet para todo, todos los registros parecerán del mismo "autor".

### ¿Puede mentir la IA sobre qué modelo usó?

Sí, técnicamente puede. El campo del modelo (`model_id`) es una **afirmación declarativa** del agente. RxM la registra y la firma criptográficamente, pero **no puede verificar universalmente qué modelo se ejecutó realmente**. Funciona de forma similar a una declaración jurada: el agente afirma "yo usé GPT-4o", RxM sella esa afirmación, pero no la comprueba por ti.

¿Qué valor tiene entonces? Mucho:
- **Trazabilidad**: queda constancia de lo que el agente declaró
- **Responsabilidad**: si un agente miente, la mentira queda registrada de forma inmutable
- **Consistencia**: se puede cruzar con otros datos (fechas, modelos disponibles en esa fecha, etc.)
- **Base para mejoras futuras**: estamos investigando formas de verificar o corroborar el modelo utilizado de forma más directa

### ¿Y si dos IAs generan el mismo contenido?

El primer registro gana. RxM registra el **hecho de que alguien envió ese hash en ese momento**, no quién fue el "primero en tener la idea". Si dos agentes generan exactamente el mismo output, solo el primero podrá registrarlo — el segundo recibirá un error de `duplicate_content_hash`. Recuerda que RxM no es un sistema de propiedad intelectual, es un registro de hechos técnicos.

### ¿Y si la blockchain tiene un problema técnico?

El registro se crea **inmediatamente** en la base de datos de RxM (estado `pending_anchor`). El anclaje en blockchain es un paso adicional de permanencia que ocurre en segundo plano. Si la blockchain tiene problemas temporales, tu registro seguirá existiendo en RxM; el sistema reintentará el anclaje automáticamente hasta 5 veces.

---

## ¿Qué pasa si algo falla temporalmente?

RxM está diseñado para **seguir funcionando** incluso cuando partes del sistema tienen problemas. Es como un hospital con un generador de emergencia: si se va la luz principal, los servicios esenciales siguen operando.

### Si Redis se cae (la cola de trabajo)

| Qué pasa | Qué hace RxM |
|----------|-------------|
| El control de velocidad (rate limit) deja de funcionar | **Se desactiva temporalmente** — se permiten todas las solicitudes sin límite hasta que vuelva |
| No se puede poner en cola el anclaje en blockchain | **El registro se guarda igualmente** en la base de datos. Cuando Redis vuelva, el anclaje se procesará |
| El health check muestra "degraded" | Normal. Dice `Retry-After: 30` para que los clientes sepan cuándo volver a intentar |

### Si la blockchain L2 se cae

| Qué pasa | Qué hace RxM |
|----------|-------------|
| No se pueden verificar pagos (fees) | Las peticiones de registro devuelven error 402 (esperado) |
| No se puede anclar | El worker reintenta automáticamente hasta 5 veces |
| El health check muestra "degraded" | Normal |

### Resumen: tus datos están a salvo

> **Lo importante:** Tu registro *nunca se pierde*. Aunque Redis o la blockchain estén temporalmente fuera de servicio, el registro se guarda en la base de datos. Los pasos pendientes (anclaje, cola de trabajo) se completan automáticamente cuando el servicio vuelve.
>
> Además, el health check de la API se refresca cada 30 segundos (tiene una "caché" de 30s). Esto evita hacer cientos de llamadas innecesarias a sistemas que podrían estar saturados.

---

## ¿Cómo se usa la v1.0?

### Importante: v1.0 es solo API

La v1.0 de RxM es una **API** (una interfaz para programas, no para personas). No tiene botones, ni pantalla, ni app. Es como un servicio telefónico: tú llamas con un programa y él te contesta.

Esto significa que para usar RxM v1.0 necesitas:
- Un programa que sepa "hablar" con la API (un agente de IA, un script, o cualquier software)
- Una wallet de Ethereum (identidad técnica)
- Acceso a la red blockchain (para pagar la tasa)

### Las operaciones disponibles

| Operación | Qué hace | Cuándo usarla |
|-----------|----------|---------------|
| **Registrar** | Crea un nuevo registro de generación | Cada vez que tu IA genera algo que quieras certificar |
| **Registrar y esperar** | Igual, pero espera a que se ancle en blockchain antes de responder (max 25s) | Si necesitas la confirmación completa en una sola llamada |
| **Consultar** | Busca un registro por su ID | Si quieres ver los detalles de un registro concreto |
| **Verificar** | Comprueba si existe un registro para un contenido | Si alguien te dice "esto lo generé yo" y quieres verificarlo |
| **Mis registros** | Lista todos los registros de tu agente | Si quieres ver qué ha registrado tu IA (requiere autenticación) |
| **Exportar** | Descarga el receipt completo de un registro | Si necesitas una prueba formal para presentar a alguien |
| **Exportar (compacto)** | Descarga solo los datos esenciales de verificación | Si un agente IA necesita verificar rápidamente (ahorra tokens) |
| **Verificar receipt** | Comprueba que un receipt es auténtico | Si recibes un receipt y quieres confirmar que no ha sido manipulado |

> **Novedad alpha.2:** Los receipts ahora incluyen enlaces directos al explorador blockchain. Puedes hacer clic y ver la transacción directamente en BaseScan, Etherscan, etc. No necesitas buscar tú mismo el hash de la transacción.

### Ejemplo real (simplificado)

Imagina que tienes un agente de IA que genera informes. Quieres que cada informe quede registrado:

1. **Tu agente genera un informe** → calcula su hash: `sha256:a1b2c3d4...`
2. **Tu agente firma** los datos con su wallet y paga la tasa
3. **Tu agente envía** todo a RxM → recibe un receipt con ID `f8d2e7a1-...`
   - *Opción rápida:* si usa `wait_for_anchor=true`, recibe la confirmación completa inmediatamente (sin tener que esperar y volver a consultar)
4. **Días después**, alguien pregunta: "¿Esto lo generó tu IA?"
5. **Verificas** en RxM con el hash del informe → "Sí, registrado el 12/02/2026 a las 14:30"
6. **Exportas** el receipt como prueba formal (o en modo compacto si lo necesita una IA)
7. **El tercero verifica** el receipt con el verificador CLI → `✅ RECORD AUTÉNTICO`

---

## Consultar mis propios registros

> **Novedad alpha.2** — Tu agente puede ahora **listar todos sus registros** usando la operación "Mis registros" (`GET /records/mine`).

### ¿Cómo funciona?

La API necesita comprobar que realmente eres tú quien pide los datos (para que nadie pueda ver los registros de otro). Lo hace mediante un mecanismo de autenticación simple:

1. Tu agente genera una marca de tiempo actual
2. Tu agente firma un mensaje con su wallet que dice: "Soy yo, y estoy pidiendo esto ahora"
3. Tu agente envía la petición junto con la firma
4. RxM comprueba la firma y devuelve solo los registros de esa wallet

Es como **mostrar tu DNI en una ventanilla**: la API verifica tu identidad antes de darte la información.

### ¿Qué datos devuelve?

Una lista con todos los registros que ha hecho tu agente, con paginación (si tienes muchos registros, los devuelve en páginas de 20).

### Posibles errores

| Error | Qué significa | Qué hacer |
|-------|-------------|----------|
| `missing_auth_headers` | Falta la firma de autenticación | Tu agente debe incluir los datos de auth |
| `invalid_wallet_address` | La dirección de wallet no es válida | Verifica que la dirección sea correcta |
| `auth_timestamp_expired` | La marca de tiempo tiene más de 5 minutos | Tu agente debe generar una marca de tiempo nueva |
| `auth_signature_invalid` | La firma no coincide | Verifica que la wallet que firma es la correcta |

> **Nota:** Este sistema de autenticación es diferente al que se usa para registrar (EIP-712). Para listar registros se usa un método más simple llamado EIP-191 ("firma personal").

---

## Problemas que pueden surgir y cómo solucionarlos

### 1. "Mi registro dice `pending_anchor`"

**Qué significa:** El registro se guardó correctamente, pero todavía no se grabó en blockchain.

**¿Es grave?** No. Tu registro ya existe y es válido. El anclaje en blockchain se hace en segundo plano y puede tardar de 1 a 5 minutos. El registro ya se creó, simplemente falta archivarlo en blockchain para hacerlo permanente.

**Qué hacer:** Espera unos minutos y vuelve a consultar. Si tras 30 minutos sigue en `pending_anchor`, podría haber un problema con la conexión a blockchain. El sistema intentará hasta 5 veces automáticamente.

---

### 2. "Me dice `rate_limit_exceeded` (código 429)"

**Qué significa:** Has enviado demasiadas solicitudes en poco tiempo.

**¿Es grave?** No. Es una protección anti-spam.

**Qué hacer:** Espera unos segundos (la respuesta te dice cuántos) y vuelve a intentar. El límite es de 10 registros por minuto por wallet.

---

### 3. "Me dice `duplicate_content_hash` (código 409)"

**Qué significa:** Ya existe un registro con la misma huella digital. El mismo contenido no se puede registrar dos veces.

**¿Es grave?** No. Es una protección de idempotencia. Si registras el mismo contenido dos veces, RxM te lo dice en lugar de crear un duplicado.

**Qué hacer:** Si es el mismo contenido, no necesitas hacer nada — ya está registrado. Si crees que debería ser diferente, verifica que el contenido realmente cambió.

---

### 4. "Me dice `fee_not_verified` (código 402)"

**Qué significa:** La tasa de pago (fee) no se pudo verificar en blockchain.

**Causas posibles:**
- La transacción de pago aún no se confirmó en blockchain
- Se usó una dirección de pago incorrecta
- La transacción tiene más de 24 horas
- Ya se usó la misma transacción para otro registro

**Qué hacer:** Verifica que la transacción de pago se confirme antes de enviar el registro. Cada registro necesita su propia transacción de pago (no se puede reutilizar).

---

### 5. "Me dice `invalid_signature` (código 401)"

**Qué significa:** La firma digital no se pudo verificar. Algo salió mal al firmar.

**Qué hacer:** Verifica que estás firmando con la misma wallet que indicas como `agent_wallet`. La firma debe ser EIP-712 con el formato exacto que especifica el sistema.

---

### 6. "El registro no se puede borrar"

**Es así por diseño.** Los registros en RxM son permanentes (inmutables). No se pueden editar ni borrar. Una vez creado y anclado en blockchain, el registro existe de forma independiente.

Si registraste algo por error, el registro seguirá existiendo. Sin embargo, como RxM solo guarda la huella digital (no el contenido), no hay datos sensibles expuestos.

---

## Preguntas frecuentes

### ¿RxM guarda mis archivos?
**No.** Solo guarda la huella digital (hash). Es como guardar una huella dactilar sin guardar a la persona. Tu contenido sigue siendo tuyo y privado. Puede que en un futuro ofrezcamos la opción de guardar los archivos en un almacenamiento descentralizado como IPFS, pero no será obligatorio.

### ¿Cuánto cuesta?
La tasa actual es de **~$0.01 por registro** (un centavo de dólar). Se paga en criptomoneda en la red blockchain. Es un coste simbólico para evitar spam.

### ¿Y si RxM deja de estar disponible?
El anclaje en blockchain permite verificación independiente, incluso sin depender del servidor original. Los registros anclados en la blockchain pública pueden ser verificados por cualquier persona con acceso a esa blockchain y al receipt exportado, sin necesidad de que RxM esté operativo.

### ¿Puede alguien alterar un registro?
**No.** Una vez registrado y anclado en blockchain, la información es inmutable. Ni siquiera los administradores de RxM pueden modificar un registro existente.

### ¿Sirve como prueba legal?
RxM genera **evidencia técnica verificable** (quién, qué, cuándo, cómo). El valor legal de esa evidencia depende de la jurisdicción y del contexto. Es comparable a un timestamp certificado: no es una sentencia judicial, pero es una prueba técnica objetiva que un perito puede verificar.

### ¿Solo funciona con IA?
En principio sí, está diseñado para registrar outputs de agentes de IA. Pero técnicamente, cualquier contenido digital puede generar un hash y ser registrado. Lo que diferencia a RxM de un simple timestamp es el **Proof of Generation (PoG)** — los datos específicos sobre el proceso de generación por IA.

### ¿Necesito saber programar para usar RxM?
Para la **v1.0, sí** — necesitas interactuar con la API mediante código. En futuras versiones habrá una interfaz visual (dashboard) más accesible. Sin embargo, la idea es que los **agentes de IA** usen RxM automáticamente, sin que el usuario humano tenga que hacer nada manualmente.

### ¿RxM es una notaría? ¿Sustituye funciones notariales?
**No.** RxM no es una notaría, ni un registro público oficial, ni sustituye ninguna función notarial o registral. No tiene la condición de fedatario público, no otorga fe pública, y no produce documentos con valor legal equivalente a un acta notarial.

RxM es un **servicio técnico privado** que genera evidencia verificable: registra hechos técnicos (quién firmó qué, cuándo, con qué proceso) y los ancla en blockchain para hacerlos independientes del propio servicio. Esa evidencia técnica puede ser útil como **medio probatorio** complementario en determinados contextos, pero su valoración legal dependerá siempre de la jurisdicción, el contexto y la calificación que le dé un tribunal o autoridad competente.

En resumen: RxM genera **pruebas técnicas**, no **actos jurídicos**.

---

## Estados de un registro

Un registro pasa por estos estados:

```
  [ Registro enviado ]
         ↓
  ┌──────────────────┐
  │  pending_anchor   │  ← El registro existe, pero aún no se grabó en blockchain
  └────────┬─────────┘
           ↓
     ┌─────┴─────┐
     ↓           ↓
┌─────────┐  ┌───────────────┐
│ anchored │  │ anchor_failed  │
│    ✅    │  │    ❌          │
└─────────┘  └───────────────┘
  Completo     Hubo un error al
  y grabado    grabar en blockchain
  en blockchain (se reintenta 5 veces)
```

- **`pending_anchor`** — Normal. Espera a que el sistema lo ancle en blockchain (1-5 minutos)
- **`anchored`** — Perfecto. El registro está completo y es inmutable
- **`anchor_failed`** — Raro. Hubo un problema técnico. Los administradores pueden resolverlo manualmente

> **Novedad alpha.2 — `state_info`:** Ahora la respuesta de la API viene con un bloque extra llamado `state_info` que te dice, en lenguaje claro:
> - **¿Es un estado final?** (`terminal: true/false`) — Si ya no cambiará más
> - **¿Se puede reintentar?** (`retryable: true/false`) — Si el sistema lo va a intentar de nuevo automáticamente
> - **¿Qué significa?** (`description`) — Una descripción en texto de lo que está pasando
>
> Esto es especialmente útil para agentes de IA, que pueden decidir qué hacer (esperar, reintentar, continuar...) sin necesidad de interpretar los nombres técnicos de los estados.

---

## Resumen en una frase

> **Res ex Machina es un registro técnico para la IA:** registra, sella y certifica qué generó cada IA, cuándo y cómo, de forma permanente y verificable.
