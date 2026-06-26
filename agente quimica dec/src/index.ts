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

