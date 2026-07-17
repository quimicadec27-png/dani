import { bot } from "./telegram/bot.js";
import http from "http";

// ─── Global error handler for the bot ─────────────────────────
bot.catch((err) => {
  console.error("❌ Error capturado por bot.catch():", err.message || err);
});

// ─── Render Zero-Downtime Deploy 409 Conflict Handlers ────────
process.on("uncaughtException", (err) => {
  const errMsg = err.message || String(err);
  if (errMsg.includes("409") || errMsg.includes("Conflict") || errMsg.includes("getUpdates")) {
    console.warn("⚠️ [CONFLICT-409] Conflicto temporal de getUpdates detectado. Ignorando para permitir despliegue de Render...");
  } else {
    console.error("❌ Uncaught Exception:", err);
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason: any) => {
  const errMsg = reason?.message || String(reason);
  if (errMsg.includes("409") || errMsg.includes("Conflict") || errMsg.includes("getUpdates")) {
    console.warn("⚠️ [CONFLICT-409] Conflicto temporal de getUpdates (Rejection) detectado. Ignorando para permitir despliegue de Render...");
  } else {
    console.error("❌ Unhandled Rejection:", reason);
    process.exit(1);
  }
});

// ─── Delete any pending webhook before starting long polling ──
// This prevents the 409 "Conflict: terminated by other getUpdates"
// that happens when Render restarts or deploys a new instance.
async function startBot() {
  try {
    console.log("🔌 Eliminando webhook anterior (si existe) antes de iniciar polling...");
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    console.log("✅ Webhook eliminado correctamente.");
  } catch (err: any) {
    console.warn("⚠️ No se pudo eliminar webhook (puede ser normal):", err.message);
  }

  console.log("🔌 Estableciendo conexión con los servidores de Telegram...");
  
  bot.start({
    drop_pending_updates: true,
    onStart: () => {
      console.log("🚀 ¡Conexión exitosa! El bot de Telegram está activo y escuchando...");
    }
  });
}

startBot();

// ─── HTTP server for Render's port binding requirement ────────
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "online", bot: "Santi", timestamp: new Date().toISOString() }));
}).listen(PORT, () => {
  console.log(`📡 Servidor HTTP activo en el puerto ${PORT} (para verificación de Render)`);
});

// ─── Keep-alive ping (every 10 min) to prevent Render spin-down ─
const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || "https://dani-bxav.onrender.com";
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
}, 10 * 60 * 1000); // 10 minutes

// ─── Graceful shutdown on SIGTERM (Render sends this before stopping) ─
process.on("SIGTERM", async () => {
  console.log("🛑 Señal SIGTERM recibida. Deteniendo bot de forma limpia...");
  try {
    await bot.stop();
  } catch (err: any) {
    console.warn("⚠️ Error al detener bot:", err.message);
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("🛑 Señal SIGINT recibida. Deteniendo bot de forma limpia...");
  try {
    await bot.stop();
  } catch (err: any) {
    console.warn("⚠️ Error al detener bot:", err.message);
  }
  process.exit(0);
});
