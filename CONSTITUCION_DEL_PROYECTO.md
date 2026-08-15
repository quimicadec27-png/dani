# 📜 CONSTITUCIÓN TÉCNICA Y REGLAS MAESTRAS DEL PROYECTO QUÍMICA DEC
> **Documento de Arquitectura, Flujos de Negocio, Directivas de IA y Resolución de Problemas Críticos.**  
> *Lectura obligatoria para cualquier Agente de IA o Desarrollador que interactúe con el ecosistema de Química DEC.*

---

## 🏛️ 1. IDENTIDAD Y LENGUAJE DE LA IA ("DANI")
* **Nombre oficial:** Dani, asistente virtual de Química DEC.
* **Ubicación:** Local mayorista en Concepción del Uruguay, Entre Ríos (Av. Frondizi y 9 de Julio).
* **Dialecto Mandatorio:** **Español Argentino Rioplatense natural con voseo estricto**.
  * ✅ *Usar siempre:* "si sos", "tené en cuenta", "deseás", "preferís", "recordá", "podés", "tenés", "querés", "contame".
  * ❌ *Prohibido español neutro o de España:* "si eres", "recuerda", "puedes", "tienes", "quieres".
  * ❌ *Prohibido:* Usar la palabra "Che" (el trato debe ser cálido y cercano pero profesional).
  * ❌ *Prohibido frases victimistas:* Queda rotundamente prohibido decir "estoy aprendiendo", "soy solo un bot", "perdoná por no saber" o "¿me ayudás a aprender?". Ante quejas o frustración, responder con sobriedad profesional y ofrecer derivación con un asesor humano.

---

## 💾 2. ARQUITECTURA DEL CHAT WEB Y PERSISTENCIA MULTI-PESTAÑA (`ia_core.js`)

### ⚠️ El Problema que existía:
Al navegar entre pestañas (ej: pasar de `/catalogo` a `/tienda` o al `/`), la ventana del chat se cerraba, el historial se borraba o se abría una conversación en blanco porque el almacenamiento dependía de variables volátiles en memoria.

### 🛠️ Solución Implementada y Regla de Arquitectura:
1. **Persistencia Unificada en `localStorage` y `sessionStorage`:**
   * `dani_chat_history`: Almacena el array completo de mensajes `[{role: 'user', content: '...'}, {role: 'assistant', content: '...'}]`.
   * `dani_client_uuid`: Identificador UUID persistente del Lead en la base de datos Supabase.
   * `dani_session_id`: Código de sesión web único (ej: `Web_abc12_123456`, longitud controlada < 20 caracteres).
   * `dani_chat_open`: Booleano que recuerda si la ventana flotante del chat estaba abierta o minimizada.
2. **Rehidratación Automática al Cargar Página (`initDani()`):**
   * Al iniciar cualquier página web, el script lee `localStorage` y vuelve a renderizar todos los mensajes previos sin hacer llamadas innecesarias al servidor.
3. **Envío Directo del Historial en el Payload (`req.body.messages`):**
   * Al enviar un mensaje, `ia_core.js` envía el historial completo en el POST a `/api/whatsapp/incoming-ai`.
   * El backend procesa el contexto en **0.00ms en memoria**, evitando bloqueos o demoras de lectura en la base de datos.

---

## 🗃️ 3. GESTIÓN DE LEADS Y DIFERENCIACIÓN ESTRICTA DNI VS WHATSAPP (`clientes` en Supabase)

### ⚠️ Los Problemas que existían:
1. **Confusión de Teléfono como DNI:** Expresiones regulares no delimitadas capturaban secuencias numéricas (ej: `344854263` o `3442546484`) y las guardaban en el campo `cuit` (DNI), dejando el campo `whatsapp` vacío y bloqueando el botón de chat directo.
2. **Polución de Códigos Técnicos en DNI/CUIT:** El campo `cuit` se autocompletaba con códigos internos como `Web_ZPA39`.
3. **Error de Longitud en PostgreSQL (`varchar(20)`):** La columna `clientes.whatsapp` tiene un límite de 20 caracteres.

### 🛠️ Solución Implementada y Reglas Estrictas:
1. **Regla Obligatoria de Palabra Clave para DNI/CUIT:**
   * Un número **SOLO se considera DNI si está precedido explícitamente por palabras clave** (`dni:`, `cuit:`, `documento:`, `doc:`) o si tiene formato con guiones (`XX-XXXXXXXX-X`).
   * Si no hay palabra clave, **PROHIBIDO adivinar que un número es DNI**.
   * Validación cruzada: Si un número es idéntico o termina con el número de teléfono, **nunca se asigna a DNI**.
