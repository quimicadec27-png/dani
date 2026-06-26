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

// Realtime postgres changes subscription
supabase.channel("cola_comandos")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "cola_comandos" }, async (payload: any) => {
    const { id, comando, argumentos, estado } = payload.new;
    
    if (estado === "pendiente" && comando === "organizar_directorio") {
      const targetPath = argumentos?.ruta_carpeta;
      console.log(`📥 Recibida orden: ${comando} para organizar la carpeta: ${targetPath}`);
      
      // Update state to 'ejecutando'
      await supabase.from("cola_comandos")
        .update({ estado: "ejecutando" })
        .eq("id", id);
        
      // Execute the local folder reorganization
      const resultado = organizarDirectorio(targetPath);
      console.log(`📤 Resultado de la ejecución: ${resultado}`);
      
      // Update state to 'completado'
      const { error } = await supabase.from("cola_comandos")
        .update({ 
          estado: resultado.startsWith("Error") ? "fallado" : "completado", 
          resultado 
        })
        .eq("id", id);

      if (error) {
        console.error("❌ Error al actualizar estado del comando en Supabase:", error.message);
      }
    }
  })
  .subscribe((status) => {
    console.log(`📡 Estado de la suscripción Realtime: ${status}`);
  });
