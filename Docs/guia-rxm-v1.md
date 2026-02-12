# Res ex Machina — Guía para Humanos

> *"Cosa hecha por la máquina"* — Un registro donde las IAs dejan constancia de lo que crean.

---

## ¿Qué es Res ex Machina?

Imagina un **notario digital para la inteligencia artificial**. 

Cuando una IA genera algo — un texto, una imagen, un código, una canción — no queda constancia verificable de quién lo creó, cuándo, ni bajo qué condiciones. Res ex Machina (RxM) resuelve exactamente eso.

RxM es un **registro público, neutral e inmutable** donde los agentes de IA (o las personas que los usan) pueden dejar un sello oficial de que "esta IA generó esto, en este momento, de esta manera". Como un acta notarial, pero automática y para máquinas.

### La analogía del sello notarial

| Notaría tradicional | Res ex Machina |
|---------------------|----------------|
| Vas al notario con un documento | Tu IA envía los datos del output a RxM |
| El notario pone un sello con fecha | RxM genera un receipt con timestamp inmutable |
| El sello queda en los libros del notario | El registro queda anclado en blockchain |
| Puedes pedir una copia certificada | Puedes exportar el receipt verificable |
| No puedes borrar un acta notarial | No se puede borrar un registro de RxM |

---

## ¿Qué hace RxM?

1. **Registra hechos** — "Esta IA generó este output en este momento"
2. **Genera un recibo verificable** — Un receipt que cualquiera puede comprobar  
3. **Ancla el registro en blockchain** — Para que sea inmutable y no dependas de nosotros
4. **Permite verificar** — ¿Este contenido fue registrado? ¿Cuándo? ¿Por quién?

### ¿Qué información se guarda?

- **Siempre:** la huella digital del contenido (hash), quién lo registró (wallet), cuándo, y los detalles del proceso de generación (qué modelo, qué parámetros, etc.)
- **Nunca:** el contenido real. RxM no guarda tu texto, tu imagen ni tu código. Solo la prueba de que existió

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
4. **Se paga una tasa** simbólica (anti-spam, ~$0.001)
5. **RxM registra todo** y devuelve un receipt inmediato
6. **En segundo plano**, RxM ancla el registro en blockchain para hacerlo permanente

> **Resultado:** Tienes un receipt que demuestra que tu IA generó ese contenido en ese momento. Nadie puede borrar esa constancia, ni siquiera nosotros.

---

## Conceptos clave (glosario)

| Concepto | Qué es | Analogía |
|----------|--------|----------|
| **Hash** | Huella digital de un archivo. Un código único que identifica el contenido sin revelar el contenido | Como una huella dactilar: identifica sin mostrar a la persona |
| **Wallet** | Identidad técnica digital. Un par de claves criptográficas | Como un DNI electrónico para máquinas |
| **Firma EIP-712** | Firma digital estandarizada que demuestra quién envió el registro | Como una firma notarizada |
| **Fee** | Tasa simbólica que se paga por cada registro (anti-spam) | Como una tasa notarial |
| **Receipt** | El comprobante que recibes después de registrar | Como el acta notarial sellada |
| **Anchoring** | El proceso de grabar el registro en blockchain | Como depositar el acta en un archivo público permanente |
| **PoG (Proof of Generation)** | El "paquete de prueba" con todos los datos de la generación | Como el expediente completo del acta |
| **Blockchain** | Base de datos pública e inmutable compartida por miles de ordenadores | Como un libro contable que nadie puede alterar |

---

## ¿Cómo se usa la v1.0?

### Importante: v1.0 es solo API

La v1.0 de RxM es una **API** (una interfaz para programas, no para personas). No tiene botones, ni pantalla, ni app. Es como un servicio telefónico: tú llamas con un programa y él te contesta.

Esto significa que para usar RxM v1.0 necesitas:
- Un programa que sepa "hablar" con la API (un agente de IA, un script, o cualquier software)
- Una wallet de Ethereum (identidad técnica)
- Acceso a la red blockchain (para pagar la tasa)

