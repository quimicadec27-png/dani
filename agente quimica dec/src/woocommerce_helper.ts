import { sql } from "./db.js";
import XLSX from "xlsx";
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

const WOO_URL = process.env.WOOCOMMERCE_URL || "";
const WOO_KEY = process.env.WOOCOMMERCE_CONSUMER_KEY || "";
const WOO_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET || "";

const auth = Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");
const headers = {
  "Authorization": `Basic ${auth}`,
  "Content-Type": "application/json"
};

function resolverRuta(ruta: string): string {
  if (!path.isAbsolute(ruta)) {
    const parentPath = path.join("..", ruta);
    if (fs.existsSync(parentPath)) {
      return parentPath;
    }
  }
  return ruta;
}

export async function actualizarPreciosDesdeCSV(csvPathRaw: string): Promise<string> {
  if (!sql) {
    return "Error: Conexión de base de datos no disponible.";
  }

  const csvPath = resolverRuta(csvPathRaw);
  if (!fs.existsSync(csvPath)) {
    return `Error: El archivo CSV no existe en la ruta: ${csvPath}`;
  }

  try {
    console.log(`📖 Leyendo CSV de precios desde: ${csvPath}...`);
    const workbook = XLSX.readFile(csvPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any>(sheet);

    console.log(`✓ Cargado CSV con ${rows.length} registros.`);

    // Cargar catálogo de base de datos en memoria para comparación rápida
    console.log("📥 Cargando precios actuales desde Supabase...");
    const dbProducts = await sql`
      SELECT id, sku, price, woocommerce_id 
      FROM dec_products 
      WHERE sku IS NOT NULL AND woocommerce_id IS NOT NULL
    `;

    const dbProductMap = new Map<string, { id: string; price: number; woocommerce_id: number }>();
    for (const p of dbProducts) {
      dbProductMap.set(p.sku.trim().toLowerCase(), {
        id: p.id,
        price: parseFloat(p.price || "0"),
        woocommerce_id: p.woocommerce_id
      });
    }

    let actualizados = 0;
    let omitidos = 0;

    console.log("🔄 Comparando precios...");
    for (const row of rows) {
      const sku = row.SKU ? String(row.SKU).trim() : null;
      if (!sku) continue;

      const precioCSV = parseFloat(row["Precio Regular"] || "0");
      const dbProd = dbProductMap.get(sku.toLowerCase());

      if (dbProd) {
        // Comparación con tolerancia a decimales
        if (Math.abs(dbProd.price - precioCSV) > 0.01) {
          // 1. Actualizar precio en dec_products
          await sql`
            UPDATE dec_products 
            SET price = ${precioCSV}, updated_at = NOW() 
            WHERE id = ${dbProd.id}
          `;

          // 2. Encolar tarea en dec_sync_queue
          await sql`
            INSERT INTO dec_sync_queue (sku, action_type, payload, status)
            VALUES (
              ${sku}, 
              'update_price', 
              ${sql.json({ woocommerce_id: dbProd.woocommerce_id, price: precioCSV })}, 
              'pending'
            )
          `;

          actualizados++;
        } else {
          omitidos++;
        }
      } else {
        omitidos++;
      }
    }

    return `Sincronización de CSV finalizada. Actualizados en DB y encolados: ${actualizados} productos. Sin cambios / No encontrados: ${omitidos} productos.`;
  } catch (err: any) {
    console.error("❌ Error en actualizarPreciosDesdeCSV:", err.message);
    return `Error al procesar el CSV: ${err.message}`;
  }
}

export async function procesarColaSincronizacion(): Promise<string> {
  if (!sql) {
    return "Error: Conexión de base de datos no disponible.";
  }

  try {
    // 1. Obtener comandos encolados con sus detalles de producto correspondientes
    const pending = await sql`
      SELECT q.id as queue_id, q.sku, q.payload, p.woocommerce_id, p.parent_id, p.type 
      FROM dec_sync_queue q
      JOIN dec_products p ON q.sku = p.sku
      WHERE q.status = 'pending' AND q.action_type = 'update_price'
      ORDER BY q.created_at ASC
      LIMIT 100
    `;

    if (pending.length === 0) {
      return "No hay tareas pendientes en la cola.";
    }

    console.log(`🚀 Procesando ${pending.length} tareas de actualización en WooCommerce...`);

    // Marcar como en proceso
    const queueIds = pending.map(item => item.queue_id);
    await sql`
      UPDATE dec_sync_queue 
      SET status = 'processing' 
      WHERE id IN ${sql(queueIds)}
    `;

    // Agrupación para Batch
    const simplesToUpdate: any[] = [];
    const variationsByParent = new Map<number, any[]>();
    const itemMap = new Map<number, string[]>(); // key: woocommerce_id -> list of queue_ids (strings)

    for (const item of pending) {
      const qId = String(item.queue_id);
      const wooId = item.woocommerce_id;
      const newPrice = String(item.payload.price);
      const parentId = item.parent_id;

      if (!itemMap.has(wooId)) {
        itemMap.set(wooId, []);
      }
      itemMap.get(wooId)!.push(qId);

      if (item.type === "variation" && parentId) {
        if (!variationsByParent.has(parentId)) {
          variationsByParent.set(parentId, []);
        }
        variationsByParent.get(parentId)!.push({ id: wooId, regular_price: newPrice });
      } else {
        simplesToUpdate.push({ id: wooId, regular_price: newPrice });
      }
    }

    const completedQueueIds: string[] = [];
    const failedQueueIds = new Map<string, string>(); // queue_id -> error message

    // Función auxiliar para actualizar estados
    const handleResult = (successIds: number[], errorIds: number[], errorMsg: string) => {
      for (const id of successIds) {
        const qIds = itemMap.get(id) || [];
        completedQueueIds.push(...qIds);
      }
      for (const id of errorIds) {
        const qIds = itemMap.get(id) || [];
        for (const qId of qIds) {
          failedQueueIds.set(qId, errorMsg);
        }
      }
    };

    // A. PROCESAR PRODUCTOS SIMPLES
    if (simplesToUpdate.length > 0) {
      const url = `${WOO_URL}/wp-json/wc/v3/products/batch`;
      console.log(`📤 Enviando lote de ${simplesToUpdate.length} productos simples a WooCommerce...`);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ update: simplesToUpdate })
        });
        
        if (res.ok) {
          const result = await res.json() as any;
          // Si todo salió bien, agregamos todos a completados
          const updatedIds = simplesToUpdate.map(s => s.id);
          handleResult(updatedIds, [], "");
          console.log(`✅ Lote de productos simples procesado con éxito.`);
        } else {
          const errText = await res.text();
          console.error("❌ Fallo en lote de productos simples:", errText);
          const simpleIds = simplesToUpdate.map(s => s.id);
          handleResult([], simpleIds, `WooCommerce API Error: ${errText}`);
        }
      } catch (err: any) {
        console.error("❌ Fallo en lote de productos simples (Fetch):", err.message);
        const simpleIds = simplesToUpdate.map(s => s.id);
        handleResult([], simpleIds, `Fetch Error: ${err.message}`);
      }
    }

    // B. PROCESAR VARIACIONES AGRUPADAS POR PADRE
    for (const [parentId, variations] of variationsByParent.entries()) {
      const url = `${WOO_URL}/wp-json/wc/v3/products/${parentId}/variations/batch`;
      console.log(`📤 Enviando lote de ${variations.length} variaciones del padre #${parentId} a WooCommerce...`);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ update: variations })
        });

        if (res.ok) {
          const result = await res.json() as any;
          const varIds = variations.map(v => v.id);
          handleResult(varIds, [], "");
          console.log(`✅ Lote de variaciones para padre #${parentId} procesado con éxito.`);
        } else {
          const errText = await res.text();
          console.error(`❌ Fallo en lote de variaciones para padre #${parentId}:`, errText);
          const varIds = variations.map(v => v.id);
          handleResult([], varIds, `WooCommerce API Error (Variations): ${errText}`);
        }
      } catch (err: any) {
        console.error(`❌ Fallo en lote de variaciones para padre #${parentId} (Fetch):`, err.message);
        const varIds = variations.map(v => v.id);
        handleResult([], varIds, `Fetch Error (Variations): ${err.message}`);
      }
    }

    // C. ACTUALIZAR ESTADOS EN LA BASE DE DATOS
    if (completedQueueIds.length > 0) {
      await sql`
        UPDATE dec_sync_queue 
        SET status = 'completed', processed_at = NOW() 
        WHERE id IN ${sql(completedQueueIds)}
      `;
    }

    for (const [qId, errMsg] of failedQueueIds.entries()) {
      await sql`
        UPDATE dec_sync_queue 
        SET status = 'failed', error_message = ${errMsg}, processed_at = NOW() 
        WHERE id = ${qId}
      `;
    }

    return `Procesamiento de cola terminado. Exitosos: ${completedQueueIds.length}. Fallidos: ${failedQueueIds.size}.`;
  } catch (err: any) {
    console.error("❌ Error en procesarColaSincronizacion:", err.message);
    return `Error general procesando la cola: ${err.message}`;
  }
}
