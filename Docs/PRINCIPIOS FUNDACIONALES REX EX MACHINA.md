# I. Registros existentes de referencia (qué copiar y qué NO)
## 1. Registros con respaldo jurídico fuerte
### United States Copyright Office

Qué hace bien:
- Registra declaraciones, no “verdades absolutas”
- Fecha cierta y trazabilidad
- Publicidad y consulta pública

Qué NO hace
-No verifica exhaustivamente la originalidad
- No decide conflictos (eso es judicial)

👉 Principio clave: El registro no crea la realidad, la documenta.

### European Patent Office

Qué hace bien:
- Procedimientos claros
- Examen técnico reglado
- Prioridad temporal

Qué NO sirve para ti:
- Examen sustantivo costoso
- Centralización extrema
- Lento

👉 Principio útil: Procedimientos claros y predecibles generan confianza, aunque no garanticen éxito.

## 2. Registros con valor probatorio pero no “derechos”
### arXiv

Qué hace bien:
- Prueba de prior art
- Timestamp
- Adopción masiva sin ley detrás

Qué enseña:
- La comunidad valida antes que el legislador

👉 Principio clave: La utilidad precede al reconocimiento legal.

### Zenodo

Qué hace bien:
- DOI
- Versionado
- Citabilidad

👉 Principio clave: Persistencia y versionado son tan importantes como la fecha.

## 3. Registros comunitarios / técnicos
### GitHub

Qué hace bien:
- Historial inmutable de commits
- Autoría técnica (no jurídica)
- Forks y conflictos visibles

👉 Principio clave: La trazabilidad vence a la autoridad.

### OpenSea(no por el NFT, sino por el registro de hechos)

Qué hace bien:
- Prueba pública de mint / timestamp
- Estados claros (transferido, listado, etc.)

Qué hace mal:
- Confusión entre propiedad técnica y jurídica

👉 Lección: Nunca mezclar registro técnico con promesas jurídicas implícitas.

## 4. Sistemas de resolución externos
### Kleros

Qué aporta: 
- Resolución externa y modular
- No pertenece al registro
- Actúa bajo reglas definidas

👉 Principio clave: El registro no juzga; como mucho, ejecuta consecuencias.
---

# II. Principios fundacionales de Res ex Machina

## PRINCIPIO 1 — Registro de hechos, no de derechos

Res ex Machina registra hechos técnicos verificables, no:
- derechos de autor
- derechos de patente
- titularidades jurídicas

El registro no crea derechos ni los reconoce; documenta la existencia y las condiciones de generación.

📌 Inspirado en: Copyright Office, arXiv

## PRINCIPIO 2 — Neutralidad jurídica radical

El registro:
- no decide autoría humana
- no califica originalidad
- no resuelve plagio
- no determina patentabilidad

Toda calificación jurídica pertenece a instancias externas.

📌 Inspirado en: registros públicos + GitHub

## PRINCIPIO 3 — Primacía de la trazabilidad sobre la verdad

No se afirma:
- “esto es sin duda de IA”

Se afirma:
- “esto fue generado bajo estas condiciones, con estas evidencias”

La trazabilidad es más robusta que cualquier afirmación ontológica.

📌 Inspirado en: sistemas forenses + blockchain

## PRINCIPIO 4 — Prueba probabilística, no certeza absoluta

Proof of Generation:
- no es una verdad metafísica
- es una atestación técnica acumulativa

Cuantas más señales:
- mayor presunción
- nunca certeza absoluta

📌 Inspirado en: forense digital, pericia judicial

## PRINCIPIO 5 — Automatización por defecto, humano como excepción

Registro automático siempre que sea posible

Intervención humana solo:
- para auditoría
- para disputa
- para mejora del sistema

El humano supervisa; la máquina registra.

📌 Inspirado en: infraestructuras técnicas modernas

## PRINCIPIO 6 — Publicidad, con control de confidencialidad

El registro es público por defecto

Pero:
- el contenido puede estar off-chain
- los inputs pueden hashearse
- la metadata puede granularse

Publicidad del hecho, no necesariamente del contenido.

📌 Inspirado en: registros mercantiles, patentes

## PRINCIPIO 7 — Inmutabilidad + versionado

Nada se borra

Todo se versiona

Los estados cambian, los hechos no

La historia importa más que el estado actual.

📌 Inspirado en: Git, Zenodo, blockchain

## PRINCIPIO 8 — Resolución de conflictos externalizada

Res ex Machina:
- no resuelve disputas
- refleja resultados externos:
    - tribunales
    - arbitrajes
    - Kleros
    - acuerdos privados

📌 Inspirado en: registros públicos clásicos

## PRINCIPIO 9 — Identidad técnica verificable de agentes IA

Cada modelo/agente:
- tiene identidad criptográfica
- puede firmar outputs
- puede acumular reputación

No personalidad jurídica; sí identidad técnica.

📌 Inspirado en: PKI, DID, agentes autónomos

## PRINCIPIO 10 — Evolutividad y apertura normativa

El sistema:
- no se cierra doctrinalmente
- asume cambios regulatorios futuros
- conserva el histórico como archivo fundacional

El Derecho llegará después; el registro debe estar listo.

📌 Inspirado en: arXiv, Internet governance


# III. Principios resumidos (versión “manifiesto”)

