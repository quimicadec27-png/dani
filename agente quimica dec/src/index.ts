import { bot } from "./telegram/bot.js";
import http from "http";

console.log("🔌 Estableciendo conexión con los servidores de Telegram...");

// Start the Telegram bot
bot.start();

console.log("🚀 ¡Conexión exitosa! El bot de Telegram está activo y escuchando...");

// Start an HTTP server to satisfy Render's port binding requirement
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "online", bot: "DANI" }));
}).listen(PORT, () => {
  console.log(`📡 Servidor HTTP activo en el puerto ${PORT} (para verificación de Render)`);
});

// Keep-alive ping mechanism for Render free tier (runs every 10 minutes)
const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
if (selfUrl) {
  console.log(`⏱️ Mecanismo Keep-Alive activo. Ping automático programado cada 10 minutos a: ${selfUrl}`);
  setInterval(async () => {
    try {
      const res = await fetch(selfUrl);
      if (res.ok) {
        console.log(`🎯 Ping Keep-Alive exitoso a ${selfUrl}: ${res.status}`);
      } else {
        console.warn(`⚠️ Advertencia Keep-Alive: Servidor retornó estado ${res.status}`);
      }
    } catch (err: any) {
      console.error(`❌ Error en ping Keep-Alive a ${selfUrl}:`, err.message);
    }
  }, 10 * 60 * 1000); // 10 minutes in milliseconds
} else {
  console.log("💡 Nota: RENDER_EXTERNAL_URL o SELF_URL no están definidos. No se iniciará el ping automático de Keep-Alive.");
}

