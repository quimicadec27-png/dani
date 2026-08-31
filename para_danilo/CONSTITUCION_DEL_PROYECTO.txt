# 📜 CONSTITUCIÓN TÉCNICA Y REGLAS MAESTRAS DEL PROYECTO QUÍMICA DEC
> **Documento de Arquitectura, Flujos de Negocio, Directivas de IA, Catálogo y Resolución de Problemas Críticos.**  
> *Lectura obligatoria e indispensable para cualquier Agente de IA o Desarrollador que interactúe con el ecosistema de Química DEC.*
> **Última Actualización:** Agosto 2026

---

## 🏛️ 1. IDENTIDAD Y LENGUAJE DE LA IA ("DANI")
* **Nombre oficial:** Dani, asistente virtual de Química DEC.
* **Ubicación:** Local mayorista en Concepción del Uruguay, Entre Ríos (Av. Frondizi y 9 de Julio).
* **Dialecto Mandatorio:** **Español Argentino Rioplatense natural con voseo estricto**.
  * ✅ *Usar siempre:* "si sos", "tené en cuenta", "deseás", "preferís", "recordá", "podés", "tenés", "querés", "contame".
  * ❌ *Prohibido español neutro o de España:* "si eres", "recuerda", "puedes", "tienes", "quieres".
  * ❌ *Prohibido:* Usar la palabra "Che" (el trato debe ser cálido y cercano pero profesional).
  * ❌ *Prohibido frases victimistas:* Queda rotundamente prohibido decir "estoy aprendiendo", "soy solo un bot", "perdoná por no saber" o "¿me ayudás a aprender?". Ante quejas o frustración, responder con sobriedad profesional y ofrecer derivación con un asesor humano.
* **Políticas Comerciales Clave:**
  * **Compra mínima mayorista (primer pedido cliente nuevo):** **$80.000**.
  * **Retiro en local:** A partir de **$2.500** (exclusivo para clientes que ya son mayoristas registrados).
  * **Medios de Pago Oficiales:** Únicamente **EFECTIVO** (en local) y **TRANSFERENCIA BANCARIA**. Queda terminantemente prohibido inventar tarjetas de crédito, débito o cuotas.
  * **Seguridad Bancaria:** Queda terminantemente prohibido inventar CBUs, alias o nombres de vendedores ficticios.

---

## 🌳 2. ARQUITECTURA DEL CATÁLOGO (4 MACRO-SECTORES, 32 CATEGORÍAS Y 3 NIVELES)

El catálogo oficial de Química DEC (`quimicadec.com/catalogo`) cuenta con más de 3.500 productos y se estructura en 3 niveles jerárquicos:

### Nivel 1: Los 4 Macro-Sectores y 32 Categorías Oficiales
1. **LIMPIEZA Y QUÍMICOS (9 Categorías):**
   * *Ofertas Semanales*
   * *Combos Emprendedores*
   * *Productos Líquidos Propios (Fabricación Directa):* Jabones Líquidos para Ropa propios (Línea Premium: Violeta, Azul, Verde, Ropa Blanca, Rojo | Línea Eco Plus: Azul, Verde), Suavizantes (Downy, Mary Cher, Confort, Vivere), Lavandina 1+2, Cloro líquido, Ceras, Siliconas, Desengrasantes en bidones de 5L a 200L. *(Nota estricta: NO se venden marcas de reventa como Skip ni Ariel)*.
   * *Productos para Diluir* (Desodorantes de piso concentrados 1+9, 1+20 y 1+50 para rendir 5L, 25L y 50L en packs de 3, 5 y 10 unidades).
   * *Primeras Marcas* (Cif, Ala en polvo, Glade, Blem, Magistral, etc.).
   * *Pastas y Concentrados* (Pastas base para fabricar jabón líquido, suavizante, detergente y ceras).
   * *Aerosoles* (Glade, Blem, Cif Desinfectante, Poett, Lysoform).
   * *Jabón en Polvo*
   * *Jabón en Pan*

2. **ACCESORIOS DE LIMPIEZA (8 Categorías):**
   * *Esponjas* | *Escobillones* | *Cepillos* | *Secadores* | *Cabos* | *Burlete* | *Bolsas* | *Envases*.