### Las 4 operaciones disponibles

| Operación | Qué hace | Cuándo usarla |
|-----------|----------|---------------|
| **Registrar** | Crea un nuevo registro de generación | Cada vez que tu IA genera algo que quieras certificar |
| **Consultar** | Busca un registro por su ID | Si quieres ver los detalles de un registro concreto |
| **Verificar** | Comprueba si existe un registro para un contenido | Si alguien te dice "esto lo generé yo" y quieres verificarlo |
| **Exportar** | Descarga el receipt completo de un registro | Si necesitas una prueba formal para presentar a alguien |

### Ejemplo real (simplificado)

Imagina que tienes un agente de IA que genera informes. Quieres que cada informe quede registrado:

1. **Tu agente genera un informe** → calcula su hash: `sha256:a1b2c3d4...`
2. **Tu agente firma** los datos con su wallet y paga la tasa
3. **Tu agente envía** todo a RxM → recibe un receipt con ID `f8d2e7a1-...`
4. **Días después**, alguien pregunta: "¿Esto lo generó tu IA?"
5. **Verificas** en RxM con el hash del informe → "Sí, registrado el 12/02/2026 a las 14:30"
6. **Exportas** el receipt como prueba formal

---

## Problemas que pueden surgir y cómo solucionarlos

### 1. "Mi registro dice `pending_anchor`"

**Qué significa:** El registro se guardó correctamente, pero todavía no se grabó en blockchain.

**¿Es grave?** No. Tu registro ya existe y es válido. El anclaje en blockchain se hace en segundo plano y puede tardar de 1 a 5 minutos. Es como si el notario ya te dio el acta pero aún no la archivó en el registro central.

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

**Es así por diseño.** Los registros en RxM son permanentes (inmutables). No se pueden editar ni borrar. Es como un acta notarial: una vez firmada, existe para siempre.

Si registraste algo por error, el registro seguirá existiendo. Sin embargo, como RxM solo guarda la huella digital (no el contenido), no hay datos sensibles expuestos.

---

## Preguntas frecuentes

### ¿RxM guarda mis archivos?
**No.** Solo guarda la huella digital (hash). Es como guardar una huella dactilar sin guardar a la persona. Tu contenido sigue siendo tuyo y privado.

### ¿Cuánto cuesta?
La tasa actual es de **~$0.001 por registro** (una décima de centavo). Se paga en criptomoneda en la red blockchain. Es un coste simbólico para evitar spam.

### ¿Y si RxM desaparece?
Tus registros están anclados en **blockchain pública**. Incluso si RxM deja de existir, las pruebas siguen ahí, verificables por cualquiera con acceso a la blockchain.

### ¿Puede alguien alterar un registro?
**No.** Una vez registrado y anclado en blockchain, la información es inmutable. Ni siquiera los administradores de RxM pueden modificar un registro existente.

### ¿Sirve como prueba legal?
RxM genera **evidencia técnica verificable** (quién, qué, cuándo, cómo). El valor legal de esa evidencia depende de la jurisdicción y del contexto. Es comparable a un timestamp certificado: no es una sentencia judicial, pero es una prueba técnica objetiva que un perito puede verificar.

### ¿Solo funciona con IA?
En principio sí, está diseñado para registrar outputs de agentes de IA. Pero técnicamente, cualquier contenido digital puede generar un hash y ser registrado. Lo que diferencia a RxM de un simple timestamp es el **Proof of Generation (PoG)** — los datos específicos sobre el proceso de generación por IA.

### ¿Necesito saber programar para usar RxM?
Para la **v1.0, sí** — necesitas interactuar con la API mediante código. En futuras versiones habrá una interfaz visual (dashboard) más accesible. Sin embargo, la idea es que los **agentes de IA** usen RxM automáticamente, sin que el usuario humano tenga que hacer nada manualmente.

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

---

## Resumen en una frase

> **Res ex Machina es un notario digital para la IA:** registra, sella y certifica qué generó cada IA, cuándo y cómo, de forma permanente y verificable.
