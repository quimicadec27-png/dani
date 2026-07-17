import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import ws from "ws";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } from "docx";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { actualizarPreciosDesdeCSV, procesarColaSincronizacion } from "./woocommerce_helper.js";

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
        let textToShow = file.rutaRelativa;
        if (file.tamanoMB > 10) {
          textToShow += " ⚠️ [ALERTA: >10MB]";
        }
        doc.text(textToShow, 30, currentY, { width: 300 });
        doc.text(file.extension, 350, currentY, { width: 80 });
        doc.text(`${file.tamanoMB} MB`, 450, currentY, { width: 100 });
        doc.moveDown(0.3);
      });

      doc.end();
      await new Promise<void>((resolve, reject) => {
        stream.on("finish", resolve);
        stream.on("error", reject);
      });
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
        let nameToShow = file.nombre;
        if (file.tamanoMB > 10) {
          nameToShow += " ⚠️ [ALERTA: >10MB]";
        }
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(nameToShow)] }),
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
    } else {
      return `Error: Formato '${formatoLimpio}' no soportado. Debe ser pdf, docx o xlsx.`;
    }

    // Misión de Darío: Copia automática de respaldo en backup_reportes
    try {
      const backupDir = path.join(ruta, "backup_reportes");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const backupPath = path.join(backupDir, `${nombreLimpio}.${formatoLimpio}`);
      fs.copyFileSync(rutaSalida, backupPath);
      console.log(`💾 Copia de respaldo guardada en: ${backupPath}`);
    } catch (backupErr: any) {
      console.error(`⚠️ Advertencia de respaldo: ${backupErr.message}`);
    }

    return `Éxito: Reporte ${formatoLimpio.toUpperCase()} generado en: ${nombreLimpio}.${formatoLimpio}`;
  } catch (error: any) {
    return `Error al generar reporte: ${error.message}`;
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function serializeCSVLine(cols: string[]): string {
  return cols.map(val => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      const escaped = val.replace(/"/g, '""');
      return `"${escaped}"`;
    }
    return val;
  }).join(',');
}