3. **HOGAR Y AMBIENTES (8 Categorías):**
   * *Baño* | *Cocina* | *Perfumería* | *Sahumerios* (Varillas, Conos Cascada, Dhoop, Bombitas: Prana, Amogh, Sagrada Madre, Iluminarte, Aspan) | *Textiles* | *Papeles* | *Repelentes* | *Insecticidas*.

4. **ESPECIALIDADES Y VARIOS (8 Categorías):**
   * *Higiene Personal* | *Jabón Tocador* | *Jardín* | *Pileta* (Cloro líquido 1+2, Cloro granulado simple/triple acción x 1kg, pastillas 50g/200g, clarificantes, alguicidas) | *Automóvil* (Siliconas, shampoos siliconados, revividores, pinitos) | *Kiosco y Varios* | *Plásticos* | *Limpieza Hogar*.

### Nivel 2: Pestañas / Subcategorías de Acordeón (`wpcode_*.php`)
* En **Pastas y Concentrados**: `Jabones y Suavizantes (Pastas)`, `Desinfección y Fragancias`, `Limpieza de Pisos y Superficies`, `Línea Automotor`, `Tratamiento de Agua y Piletas`.
* En **Automóvil**: `Revividores`, `Limpiadores`, `Shampoos siliconados`, `Pinitos aromatizantes`.
* En **Papeles**: `Morita`, `Maxisec`, `New Pel`, `Toallas intercaladas`, `Bobinas industriales`, `Pañuelos`.
* En **Bolsas**: `Bolsas en rollo`, `Camiseta`, `Bolsas x100u`, `Bolsas de consorcio`, `Ecológicas`.

### Nivel 3: Tablas de "Opciones Disponibles" / Variaciones y Atributos
* **Escala de Litros / Volúmenes:** Desde 0.5L, 1L, 2L, 3L, 4L, 5L, 6L, 8L, 10L, 20L, 40L, 60L, 100L, 120L, 200L.
* **Packs Mayoristas:** Pack x3, Pack x5, Pack x10, Pack x50, Unidades sueltas vs Kilos.
* **Variantes de Color y Tipo:** Cera Natural, Negra, Roja; Desengrasante Alcalino; Fragancias variadas.
* **Motor de Búsqueda Ponderado (`server.js`):** Pondera coincidencias por tamaño en litros (`reqSize`), cantidad en pack (`reqPack`) y palabra clave para emparejar la variación exacta en 0ms.

---

