# Plan de Implementación — Evolución a Lenguaje Natural y Reportes Multiformato (L19 a L20 Parte 2)

Este plan de implementación describe las diferencias entre el estado actual del agente de Química DEC y los requisitos establecidos en las lecciones del Módulo 4 (L19, L20 Parte 1 y L20 Parte 2), y propone un plan paso a paso para completar la integración.

---

## Estatus y Diagnóstico Actual

Actualmente, el proyecto `agente quimica dec` tiene una implementación básica de la **Arquitectura en Puente (Nube -> Supabase -> PC Local)**:
- **Ejecutor local (`src/local_executor.ts`)**: Escucha la tabla `cola_comandos` de Supabase mediante Realtime y polling de respaldo, y tiene implementada la función `organizarDirectorio` (organización por extensión de archivos en carpetas).
- **Bot de Telegram (`src/telegram/bot.ts`)**: Tiene cargado el catálogo de productos y las instrucciones del sistema, y procesa conversaciones mediante la API de Groq (Llama 3.1 8B). Sin embargo, la ejecución del comando de organización se realiza a través de una expresión regular rígida (`orgMatch`), no mediante NLU real.

---

## Brechas Identificadas (Gaps) respecto a las Lecciones

### 1. Lección 19 — Planificación Táctica
La lección 19 es metodológica. Describe la lógica de crear campañas semanales en un planificador de redes sociales (Meta Business Suite) con 4 objetivos distintos durante el mes (S1: Activación, S2: Producto, S3: Prueba Social, S4: CTA Fuerte).
* **Estado:** No requiere cambios directos en el código del bot de Telegram, a menos que se desee integrar herramientas para facilitar la generación de ideas de contenido. Sin embargo, para cumplir con el espíritu táctico de la empresa, el archivo `system_instruction_dani.md` debe estar alineado con estas directivas comerciales de Química DEC.

### 2. Lección 20 — Parte 1: Tool Calling y Automatización Local
* **Estado:** Parcialmente implementado. La base de datos `cola_comandos` y el flujo de puente existen, pero el bot de Telegram intercepta el texto usando regex en lugar de permitir que el LLM tome la decisión operativa de forma autónoma.

### 3. Lección 20 — Parte 2: Evolución a Lenguaje Natural (NLU) y Reportes
Aquí es donde se concentran los mayores faltantes en el código actual:
1. **Dependencias no instaladas**: Las librerías `docx`, `xlsx` (SheetJS) y `pdfkit` no están instaladas en el `package.json` del proyecto.
2. **Falta de NLU (Comprensión del Lenguaje Natural)**: El bot no utiliza el LLM para decidir si debe invocar herramientas (`organizar_directorio` o `crear_reporte`). Tampoco extrae de forma inteligente los parámetros en formato JSON.
3. **Falta de Extractor JSON**: La IA a veces devuelve texto extra con el JSON. Falta implementar el extractor robusto `{ ... }` en `bot.ts`.
4. **Falta de Comando `crear_reporte`**:
   - En el Bot (`bot.ts`): No está configurado en el System Prompt de la IA para que reconozca los parámetros `ruta_carpeta`, `formato` (pdf/docx/xlsx) y `nombre` (nombre personalizado sin extensión).
   - En el Ejecutor Local (`local_executor.ts`): Falta por completo la implementación del comando `crear_reporte`.
5. **Falta de Escaneo Recursivo**: La búsqueda de archivos en el ejecutor local actual no entra a las subcarpetas, lo que causará reportes vacíos si las carpetas ya están organizadas.
6. **Misiones Aceleradas de Alumnos**:
   - **Danilo (Ventas):** El bot debe reconocer "reporte de ventas en PDF" como un alias del comando `crear_reporte`.
   - **Tomás (Depósito):** El ejecutor local debe alertar en reportes Word/PDF si encuentra archivos de más de 10 MB.
   - **Tadeo (Agencia):** El bot debe indicar amablemente qué formatos soporta si el usuario ingresa uno no válido.
   - **Darío (Administración):** El ejecutor local debe guardar una copia automática de cada reporte en una carpeta `backup_reportes`.

---

## Propuesta de Cambios Paso a Paso

### 📦 Componente 1: Configuración y Dependencias

#### [MODIFY] [package.json](file:///z:/Documents/Curso%20Automatizaci%C3%B3n%20de%20Negocios%20y%20Ventas%20con%20IA/Barsotti%20Danilo/dani%20ia/agente%20quimica%20dec/package.json)
Instalar las dependencias requeridas para la generación de reportes y añadir sus declaraciones de tipo en caso necesario:
- `docx` (creación de archivos Word nativos).
- `xlsx` (creación de archivos Excel nativos con SheetJS).
- `pdfkit` (creación de PDFs nativos).
- `@types/pdfkit` (para compatibilidad de tipos con TypeScript).

---

