@echo off
:: ==============================================================================
:: EJECUTOR LOCAL - QUÍMICA DEC (Danilo)
:: ------------------------------------------------------------------------------
:: Este script arranca la escucha física en la PC para atender comandos de Supabase.
:: Funciona en cualquier máquina (PC de la empresa, laptop, PC de prueba del instituto).
:: ==============================================================================

:: Cambiar al directorio del script automáticamente (sin importar el disco o unidad)
cd /d "%~dp0"

echo.
echo 🔌 =========================================================
echo 🔌  Iniciando Ejecutor Local (Danilo - Química DEC)
echo 🔌  Directorio de Trabajo: %CD%
echo 🔌 =========================================================
echo.

:: Verificar si Node / npx está disponible en el PATH
where npx >nul 2>nul
if %errorlevel% neq 0 (
    echo ⚠️ ADVERTENCIA: 'npx' no fue encontrado en el PATH de esta computadora.
    echo 💡 Por favor asegurate de tener Node.js instalado o ejecuta:
    echo    npm run dev:executor
    echo.
    pause
    exit /b 1
)

:: Ejecutar el script local con TSX
npx tsx src/local_executor.ts

if %errorlevel% neq 0 (
    echo.
    echo ❌ Ocurrió un error al ejecutar local_executor.ts.
)

pause
