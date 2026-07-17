import * as fs from "fs";
import * as path from "path";
import { sql } from "./db.js";

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

async function loadProducts() {
  if (!sql) {
    console.error("❌ Error: No se pudo conectar a la base de datos.");
    process.exit(1);
  }

  // Ruta al archivo CSV
  const csvPath = path.resolve("../productos_activos_quimica_dec_csv-1784311287287.csv");
  console.log(`📂 Leyendo archivo CSV desde: ${csvPath}`);

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Error: El archivo CSV no existe en la ruta especificada.`);
    process.exit(1);
  }

  try {
    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const lines = csvContent.split(/\r?\n/);
    
    // Ignorar cabecera
    const header = lines[0];
    console.log(`📊 Cabecera encontrada: ${header}`);

    let processedCount = 0;
    let successCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = parseCSVLine(line);
      if (cols.length < 3) {
        console.warn(`⚠️ Fila ${i + 1} ignorada por no tener suficientes columnas: "${line}"`);
        continue;
      }

      const type = cols[0] || 'simple';
      const sku = cols[1];
      const name = cols[2];
      
      if (!sku) {
        // Ignorar filas sin SKU
        continue;
      }

      processedCount++;

      // Parsear precio
      let price = 0.0;
      if (cols[3]) {
        const cleanedPrice = cols[3].replace(/[^\d.]/g, '');
        const parsed = parseFloat(cleanedPrice);
        if (!isNaN(parsed)) {
          price = parsed;
        }
      }

      // Parsear stock
      let stock = 0;
      if (cols[4]) {
        const parsed = parseInt(cols[4], 10);
        if (!isNaN(parsed)) {
          stock = parsed;
        }
      }

      const stockStatus = cols[5] || 'instock';
      const category = cols[6] || null;
      const subcategory = cols[7] || null;
      const imageUrl = cols[8] || null;
      const status = cols[9] || 'publish';

      try {
        await sql`
          INSERT INTO dec_products (sku, name, price, stock, stock_status, category, subcategory, image_url, status, type)
          VALUES (${sku}, ${name}, ${price}, ${stock}, ${stockStatus}, ${category}, ${subcategory}, ${imageUrl}, ${status}, ${type})
          ON CONFLICT (sku) DO UPDATE SET
            name = EXCLUDED.name,
            price = EXCLUDED.price,
            stock = EXCLUDED.stock,
            stock_status = EXCLUDED.stock_status,
            category = EXCLUDED.category,
            subcategory = EXCLUDED.subcategory,
            image_url = EXCLUDED.image_url,
            status = EXCLUDED.status,
            type = EXCLUDED.type,
            updated_at = NOW()
        `;
        successCount++;
      } catch (dbErr: any) {
        console.error(`❌ Error insertando SKU ${sku}:`, dbErr.message);
      }
    }

    console.log(`\n🎉 Carga de CSV finalizada.`);
    console.log(`-----------------------------------------------`);
    console.log(`✓ Procesados: ${processedCount}`);
    console.log(`✓ Cargados exitosamente: ${successCount}`);
    console.log(`-----------------------------------------------`);

  } catch (err: any) {
    console.error("❌ Error leyendo o parseando el CSV:", err.message);
  } finally {
    process.exit(0);
  }
}

loadProducts();
