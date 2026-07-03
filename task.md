# Lista de Tareas — Implementación L19 a L20 Parte 2 (Solo Danilo)

- [x] Instalar dependencias necesarias (`docx`, `xlsx`, `pdfkit` y `@types/pdfkit`) en el directorio `agente quimica dec`.
- [x] Actualizar `system_instruction_dani.md` para asegurar que el modelo entienda su rol y las limitaciones del negocio.
- [x] Configurar el backend del bot de Telegram (`bot.ts`):
  - [x] Añadir especificaciones de herramientas (`organizar_directorio` y `crear_reporte`) al system prompt de la IA.
  - [x] Implementar la función de extracción robusta de JSON (`extraerJSON`).
  - [x] Implementar el procesamiento NLU en el manejador de mensajes de texto (reemplazando la regex rígida).
  - [x] Mapear "reporte de ventas" en PDF o Excel como un alias del comando `crear_reporte` (Misión de Danilo).
- [x] Actualizar el ejecutor local (`local_executor.ts`):
  - [x] Importar librerías de reportes (`docx`, `xlsx` y `pdfkit`).
  - [x] Implementar la función de escaneo recursivo de directorios.
  - [x] Implementar la generación de reportes nativos en PDF (`pdfkit`).
  - [x] Implementar la generación de reportes nativos en Word (`docx`).
  - [x] Implementar la generación de reportes nativos en Excel (`xlsx`).
  - [x] Manejar los parámetros dinámicos de formato y nombre (con valores por defecto).
- [x] Compilar y verificar:
  - [x] Verificar que no haya errores en la compilación de TypeScript (`npm run build`).
  - [x] Probar el bot de Telegram de forma local.