### 🧠 Componente 2: Bot en la Nube (NLU & Tool Calling)

#### [MODIFY] [bot.ts](file:///z:/Documents/Curso%20Automatizaci%C3%B3n%20de%20Negocios%20y%20Ventas%20con%20IA/Barsotti%20Danilo/dani%20ia/agente%20quimica%20dec/src/telegram/bot.ts)
1. **System Prompt de IA**: Modificar `getGroqResponse` para indicarle al modelo de lenguaje que tiene dos herramientas disponibles en formato JSON:
   - `organizar_directorio` (argumentos: `ruta_carpeta`).
   - `crear_reporte` (argumentos: `ruta_carpeta`, `formato` ["pdf" | "docx" | "xlsx"], `nombre` [string]).
   - Instruir a la IA para que devuelva un bloque JSON cuando el usuario solicite estas tareas en lenguaje natural.
2. **Extractor de JSON robusto**: Implementar una función `extraerJSON(texto)` que localice el primer `{` y el último `}` y parsear únicamente esa cadena.
3. **Manejador de Mensajes NLU**:
   - Reemplazar la regex fija por la llamada a la IA de Groq.
   - Si la IA devuelve un JSON válido de herramienta, insertar el comando correspondiente en la tabla `cola_comandos` con estado `pendiente` y argumentos deducidos.
   - Realizar la lógica de espera (polling a Supabase) para notificar al usuario el éxito o fallo del comando.
   - Si el formato solicitado no es válido (ej. PowerPoint), filtrar antes en el bot y responder con el mensaje amigable de formatos soportados (Misión de Tadeo).
   - Mapear "reporte de ventas" u otras solicitudes similares al comando `crear_reporte` (Misión de Danilo).

---

### 💻 Componente 3: Ejecutor Local (Escaneo y Generación de Formatos)

#### [MODIFY] [local_executor.ts](file:///z:/Documents/Curso%20Automatizaci%C3%B3n%20de%20Negocios%20y%20Ventas%20con%20IA/Barsotti%20Danilo/dani%20ia/agente%20quimica%20dec/src/local_executor.ts)
1. **Importar Librerías**: Añadir imports para `docx`, `xlsx` y `pdfkit`.
2. **Función de Escaneo Recursivo**: Implementar `escanearDirectorioRecursivo(dirPath)` para compilar la lista completa de archivos en el árbol de carpetas con sus atributos (nombre, tamaño en MB, extensión, ruta).
3. **Generador de Reporte Word (DOCX)**: Usar la librería `docx` para crear una tabla con las columnas: Nombre de Archivo, Carpeta y Tamaño. Si el archivo supera los 10 MB, agregar un texto de alerta al lado del nombre (Misión de Tomás).
4. **Generador de Reporte Excel (XLSX)**: Usar la librería `xlsx` para estructurar la hoja de cálculo con filas ordenadas por extensión y tamaño.
5. **Generador de Reporte PDF (PDFKit)**: Crear un documento PDF estructurado visualmente con título, fecha, tabla de archivos y advertencias de gran tamaño.
6. **Manejo de Respaldos**: Guardar automáticamente una copia del reporte generado en una subcarpeta llamada `backup_reportes` dentro de la carpeta raíz antes de finalizar la tarea (Misión de Darío).
7. **Procesador de Comandos**: Ampliar la función `procesarComando` para admitir `crear_reporte` y mapear los parámetros `formato` y `nombre` pasados en `argumentos`.

---

## Plan de Verificación

### Pruebas Automatizadas
- Probar la compilación de TypeScript para asegurar que no hay problemas de tipos:
  ```bash
  npm run build
  ```

### Verificación Manual
1. Iniciar el ejecutor local en la PC de desarrollo:
   ```bash
   npm run dev (o tsx src/local_executor.ts)
   ```
2. Interactuar en lenguaje natural con el bot de Telegram y probar los siguientes casos:
   - *"Hacé un reporte de la carpeta test_folder en formato excel"* -> Debe crear `reporteestado.xlsx` en la carpeta y una copia en `test_folder/backup_reportes`.
   - *"Creá un reporte en word que se llame reporte_deposito de la carpeta test_folder"* -> Debe crear `reporte_deposito.docx` con alertas de >10MB si existen.
   - *"Generame un PDF de la carpeta test_folder"* -> Debe crear `reporteestado.pdf`.
   - *"Ordená la carpeta test_folder"* -> Debe mover los archivos a subcarpetas `/DOCX`, `/PDF`, etc., sin perder la habilidad de listarlos en reportes recursivos subsiguientes.
   - *"Pasame un reporte de ventas en PDF"* -> Debe interpretar el alias de Danilo y ejecutar el reporte en la carpeta por defecto.
   - *"Hacé un reporte en PowerPoint"* -> Debe responder amablemente indicando que solo soporta PDF, Word o Excel.
