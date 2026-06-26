@echo off
SET "PATH=Z:\Documents\Curso Automatización de Negocios y Ventas con IA\Rossier Dario\DRC\Agente_Telegram\.node;%PATH%"
cd /d "%~dp0"
echo 🔌 Iniciando Ejecutor Local (Danilo)...
npx tsx src/local_executor.ts
pause