Res ex Machina
- registra hechos, no derechos
- documenta trazabilidad, no verdades
- automatiza procesos, no juicios
- preserva historia, no estados
- sirve a la comunidad antes que a la ley

-----

# IV. Principios Operativos de Res ex Machina
## OP-1 — Registro automático por defecto

El sistema registra sin intervención humana siempre que sea técnicamente posible.
- La generación → firma → registro es un pipeline automático.
- El humano no “aprueba”, no “valida”, no “certifica”.
- Si hay intervención humana, debe quedar explícitamente registrada como excepción.

Regla práctica: Si un humano tiene que decidir algo para registrar, el sistema está mal diseñado.

## OP-2 — El hecho precede a cualquier calificación

Primero se registra el hecho; cualquier interpretación viene después.
- El sistema no espera a saber si algo es lícito, original, conflictivo o útil.
- El registro es agnóstico respecto al valor jurídico o económico.

Regla práctica: Registrar ahora es siempre mejor que esperar a “tener razón”.

## OP-3 — Prueba técnica acumulativa, nunca concluyente

La Proof of Generation se construye por capas, no por declaraciones únicas.
- Firma criptográfica del agente/modelo
- Timestamp inmutable
- Metadata técnica verificable
- Señales forenses automáticas

El sistema:
- acumula evidencias
- no emite veredictos

Regla práctica: El sistema mide consistencia, no “verdad”.

## OP-4 — Identidad técnica ≠ personalidad jurídica

Los agentes IA tienen identidad criptográfica, no estatus jurídico.

- Wallet / clave = identidad técnica
- DID / credenciales = reputación técnica

Nunca se infiere:
- autoría legal
- titularidad
- responsabilidad jurídica

Regla práctica: Identificar para trazar, no para personificar.

## OP-5 — Publicidad del hecho, discreción del contenido

El hecho registrado es público; el contenido puede ser privado.

- On-chain: hashes, timestamps, estados
- Off-chain: contenido, inputs, evidencias pesadas

Posibilidad de:
- hash de input
- cifrado
- disclosure selectivo

Regla práctica: El mundo necesita saber que algo existe, no necesariamente qué contiene.

## OP-6 — Inmutabilidad histórica, estados dinámicos

Nada se borra; todo puede cambiar de estado.
- Un registro nunca se elimina.
- Puede pasar por estados:
    - activo
    - disputado
    - resuelto
    - archivado
- Cada cambio deja rastro.

Regla práctica: Se corrigen estados, no hechos pasados.

## OP-7 — Neutralidad activa ante disputas

El sistema no juzga, pero sí gestiona disputas.

Permite:
- claims
- contra-claims
- aportación de evidencia

No decide el fondo.

Refleja resoluciones externas:
- tribunales
- arbitrajes
- Kleros
- acuerdos privados

Regla práctica: El registro escucha a todos, decide a ninguno.

## OP-8 — Ejecución automática de consecuencias contractuales

Lo que sea contractual, el sistema lo ejecuta; lo que sea jurídico, lo refleja.
- Licencias de uso
- Pagos
- Accesos
- Escrows de disputa

Todo esto:
- on-chain
- automático
- predecible

Regla práctica: El sistema ejecuta reglas, no interpreta normas.

## OP-9 — Versionado como principio estructural

Toda evolución del output, del modelo o del contexto se versiona.

- Nuevas generaciones → nuevos registros
- Re-generaciones → vinculadas, no sustitutas
- Cambios de modelo → explícitos

Regla práctica: Una creación de IA no “se corrige”: se continúa.

## OP-10 — Diseño anti-promesa

El sistema evita prometer efectos jurídicos que no controla.

Nunca dirá:
- “esto es tu copyright”
- “esto te protege legalmente”
- “esto te da exclusividad”

Sí dirá:
- “esto fue registrado”
- “esto fue generado así”
- “esto está licenciado bajo estas condiciones”

Regla práctica: Mejor una verdad modesta que una promesa falsa.

## OP-11 — Interoperabilidad antes que cierre

Res ex Machina no es un jardín cerrado.
- APIs abiertas
- Estándares compatibles
- Exportabilidad de pruebas
- Legibilidad por terceros (humanos y máquinas)

Regla práctica: Un registro útil es uno que otros pueden usar sin pedir permiso.

## OP-12 — Gobernanza mínima, transparencia máxima

Pocas reglas internas, todas públicas.
- Principios claros
- Cambios versionados
- Auditorías externas posibles
- Historial visible

Regla práctica: Si una regla no puede explicarse en una página, no debería existir.

## OP-13 - Separación entre registro público y servicios de análisis

Res ex Machina distingue entre:
- el registro público de hechos técnicos, accesible a cualquiera
- y los servicios de análisis, agregación o perfilado, que pueden ofrecerse de forma controlada, contractual o de pago

El acceso a datos agregados por agente:
- no es público por defecto
- no implica juicios, scoring ni reputación automática
- no altera ni califica los hechos registrados

La plataforma proporciona datos estructurados;
la interpretación corresponde siempre al usuario autorizado.

📌 Inspirado en:
Registros Mercantiles + informes de solvencia / compliance









Versión ultra-resumida (para equipo / README)

Res ex Machina
registra automáticamente hechos de generación por IA,
acumula evidencia técnica sin decidir derechos,
mantiene historia inmutable con estados dinámicos,
ejecuta contratos pero no juicios,
y deja al Derecho decidir cuando llegue.