## 🗄️ 3. PRECIOS Y BASE DE DATOS SUPABASE (`dec_products`)
* **Fuente Oficial de la Verdad:** El archivo CSV [`Quimica_DEC_Catalogo_WooCommerce_2026-07-29_22-10.csv`](file:///c:/Users/wilde.WIL/OneDrive/Escritorio/PROYECTOS%20IA/Qu%C3%ADmica%20DEC/quimica_dec/Quimica_DEC_Catalogo_WooCommerce_2026-07-29_22-10.csv).
* **Auditoría y Corrección de Escala Decimal (Bug x100 resuelto):**
  * Se corrigieron **2.765 productos** en la base de datos Supabase (`dec_products`) y en `catalogo_completo_3800.json` que tenían precios inflados por pérdida del punto decimal.
  * Ejemplos verificados:
    * *Cloro Líquido 1+2 (Desde 10 LT):* `$7.538,25` (antes figuraba $753.825).
    * *Cloro Líquido 1+2 (Desde 5 LT):* `$3.769,12` (antes figuraba $376.912).
    * *Clarificante (Desde 200 LT):* `$370.972,44` (antes figuraba $37.097.244).
    * *Aerosol Glade 360cc:* `$4.124,74` (antes figuraba $412.474).
* **Precios en Vivo para la IA (RAG en RAM):** Dani **NUNCA memoriza precios**. En cada mensaje, el backend consulta `dec_products` (o su caché RAM sincronizado) y le inyecta a Dani el bloque de precios exactos del día: `[DATOS REALES Y CÁLCULOS MATEMÁTICOS OFICIALES DE QUÍMICA DEC]`.

---

## 📦 4. GESTIÓN DE PEDIDOS Y EMBUDO CRM (`pedidos` y `items_pedido`)

### A. Edición / Corrección de Pedidos en Vivo ("Corregir Pedido")
* **Funcionalidad:** En la sección "Embudo de Pedidos", tanto en la lista detallada como en las columnas Kanban, los vendedores cuentan con el botón **"Corregir Pedido"**.
* **Modal Reutilizado:** Se reutiliza el modal `#modal-nuevo-pedido` precargando cliente, método de envío, notas y la lista completa de productos editables (cantidades, precios, agregar/quitar ítems).
* **Endpoint Backend:** `POST /api/crm/pedidos/editar-pedido`.

### B. Corrección de Longitud de Campo en PostgreSQL (`VARCHAR(50)`)
* **Problema:** La columna `pedidos.origen` en PostgreSQL tiene límite estricto de **50 caracteres**.
* **Regla Obligatoria:** En `server.js` (`crear-presupuesto`, `editar-pedido` y webhooks), el campo `origen` debe truncarse estrictamente a 50 caracteres:
  ```javascript
  origenFormatted = String(origenFormatted).substring(0, 50);
  ```
* Las notas extensas y métodos de envío se almacenan en `items_pedido.variacion_tamano` (`VARCHAR(250)`).

---

## 🖨️ 5. IMPRESIÓN DE TICKETS TÉRMICOS 80MM (POS-80)
* **Ubicación:** Función `imprimirTicketTermico80mm(pedidoId)` en `crm-backend/public/index.html`.
* **Diseño para Cabezales Térmicos:**
  * `font-weight: bold / 900` y color `#000000` en todo el documento para forzar doble quemado de punto térmico (negro nítido, sin textos desvanecidos).
  * **Escala Tipográfica (Mínimo estricto 11px):**
    * `18px`: Título `QUÍMICA DEC`.
    * `16px`: `TOTAL FINAL`.
    * `14px`: Nombre del destinatario.
    * `12px`: Productos, cantidades (`50x`), precios (`$420.250`), teléfono, remito y transporte.
    * `11px`: Fecha, dirección, cabeceras de tabla (`CANT / DETALLE / TOTAL`), rótulo de bultos y pie. *(Eliminados 8px, 9px y 10px).*
  * **Número de Pedido:** Detecta `#${pedido.woocommerce_order_id}` si proviene de WooCommerce (ej: `#7303`).

---

## 🛒 6. INTEGRACIÓN WOOCOMMERCE & EXPERIENCIA POST-CHECKOUT
1. **Popup Post-Compra con Redirección a WhatsApp (`wpcode_popup_gracias_compra_whatsapp.php`):**
   * Al finalizar compra en WooCommerce (`woocommerce_thankyou`), se abre un modal profesional informando el número de pedido e invitando al cliente a tocar el botón verde para contactar al vendedor por WhatsApp.
   * Se eliminó "Cheque" de los métodos de pago.
2. **Deduplicación de Webhook de Pedidos:**
   * En `/api/crm/webhooks/woocommerce-order`, si `woocommerce_order_id` ya existe en Supabase, el backend actualiza la orden existente en lugar de duplicarla.
3. **Auto-Polling en Tiempo Real del CRM:**
# 📜 CONSTITUCIÓN TÉCNICA Y REGLAS MAESTRAS DEL PROYECTO QUÍMICA DEC
> **Documento de Arquitectura, Flujos de Negocio, Directivas de IA, Catálogo y Resolución de Problemas Críticos.**  
> *Lectura obligatoria e indispensable para cualquier Agente de IA o Desarrollador que interactúe con el ecosistema de Química DEC.*
> **Última Actualización:** Agosto 2026

---

## 🏛️ 1. IDENTIDAD Y LENGUAJE DE LA IA ("DANI")
* **Nombre oficial:** Dani, asistente virtual de Química DEC.
* **Ubicación:** Local mayorista en Concepción del Uruguay, Entre Ríos (Av. Frondizi y 9 de Julio).
* **Dialecto Mandatorio:** **Español Argentino Rioplatense natural con voseo estricto**.
  * ✅ *Usar siempre:* "si sos", "tené en cuenta", "deseás", "preferís", "recordá", "podés", "tenés", "querés", "contame".
  * ❌ *Prohibido español neutro o de España:* "si eres", "recuerda", "puedes", "tienes", "quieres".
  * ❌ *Prohibido:* Usar la palabra "Che" (el trato debe ser cálido y cercano pero profesional).
  * ❌ *Prohibido frases victimistas:* Queda rotundamente prohibido decir "estoy aprendiendo", "soy solo un bot", "perdoná por no saber" o "¿me ayudás a aprender?". Ante quejas o frustración, responder con sobriedad profesional y ofrecer derivación con un asesor humano.
* **Políticas Comerciales Clave:**
  * **Compra mínima mayorista (primer pedido cliente nuevo):** **$80.000**.
  * **Retiro en local:** A partir de **$2.500** (exclusivo para clientes que ya son mayoristas registrados).
  * **Medios de Pago Oficiales:** Únicamente **EFECTIVO** (en local) y **TRANSFERENCIA BANCARIA**. Queda terminantemente prohibido inventar tarjetas de crédito, débito o cuotas.
  * **Seguridad Bancaria:** Queda terminantemente prohibido inventar CBUs, alias o nombres de vendedores ficticios.

---

## 🌳 2. ARQUITECTURA DEL CATÁLOGO (4 MACRO-SECTORES, 32 CATEGORÍAS Y 3 NIVELES)

El catálogo oficial de Química DEC (`quimicadec.com/catalogo`) cuenta con más de 3.500 productos y se estructura en 3 niveles jerárquicos:

### Nivel 1: Los 4 Macro-Sectores y 32 Categorías Oficiales
1. **LIMPIEZA Y QUÍMICOS (9 Categorías):**
   * *Ofertas Semanales*
   * *Combos Emprendedores*
   * *Productos Líquidos Propios (Fabricación Directa):* Jabones Líquidos para Ropa propios (Línea Premium: Violeta, Azul, Verde, Ropa Blanca, Rojo | Línea Eco Plus: Azul, Verde), Suavizantes (Downy, Mary Cher, Confort, Vivere), Lavandina 1+2, Cloro líquido, Ceras, Siliconas, Desengrasantes en bidones de 5L a 200L. *(Nota estricta: NO se venden marcas de reventa como Skip ni Ariel)*.
   * *Productos para Diluir* (Desodorantes de piso concentrados 1+9, 1+20 y 1+50 para rendir 5L, 25L y 50L en packs de 3, 5 y 10 unidades).
   * *Primeras Marcas* (Cif, Ala en polvo, Glade, Blem, Magistral, etc.).
   * *Pastas y Concentrados* (Pastas base para fabricar jabón líquido, suavizante, detergente y ceras).
   * *Aerosoles* (Glade, Blem, Cif Desinfectante, Poett, Lysoform).
   * *Jabón en Polvo*
   * *Jabón en Pan*

2. **ACCESORIOS DE LIMPIEZA (8 Categorías):**
   * *Esponjas* | *Escobillones* | *Cepillos* | *Secadores* | *Cabos* | *Burlete* | *Bolsas* | *Envases*.

3. **HOGAR Y AMBIENTES (8 Categorías):**
   * *Baño* | *Cocina* | *Perfumería* | *Sahumerios* (Varillas, Conos Cascada, Dhoop, Bombitas: Prana, Amogh, Sagrada Madre, Iluminarte, Aspan) | *Textiles* | *Papeles* | *Repelentes* | *Insecticidas*.

4. **ESPECIALIDADES Y VARIOS (8 Categorías):**
   * *Higiene Personal* | *Jabón Tocador* | *Jardín* | *Pileta* (Cloro líquido 1+2, Cloro granulado simple/triple acción x 1kg, pastillas 50g/200g, clarificantes, alguicidas) | *Automóvil* (Siliconas, shampoos siliconados, revividores, pinitos) | *Kiosco y Varios* | *Plásticos* | *Limpieza Hogar*.

### Nivel 2: Pestañas / Subcategorías de Acordeón (`wpcode_*.php`)
* En **Pastas y Concentrados**: `Jabones y Suavizantes (Pastas)`, `Desinfección y Fragancias`, `Limpieza de Pisos y Superficies`, `Línea Automotor`, `Tratamiento de Agua y Piletas`.
* En **Automóvil**: `Revividores`, `Limpiadores`, `Shampoos siliconados`, `Pinitos aromatizantes`.
* En **Papeles**: `Morita`, `Maxisec`, `New Pel`, `Toallas intercaladas`, `Bobinas industriales`, `Pañuelos`.
* En **Bolsas**: `Bolsas en rollo`, `Camiseta`, `Bolsas x100u`, `Bolsas de consorcio`, `Ecológicas`.

### Nivel 3: Tablas de "Opciones Disponibles" / Variaciones y Atributos
* **Escala de Litros / Volúmenes:** Desde 0.5L, 1L, 2L, 3L, 4L, 5L, 6L, 8L, 10L, 20L, 40L, 60L, 100L, 120L, 200L.
* **Packs Mayoristas:** Pack x3, Pack x5, Pack x10, Pack x50, Unidades sueltas vs Kilos.
* **Variantes de Color y Tipo:** Cera Natural, Negra, Roja; Desengrasante Alcalino; Fragancias variadas.
* **Motor de Búsqueda Ponderado (`server.js`):** Pondera coincidencias por tamaño en litros (`reqSize`), cantidad en pack (`reqPack`) y palabra clave para emparejar la variación exacta en 0ms.

---

## 🗄️ 3. PRECIOS Y BASE DE DATOS SUPABASE (`dec_products`)
* **Fuente Oficial de la Verdad:** El archivo CSV [`Quimica_DEC_Catalogo_WooCommerce_2026-07-29_22-10.csv`](file:///c:/Users/wilde.WIL/OneDrive/Escritorio/PROYECTOS%20IA/Qu%C3%ADmica%20DEC/quimica_dec/Quimica_DEC_Catalogo_WooCommerce_2026-07-29_22-10.csv).
* **Auditoría y Corrección de Escala Decimal (Bug x100 resuelto):**
  * Se corrigieron **2.765 productos** en la base de datos Supabase (`dec_products`) y en `catalogo_completo_3800.json` que tenían precios inflados por pérdida del punto decimal.
  * Ejemplos verificados:
    * *Cloro Líquido 1+2 (Desde 10 LT):* `$7.538,25` (antes figuraba $753.825).
    * *Cloro Líquido 1+2 (Desde 5 LT):* `$3.769,12` (antes figuraba $376.912).
    * *Clarificante (Desde 200 LT):* `$370.972,44` (antes figuraba $37.097.244).
    * *Aerosol Glade 360cc:* `$4.124,74` (antes figuraba $412.474).
* **Precios en Vivo para la IA (RAG en RAM):** Dani **NUNCA memoriza precios**. En cada mensaje, el backend consulta `dec_products` (o su caché RAM sincronizado) y le inyecta a Dani el bloque de precios exactos del día: `[DATOS REALES Y CÁLCULOS MATEMÁTICOS OFICIALES DE QUÍMICA DEC]`.

---

## 📦 4. GESTIÓN DE PEDIDOS Y EMBUDO CRM (`pedidos` y `items_pedido`)

### A. Edición / Corrección de Pedidos en Vivo ("Corregir Pedido")
* **Funcionalidad:** En la sección "Embudo de Pedidos", tanto en la lista detallada como en las columnas Kanban, los vendedores cuentan con el botón **"Corregir Pedido"**.
* **Modal Reutilizado:** Se reutiliza el modal `#modal-nuevo-pedido` precargando cliente, método de envío, notas y la lista completa de productos editables (cantidades, precios, agregar/quitar ítems).
* **Endpoint Backend:** `POST /api/crm/pedidos/editar-pedido`.

### B. Corrección de Longitud de Campo en PostgreSQL (`VARCHAR(50)`)
* **Problema:** La columna `pedidos.origen` en PostgreSQL tiene límite estricto de **50 caracteres**.
* **Regla Obligatoria:** En `server.js` (`crear-presupuesto`, `editar-pedido` y webhooks), el campo `origen` debe truncarse estrictamente a 50 caracteres:
  ```javascript
  origenFormatted = String(origenFormatted).substring(0, 50);
  ```
* Las notas extensas y métodos de envío se almacenan en `items_pedido.variacion_tamano` (`VARCHAR(250)`).

---

## 🖨️ 5. IMPRESIÓN DE TICKETS TÉRMICOS 80MM (POS-80)
* **Ubicación:** Función `imprimirTicketTermico80mm(pedidoId)` en `crm-backend/public/index.html`.
* **Diseño para Cabezales Térmicos:**
  * `font-weight: bold / 900` y color `#000000` en todo el documento para forzar doble quemado de punto térmico (negro nítido, sin textos desvanecidos).
  * **Escala Tipográfica (Mínimo estricto 11px):**
    * `18px`: Título `QUÍMICA DEC`.
    * `16px`: `TOTAL FINAL`.
    * `14px`: Nombre del destinatario.
    * `12px`: Productos, cantidades (`50x`), precios (`$420.250`), teléfono, remito y transporte.
    * `11px`: Fecha, dirección, cabeceras de tabla (`CANT / DETALLE / TOTAL`), rótulo de bultos y pie. *(Eliminados 8px, 9px y 10px).*
  * **Número de Pedido:** Detecta `#${pedido.woocommerce_order_id}` si proviene de WooCommerce (ej: `#7303`).

---

## 🛒 6. INTEGRACIÓN WOOCOMMERCE & EXPERIENCIA POST-CHECKOUT
1. **Popup Post-Compra con Redirección a WhatsApp (`wpcode_popup_gracias_compra_whatsapp.php`):**
   * Al finalizar compra en WooCommerce (`woocommerce_thankyou`), se abre un modal profesional informando el número de pedido e invitando al cliente a tocar el botón verde para contactar al vendedor por WhatsApp.
   * Se eliminó "Cheque" de los métodos de pago.
2. **Deduplicación de Webhook de Pedidos:**
   * En `/api/crm/webhooks/woocommerce-order`, si `woocommerce_order_id` ya existe en Supabase, el backend actualiza la orden existente en lugar de duplicarla.
3. **Auto-Polling en Tiempo Real del CRM:**
   * `public/index.html` realiza polling automático cada 4 segundos de `/crm/pedidos` y `/crm/chat/conversaciones`, reflejando nuevos pedidos del carrito sin necesidad de recargar la página (`F5`).
4. **Normalización de Teléfonos Argentinos:**
   * Formato único estándar: `549` + código de área + número (sin símbolos `+` ni duplicaciones `+54`).

---

## 🔒 7. SEGURIDAD Y ZERO HARDCODED SECRETS
* **Regla Absoluta:** Prohibido escribir claves API, tokens o credenciales dentro del código fuente.
* **Variables de Entorno (`.env`):**
  * `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `SESSION_SECRET`, `PORT`.
* **Archivos `.gitignore`:** Configurados tanto en la raíz como en `crm-backend/` para proteger `.env`, respaldos y credenciales.

---

## 🛠️ 8. GESTOR Y CREADOR MANUAL DE PRODUCTOS Y EXCEL (32 CATEGORÍAS)
* **Ubicación en el CRM:** Pestaña `CATÁLOGO E IA` ➔ Herramienta `Crear / Buscar Producto e Imagen` (o `Carga Masiva Excel`).
* **Bloque 1: Creación Manual de Nuevos Productos:**
  * **Nombre del Producto:** Campo directo para tipear el nombre.
  * **Categoría Oficial (32):** Menú desplegable sin emoticones organizado en 4 macro-sectores (`LIMPIEZA Y QUÍMICOS`, `ACCESORIOS DE LIMPIEZA`, `HOGAR Y AMBIENTES`, `ESPECIALIDADES Y VARIOS`).
  * **Precio ($ ARS):** Campo numérico para definir el valor del producto.
  * **SKU Asignado Automáticamente:** El sistema genera y asigna en segundo plano el código oficial según la categoría (`QD-LIQ-XXXX`, `QD-SAH-XXXX`, etc.) sin exigirle al usuario tipear códigos.
  * **Elegir Foto:** Permite subir la foto asociada al producto.
  * **Botones Limpios:** `Sumar Otro Producto` y `Guardar Nuevos Productos en Tienda y CRM`.
* **Bloque 2: Buscar y Modificar Productos Existentes:**
  * Buscador en tiempo real por Nombre o SKU para editar precios, nombres, categorías o fotos en lote.
* **Bloque 3: Carga Masiva de Imágenes (Por Lote):**
  * Subida masiva de fotos vinculadas por nombre de archivo.
* **Bloque 4: Carga Masiva Excel / CSV:**
  * Selector de **Categoría por Defecto** (32 categorías limpias) para clasificar automáticamente filas sin categoría asignada.
* **Sincronización Total (`/api/products/update-details` & `wpcode_upload_image_api.php`):**
  * Si el producto no existe en WooCommerce, se auto-crea como producto simple, se le asigna el término de categoría `product_cat`, el SKU y el precio.
  * Se sincroniza de inmediato con Supabase `dec_products` y se purga la memoria RAM del catálogo en tiempo real.

---

## 📂 9. MAPA DE ARCHIVOS CLAVE DEL PROYECTO
* [`crm-backend/server.js`](file:///c:/Users/wilde.WIL/OneDrive/Escritorio/PROYECTOS%20IA/Qu%C3%ADmica%20DEC/quimica_dec/crm-backend/server.js): Servidor central Express, endpoints CRM, webhook WooCommerce, caché de catálogo y lógica de IA Dani.
* [`crm-backend/public/index.html`](file:///c:/Users/wilde.WIL/OneDrive/Escritorio/PROYECTOS%20IA/Qu%C3%ADmica%20DEC/quimica_dec/crm-backend/public/index.html): Frontend del CRM DEC, Embudo de pedidos, Chat en vivo, Gestión de leads, modal de Corregir Pedido, Creador Manual de Productos (32 Categorías) e Impresión Térmica 80mm.
* [`Quimica_DEC_Catalogo_WooCommerce_2026-07-29_22-10.csv`](file:///c:/Users/wilde.WIL/OneDrive/Escritorio/PROYECTOS%20IA/Qu%C3%ADmica%20DEC/quimica_dec/Quimica_DEC_Catalogo_WooCommerce_2026-07-29_22-10.csv): Catálogo oficial maestro con precios, atributos y variaciones.
* [`crm-backend/catalogo_completo_3800.json`](file:///c:/Users/wilde.WIL/OneDrive/Escritorio/PROYECTOS%20IA/Qu%C3%ADmica%20DEC/quimica_dec/crm-backend/catalogo_completo_3800.json): Respaldo JSON de los 3.533+ productos con precios corregidos.
* [`wpcode_upload_image_api.php`](file:///c:/Users/wilde.WIL/OneDrive/Escritorio/PROYECTOS%20IA/Qu%C3%ADmica%20DEC/quimica_dec/wpcode_upload_image_api.php): Endpoint central de sincronización en WooCommerce (actualización y creación de productos, asignación de 32 categorías, subida de fotos y purga de caché).
* [`CONSTITUCION_DEL_PROYECTO.md`](file:///c:/Users/wilde.WIL/OneDrive/Escritorio/PROYECTOS%20IA/Qu%C3%ADmica%20DEC/quimica_dec/CONSTITUCION_DEL_PROYECTO.md): Este documento maestro de reglas y arquitectura.


### 4.7 Módulo "Crear, Borrar, Buscar Producto e Imagen" y Gestor de Borradores
- **Ubicación:** Barra lateral del Catálogo Web y Selector Móvil.
- **Estructura en 4 Bloques:**
  1. **Bloque 1 (Creación Manual de Nuevos Productos):** Permite dar de alta uno o varios productos nuevos en simultáneo. Asigna prefijo y correlativo de SKU automáticamente según la categoría oficial de las 32 elegida. Guarda en WooCommerce (creando el post de tipo producto simple) y en Supabase (`dec_products`).
  2. **Bloque 2 (Buscar, Modificar, Borrador y Borrado de Productos):** Buscador reactivo por nombre o SKU. Permite editar campos, cambiar estado a `draft` (pausado/borrador) o `publish` (activo), o eliminar permanentemente el producto con confirmación de seguridad.
  3. **Bloque 3 (Tarjeta Visual - Gestor de Borradores / Productos Pausados):** Permite listar en tiempo real todos los productos en estado `draft` (fuera de línea) con botones directos para reactivar (`Publicar`) o eliminar (`Borrar`).
  4. **Bloque 4 (Carga Masiva de Fotos por Lote):** Permite seleccionar múltiples imágenes para subida concurrente.
- **Endpoints:**
  - `POST /api/products/update-details`: Actualiza campos, fotos, o crea productos nuevos con categoría.
  - `POST /api/products/toggle-status`: Alterna entre `draft` y `publish`.
  - `POST /api/products/delete`: Elimina de WooCommerce y Supabase.
  - `GET /api/products/drafts`: Lista productos pausados/borradores.
