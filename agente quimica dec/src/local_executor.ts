import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import ws from "ws";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } from "docx";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";

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

function resolverRuta(ruta: string): string {
  if (!path.isAbsolute(ruta)) {
    const parentPath = path.join("..", ruta);
    if (fs.existsSync(parentPath)) {
      return parentPath;
    }
  }
  return ruta;
}

function organizarDirectorio(rutaRaw: string): string {
  const ruta = resolverRuta(rutaRaw);
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

interface ArchivoEscaneado {
  nombre: string;
  rutaRelativa: string;
  extension: string;
  tamanoBytes: number;
  tamanoMB: number;
}

function escanearDirectorioRecursivo(dirBase: string, dirActual: string = dirBase): ArchivoEscaneado[] {
  let resultados: ArchivoEscaneado[] = [];
  
  if (!fs.existsSync(dirActual)) return resultados;
  
  const items = fs.readdirSync(dirActual);
  
  for (const item of items) {
    const rutaAbsoluta = path.join(dirActual, item);
    const stat = fs.statSync(rutaAbsoluta);
    
    if (stat.isDirectory()) {
      if (item !== "node_modules" && item !== ".git" && item !== "backup_reportes") {
        resultados = resultados.concat(escanearDirectorioRecursivo(dirBase, rutaAbsoluta));
      }
    } else {
      const extension = path.extname(item).toLowerCase().substring(1) || "OTROS";
      const rutaRelativa = path.relative(dirBase, rutaAbsoluta);
      resultados.push({
        nombre: item,
        rutaRelativa: rutaRelativa,
        extension: extension.toUpperCase(),
        tamanoBytes: stat.size,
        tamanoMB: parseFloat((stat.size / (1024 * 1024)).toFixed(2))
      });
    }
  }
  
  return resultados;
}

async function crearReporte(rutaRaw: string, formato: string = "pdf", nombre: string = "reporteestado"): Promise<string> {
  const ruta = resolverRuta(rutaRaw);
  if (!fs.existsSync(ruta)) {
    return `Error: La ruta ${ruta} no existe.`;
  }

  try {
    const archivos = escanearDirectorioRecursivo(ruta);
    if (archivos.length === 0) {
      return `Error: No se encontraron archivos en la carpeta ${ruta}.`;
    }

    const formatoLimpio = formato.toLowerCase().trim();
    const nombreLimpio = nombre.trim();
    const rutaSalida = path.join(ruta, `${nombreLimpio}.${formatoLimpio}`);

    if (formatoLimpio === "pdf") {
      const doc = new PDFDocument({ margin: 30 });
      const stream = fs.createWriteStream(rutaSalida);
      doc.pipe(stream);

      doc.fontSize(18).text(`Reporte de Estado — Química DEC`, { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Carpeta escaneada: ${path.resolve(ruta)}`);
      doc.text(`Fecha de generación: ${new Date().toLocaleString("es-AR")}`);
      doc.text(`Cantidad de archivos encontrados: ${archivos.length}`);
      doc.moveDown();

      // Cabecera Tabla
      const headerY = doc.y;
      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("Nombre / Ruta", 30, headerY, { width: 300 });
      doc.text("Extensión", 350, headerY, { width: 80 });
      doc.text("Tamaño (MB)", 450, headerY, { width: 100 });
      doc.font("Helvetica");
      doc.moveDown(0.2);
      doc.moveTo(30, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      archivos.forEach(file => {
        if (doc.y > 700) {
          doc.addPage();
          const pageHeaderY = doc.y;
          doc.fontSize(10).font("Helvetica-Bold");
          doc.text("Nombre / Ruta", 30, pageHeaderY, { width: 300 });
          doc.text("Extensión", 350, pageHeaderY, { width: 80 });
          doc.text("Tamaño (MB)", 450, pageHeaderY, { width: 100 });
          doc.font("Helvetica");
          doc.moveDown(0.2);
          doc.moveTo(30, doc.y).lineTo(550, doc.y).stroke();
          doc.moveDown(0.5);
        }
        const currentY = doc.y;
        doc.text(file.rutaRelativa, 30, currentY, { width: 300 });
        doc.text(file.extension, 350, currentY, { width: 80 });
        doc.text(`${file.tamanoMB} MB`, 450, currentY, { width: 100 });
        doc.moveDown(0.3);
      });

      doc.end();
      await new Promise<void>((resolve, reject) => {
        stream.on("finish", resolve);
        stream.on("error", reject);
      });

      return `Éxito: Reporte PDF generado en: ${nombreLimpio}.pdf`;
    } else if (formatoLimpio === "xlsx") {
      const data = archivos.map(f => ({
        "Nombre de Archivo": f.nombre,
        "Ruta Relativa": f.rutaRelativa,
        "Extensión": f.extension,
        "Tamaño (MB)": f.tamanoMB
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario de Archivos");
      XLSX.writeFile(workbook, rutaSalida);

      return `Éxito: Reporte Excel generado en: ${nombreLimpio}.xlsx`;
    } else if (formatoLimpio === "docx") {
      const tableRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Nombre de Archivo", bold: true })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Ruta Relativa", bold: true })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Extensión", bold: true })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Tamaño (MB)", bold: true })] })] })
          ]
        })
      ];

      archivos.forEach(file => {
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(file.nombre)] }),
              new TableCell({ children: [new Paragraph(file.rutaRelativa)] }),
              new TableCell({ children: [new Paragraph(file.extension)] }),
              new TableCell({ children: [new Paragraph(`${file.tamanoMB} MB`)] })
            ]
          })
        );
      });

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: "Reporte de Estado — Química DEC",
                heading: "Heading1"
              }),
              new Paragraph({ text: `Carpeta escaneada: ${path.resolve(ruta)}` }),
              new Paragraph({ text: `Fecha de generación: ${new Date().toLocaleString("es-AR")}` }),
              new Paragraph({ text: `Cantidad de archivos encontrados: ${archivos.length}` }),
              new Paragraph({ text: "" }),
              new Table({
                rows: tableRows
              })
            ]
          }
        ]
      });

      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(rutaSalida, buffer);

      return `Éxito: Reporte Word generado en: ${nombreLimpio}.docx`;
    } else {
      return `Error: Formato '${formatoLimpio}' no soportado. Debe ser pdf, docx o xlsx.`;
    }
  } catch (error: any) {
    return `Error al generar reporte: ${error.message}`;
  }
}

// Process a single command safely with atomic state transition
async function procesarComando(id: number, comando: string, argumentos: any, estadoActual: string) {
  if (estadoActual !== "pendiente") return;
  if (comando !== "organizar_directorio" && comando !== "crear_reporte") return;

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
  
  let resultado = "";
  try {
    if (comando === "organizar_directorio") {
      resultado = organizarDirectorio(targetPath);
    } else if (comando === "crear_reporte") {
      const formato = argumentos?.formato || "pdf";
      const nombre = argumentos?.nombre || "reporteestado";
      resultado = await crearReporte(targetPath, formato, nombre);
    }
  } catch (err: any) {
    resultado = `Error general de ejecución: ${err.message}`;
  }
  
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
      .in("comando", ["organizar_directorio", "crear_reporte"]);

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
