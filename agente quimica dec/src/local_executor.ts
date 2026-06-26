import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import ws from "ws";

// Polyfill global WebSocket for Node.js < 22 support in Supabase Realtime client
(global as any).WebSocket = ws;

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Error: SUPABASE_URL and SUPABASE_KEY must be defined in the .env file.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
console.log("🔌 Cliente local (ejecutor) de Danilo iniciado y escuchando comandos...");

function organizarDirectorio(ruta: string): string {
  if (!fs.existsSync(ruta)) {
    return `Error: La ruta ${ruta} no existe.`;
  }
  
  try {
    const archivos = fs.readdirSync(ruta);
    let contador = 0;
    
    archivos.forEach(archivo => {
      const rutaCompleta = path.join(ruta, archivo);
      if (fs.lstatSync(rutaCompleta).isFile()) {
        const ext = path.extname(archivo).toLowerCase().substring(1) || "OTROS";
        const carpetaDestino = path.join(ruta, ext.toUpperCase());
        
        if (!fs.existsSync(carpetaDestino)) {
          fs.mkdirSync(carpetaDestino);
        }
        
        fs.renameSync(rutaCompleta, path.join(carpetaDestino, archivo));
        contador++;
      }
    });
    
    return `Se organizaron ${contador} archivos por tipo.`;
  } catch (error: any) {
    return `Error al organizar: ${error.message}`;
  }
}

// Process a single command safely with atomic state transition
async function procesarComando(id: number, comando: string, argumentos: any, estadoActual: string) {
  if (estadoActual !== "pendiente" || comando !== "organizar_directorio") return;

  const targetPath = argumentos?.ruta_carpeta;
  
  // Atomic claim: Transition state from 'pendiente' to 'ejecutando'
  // If another process or previous listener already updated it, this update will return 0 rows.
  const { data, error: claimError } = await supabase
    .from("cola_comandos")
    .update({ estado: "ejecutando" })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select();

  if (claimError) {
    console.error(`❌ Error intentando reservar comando #${id}:`, claimError.message);
    return;
  }

  // If no rows were updated, it means it was already claimed
  if (!data || data.length === 0) {
    return;
  }

  console.log(`📥 Procesando orden #${id}: ${comando} para la carpeta: ${targetPath}`);
  
  // Execute the local folder reorganization
  const resultado = organizarDirectorio(targetPath);
  console.log(`📤 Resultado de la ejecución para #${id}: ${resultado}`);
  
  // Update state to 'completado' or 'fallado'
  const { error: updateError } = await supabase
    .from("cola_comandos")
    .update({ 
      estado: resultado.startsWith("Error") ? "fallado" : "completado", 
      resultado 
    })
    .eq("id", id);

  if (updateError) {
    console.error(`❌ Error al actualizar estado del comando #${id} en Supabase:`, updateError.message);
  }
}

// 1. Realtime postgres changes subscription
supabase.channel("cola_comandos")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "cola_comandos" }, async (payload: any) => {
    const { id, comando, argumentos, estado } = payload.new;
    await procesarComando(id, comando, argumentos, estado);
  })
  .subscribe((status) => {
    console.log(`📡 Estado de la suscripción Realtime: ${status}`);
  });

// 2. Polling Fallback (runs every 5 seconds as a backup for WebSockets/Replication issues)
console.log("⏱️ Respaldo de sondeo (polling) activo cada 5 segundos.");
setInterval(async () => {
  try {
    const { data, error } = await supabase
      .from("cola_comandos")
      .select("*")
      .eq("estado", "pendiente")
      .eq("comando", "organizar_directorio");

    if (error) {
      console.error("❌ Error en sondeo (polling) de comandos:", error.message);
      return;
    }

    if (data && data.length > 0) {
      for (const cmd of data) {
        await procesarComando(cmd.id, cmd.comando, cmd.argumentos, cmd.estado);
      }
    }
  } catch (err: any) {
    console.error("❌ Error inesperado en sondeo (polling):", err.message);
  }
}, 5000);