// Process a single command safely with atomic state transition
async function procesarComando(id: number, comando: string, argumentos: any, estadoActual: string) {
  if (estadoActual !== "pendiente") return;
  if (
    comando !== "organizar_directorio" && 
    comando !== "crear_reporte" && 
    comando !== "dec_actualizar_precios_woocommerce" &&
    comando !== "dec_actualizar_stock" &&
    comando !== "dec_actualizar_price"
  ) return;

  const targetPath = argumentos?.ruta_carpeta || argumentos?.sku || "";
  
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

  console.log(`📥 Procesando orden #${id}: ${comando} para: ${targetPath}`);
  
  let resultado = "";
  try {
    if (comando === "organizar_directorio") {
      resultado = organizarDirectorio(targetPath);
    } else if (comando === "crear_reporte") {
      const formato = argumentos?.formato || "pdf";
      const nombre = argumentos?.nombre || "reporteestado";
      resultado = await crearReporte(targetPath, formato, nombre);
    } else if (comando === "dec_actualizar_precios_woocommerce") {
      const csvPath = argumentos?.ruta_csv || "woocommerce_final_completo_csv-1783705700655.csv";
      const actualizacionCsvResult = await actualizarPreciosDesdeCSV(csvPath);
      console.log(`[CSV Sync Result] ${actualizacionCsvResult}`);
      const syncColaResult = await procesarColaSincronizacion();
      console.log(`[Sync Queue Result] ${syncColaResult}`);
      resultado = `Éxito: ${actualizacionCsvResult} | Detalle Cola: ${syncColaResult}`;
    } else if (comando === "dec_actualizar_stock" || comando === "dec_actualizar_price") {
      const { sku } = argumentos;
      const csvPath = path.resolve("../productos_activos_quimica_dec_csv-1784311287287.csv");
      
      if (!fs.existsSync(csvPath)) {
        throw new Error(`Archivo CSV no encontrado en: ${csvPath}`);
      }

      const csvContent = fs.readFileSync(csvPath, "utf-8");
      const lines = csvContent.split(/\r?\n/);
      let modificado = false;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = parseCSVLine(line);
        if (cols[1] === sku) { // cols[1] es SKU
          if (comando === "dec_actualizar_stock") {
            const cantidad = parseInt(argumentos.cantidad, 10);
            if (isNaN(cantidad)) throw new Error("La cantidad provista no es un número válido.");
            const currentStock = parseInt(cols[4] || "0", 10);
            cols[4] = (currentStock + cantidad).toString();
            cols[5] = parseInt(cols[4], 10) > 0 ? "instock" : "outofstock";
          } else {
            const precio = parseFloat(argumentos.precio);
            if (isNaN(precio)) throw new Error("El precio provisto no es un número válido.");
            cols[3] = precio.toString();
          }
          lines[i] = serializeCSVLine(cols);
          modificado = true;
          break;
        }
      }

      if (!modificado) {
        throw new Error(`Producto con SKU ${sku} no encontrado en el archivo CSV local.`);
      }

      fs.writeFileSync(csvPath, lines.join("\n"), "utf-8");
      console.log(`✅ CSV local modificado exitosamente.`);

      // 2. Sincronizar y actualizar la tabla dec_products en Supabase
      const updatedFields: any = {};
      if (comando === "dec_actualizar_stock") {
        const cantidad = parseInt(argumentos.cantidad, 10);
        const { data: prodData, error: selectErr } = await supabase
          .from("dec_products")
          .select("stock")
          .eq("sku", sku)
          .single();

        if (selectErr) {
          throw new Error(`Error al obtener stock actual de Supabase: ${selectErr.message}`);
        }

        updatedFields.stock = (prodData?.stock || 0) + cantidad;
        updatedFields.stock_status = updatedFields.stock > 0 ? "instock" : "outofstock";
      } else {
        const precio = parseFloat(argumentos.precio);
        // Obtenemos info actual para guardar historial antes de actualizar
        const { data: prodData, error: selectErr } = await supabase
          .from("dec_products")
          .select("price, name")
          .eq("sku", sku)
          .single();

        if (selectErr) {
          throw new Error(`Error al obtener precio actual de Supabase: ${selectErr.message}`);
        }

        const priceOld = prodData?.price || 0;
        const productName = prodData?.name || "";

        updatedFields.price = precio;

        // Registrar en dec_price_history
        const { error: histErr } = await supabase
          .from("dec_price_history")
          .insert({
            sku,
            product_name: productName,
            price_old: priceOld,
            price_new: precio
          });

        if (histErr) {
          console.error(`⚠️ Advertencia: No se pudo registrar historial de precios: ${histErr.message}`);
        }
      }

      const { error: updateErr } = await supabase
        .from("dec_products")
        .update(updatedFields)
        .eq("sku", sku);

      if (updateErr) {
        throw new Error(`Error actualizando Supabase: ${updateErr.message}`);
      }

      resultado = `Éxito: Actualización física completada para el SKU ${sku}`;
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
      .in("comando", ["organizar_directorio", "crear_reporte", "dec_actualizar_precios_woocommerce", "dec_actualizar_stock", "dec_actualizar_price"]);

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

// Sincronizador en segundo plano de WooCommerce dec_sync_queue (cada 15 segundos)
console.log("⏱️ Sincronizador de cola WooCommerce activo cada 15 segundos.");
setInterval(async () => {
  try {
    const res = await procesarColaSincronizacion();
    if (res !== "No hay tareas pendientes en la cola.") {
      console.log(`[Background Sync] ${res}`);
    }
  } catch (err: any) {
    console.error("❌ Error en sincronización en segundo plano de WooCommerce:", err.message);
  }
}, 15000);