2. **Normalización Automática a Estándar WhatsApp Argentina (`549...`):**
   * Números de 10 dígitos (ej: `3442546484` u `1123456789`) se normalizan automáticamente a `5493442546484`.
   * Números con `0` inicial o `15` se limpian y convierten al formato internacional.
3. **Enlace y Botón Dinámico de WhatsApp en Tiempo Real:**
   * En la ficha del CRM, el botón `📲 Abrir Chat en WhatsApp (+549...)` se actualiza y activa en vivo mientras el operador tipea en el campo de teléfono, generando el enlace directo `https://wa.me/549...`.
4. **CUIT / DNI Limpio por Defecto:**
   * Al registrar un nuevo visitante web, `cuit: null`.
   * En la ficha (`renderClienteFicha`), si detecta un teléfono guardado erróneamente en el DNI de un lead previo, lo migra automáticamente a `whatsapp`.

---

## 🔄 4. CONTINUIDAD CONVERSACIONAL Y CIERRE DE PEDIDOS (Directiva Anti-Reinicio)

### ⚠️ El Problema que existía:
Tras una cotización exitosa (ej: 120 litros de cloro), cuando el usuario enviaba sus datos de contacto ("Javier Aguirre, tel 344854263, Las Américas 514"), la IA borraba el hilo mental y respondía saludando de nuevo ("¡Hola! Soy Dani... ¿en qué puedo ayudarte hoy?").

### 🛠️ Solución Implementada:
Se introdujo la directiva de continuidad estricta en el System Prompt:
```javascript
// Si hay historial previo, aplicar Directiva de Continuidad:
"Esta conversación YA ESTÁ EN CURSO. Recordá lo hablado en el historial.
- Si el cliente te brinda su nombre, teléfono, dirección o confirmación: agradecé cordialmente, confirmale que todos sus datos y pedido quedaron registrados y agendados, y que un asesor comercial humano se comunicará por WhatsApp para coordinar el pago y despacho.
- Queda ROTUNDAMENTE PROHIBIDO volver a saludar ('¡Hola! Soy Dani...'), PROHIBIDO decir '¿En qué puedo ayudarte hoy?' o preguntar qué producto busca si ya se definió antes.
- PROHIBIDO usar corchetes como '[Nombre]' o inventar datos bancarios."
```

---

## 📦 5. CATÁLOGO OFICIAL, REGLAS DE CONFINAMIENTO Y PRECIOS EN VIVO

### ⚠️ El Problema que existía:
La IA alucinaba productos o medidas inexistentes (ej: ofrecía "cloro líquido de 1 litro fraccionado" que no existe, o inventaba marcas de desinfectantes inexistentes).

### 🛠️ Solución Implementada:
1. **Matriz de 32 Categorías Maestras (`CATALOGO_REGLAS_DANI.md`):**
   * Se procesaron los archivos oficiales (`Quimica_DEC_Catalogo_WooCommerce_2026-07-29_22-10.csv` y `SAHUMERIOS_para_WooCommerce_2026-07-30.xlsx`).
   * **Filtro Estricto:** Se eliminaron **1.260 borradores y productos privados**, dejando únicamente los **3.014 productos y variaciones publicados**.
2. **Presentaciones Estándar Definidas:**
   * **Cloro Líquido:** Únicamente bidones de 20L, 40L, 60L, 120L y 200L. (Prohibido fraccionar en 1L).
   * **Pastillas de Cloro:** 50g y 200g (individuales o por kg).
   * **Líquidos Sueltos / Concentrados:** Bidones de 5L o pastas para 50L/100L.
   * **Sahumerios:** Paquetes x10, x20, x50, Conos y Dhoop sticks de marcas autorizadas (Tuk Tuk, Iluminarte, Sagrada Madre, Amogh, Sree Vani, Nuna Terra, Aromanza).
3. **Precios y Stock Dinámicos en Tiempo Real desde Supabase:**
   * Los precios **nunca van fijos en el prompt**.
   * El backend mantiene `PRODUCT_CATALOG_CACHE` sincronizado en RAM con `dec_products` (filtrado por `status = 'publish' OR status = 'publicado'`).
   * Cuando el cliente consulta por un producto, el servidor inyecta los precios exactos vigentes del día en el contexto:
     ```text
     [DATOS REALES Y CÁLCULOS MATEMÁTICOS DE SUPABASE]:
     • CLORO LÍQUIDO 120 LT: $85.534,80 [Stock: Disponible]
     ```
4. **Regla de Confinamiento (Fencing):**
   * Si un producto, aroma o medida no está en la base de datos inyectada, Dani tiene **estrictamente prohibido inventarlo**.

---

## ⚡ 6. MOTOR DE IA DOBLE CON FAILOVER AUTOMÁTICO (Groq + Gemini 2.5 Flash)

### 🛠️ Arquitectura de Ejecución en `server.js`:
1. **Motor Primario:** Groq `llama-3.1-8b-instant` con timeout protegido de **7.5 segundos**.
2. **Motor Secundario (Failover Instantáneo):** Google `gemini-2.5-flash` con timeout de **6 segundos**.
3. **Validación de Roles Alternados:**
   * Para evitar errores `400 Bad Request` por mensajes consecutivos con el mismo rol, el array de mensajes se compacta y garantiza una alternancia perfecta `system` $\rightarrow$ `user` $\rightarrow$ `assistant` $\rightarrow$ `user`.

---

## 📊 7. FLUJO OFICIAL DEL EMBUDO DE VENTAS Y CICLO DE VIDA DEL PEDIDO

El ciclo de un pedido en el CRM debe respetar **estrictamente las 4 etapas secuenciales del negocio**:

```
[ Presupuesto ] ──▶ [ Confirmado ] ──▶ [ Pagado ] ──▶ [ Despachado / Entregado ]
      │                   │                 │
      ▼                   ▼                 ▼
 [ Cancelado ]       [ Cancelado ]     [ Cancelado ]
```

### 1️⃣ Etapa: Presupuesto (`Presupuesto`)
* **Estado:** El cliente solicitó una cotización o el vendedor armó el presupuesto.
* **Acciones:**
  * `🔵 Confirmar Pedido`: El cliente aceptó el presupuesto. El pedido pasa a **Confirmado** para enviarle los datos de pago/CBU.
  * `🔴 Cancelar`: Si el cliente desiste.

### 2️⃣ Etapa: Confirmado (`Confirmado`)
* **Estado:** El pedido está confirmado y se le enviaron los datos bancarios (CBU / Alias) al cliente para depositar o transferir.
* **Acciones:**
  * `🟢 Confirmar Pago & Restar Stock`: El cliente depositó y el comercio verificó el dinero en su cuenta bancaria. Al hacer clic, **el pedido pasa a Pagado y se descuenta el stock en Supabase**.
  * `🔴 Cancelar`: Si el cliente no transfiere tras el plazo acordado.

### 3️⃣ Etapa: Pagado (`Pagado`)
* **Estado:** El dinero está acreditado y el depósito está armando y embalando el pedido.
* **Acciones:**
  * `🟣 Marcar como Despachado / Entregado`: Se entrega al transporte (Mostto / Andreani) o se entrega en mano al cliente. El pedido pasa a **Despachado**.

### 4️⃣ Etapa: Despachado / Entregado (`Despachado`)
* **Estado:** Pedido finalizado con éxito. Muestra el distintivo `✅ Pedido Despachado / Entregado`.

---

## 🚚 8. CAPTURA Y RESOLUCIÓN DE DATOS DE ENVÍO Y DIRECCIÓN

### 🛠️ Solución Implementada:
1. **Campos Directos en el Modal de Presupuestos:**
   * El modal incluye selectores para: `Método de Envío`, `Dirección (Calle y Nro)`, `Ciudad / Localidad` y `Provincia`.
   * Al seleccionar un cliente, los campos se auto-completan automáticamente con sus datos guardados.
2. **Actualización Bidireccional en Base de Datos:**
   * Al guardar el presupuesto, se actualiza la ficha del cliente en Supabase (`clientes.localidad`, `clientes.provincia`) y se guarda el método de envío en el pedido (`pedidos.origen` y `items_pedido[0].variacion_tamano`).
3. **Resolución Visual en el Embudo:**
   * La tarjeta del embudo lee prioritariamente el método de envío registrado en el pedido (`Entre Ríos (Mostto +5%)`, `Resto del País`, `Retira en Local`) y muestra la dirección exacta (`📍 Paraná (Entre Ríos)`).
   * La advertencia `⚠️ Sin Dirección` solo aparece si el pedido requiere transporte y verdaderamente no tiene localidad/dirección cargada.

---

## 💼 9. POLÍTICAS COMERCIALES Y DE LOGÍSTICA OFICIALES
* **Compra Mínima Inicial Mayorista:** **$80.000** (para clientes nuevos).
* **Retiro en Local Mayorista:** A partir de **$2.500** (exclusivamente para clientes mayoristas ya registrados).
* **Medios de Pago:** **Efectivo** o **Transferencia Bancaria**. (Prohibido mencionar tarjetas o cuotas).
* **Envíos en Entre Ríos:** Transporte **MOSTTO a domicilio** con un costo del **5% del total de la factura**.
* **Envíos al Resto del País:** Despacho por expreso / transporte de cargas generales a convenir.

---

> 🔒 *Cualquier modificación al backend, frontend o base de datos debe respetar rigurosamente los principios establecidos en esta Constitución.*
