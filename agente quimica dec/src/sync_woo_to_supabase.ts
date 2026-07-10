import { sql } from "./db.js";
import * as dotenv from "dotenv";

dotenv.config();

const WOO_URL = process.env.WOOCOMMERCE_URL || "";
const WOO_KEY = process.env.WOOCOMMERCE_CONSUMER_KEY || "";
const WOO_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET || "";

if (!WOO_URL || !WOO_KEY || !WOO_SECRET) {
  console.error("❌ Error: WOOCOMMERCE_URL, WOOCOMMERCE_CONSUMER_KEY, and WOOCOMMERCE_CONSUMER_SECRET must be defined in the .env file.");
  process.exit(1);
}

if (!sql) {
  console.error("❌ Error: Módulo de base de datos no disponible.");
  process.exit(1);
}

const auth = Buffer.from(`${WOO_KEY}:${WOO_SECRET}`).toString("base64");
const headers = {
  "Authorization": `Basic ${auth}`,
  "Content-Type": "application/json"
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

async function fetchAllPages(endpoint: string): Promise<any[]> {
  let allData: any[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${WOO_URL}/wp-json/wc/v3/${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`;
    console.log(`📥 Descargando página ${page} desde: ${endpoint}...`);
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }
      const data = (await response.json()) as any[];
      if (data.length === 0) {
        hasMore = false;
      } else {
        allData = allData.concat(data);
        page++;
        await delay(200); // Retardo de cortesía
      }
    } catch (err: any) {
      console.error(`❌ Error en fetch de la página ${page}:`, err.message);
      hasMore = false;
    }
  }

  return allData;
}

interface DBProduct {
  sku: string;
  name: string;
  price: number;
  stock: number;
  status: string;
  category_id: string | null;
  image_url: string | null;
  woocommerce_id: number;
  parent_id: number | null;
  type: string;
}

async function upsertProduct(p: DBProduct) {
  if (!sql) return;

  // Buscar si existe por SKU o por woocommerce_id
  const existing = await sql!`
    SELECT id FROM dec_products 
    WHERE sku = ${p.sku} OR woocommerce_id = ${p.woocommerce_id}
    LIMIT 1
  `;

  if (existing.length > 0) {
    const id = existing[0].id;
    await sql!`
      UPDATE dec_products SET
        sku = ${p.sku},
        name = ${p.name},
        price = ${p.price},
        stock = ${p.stock},
        status = ${p.status},
        category_id = ${p.category_id},
        image_url = ${p.image_url},
        woocommerce_id = ${p.woocommerce_id},
        parent_id = ${p.parent_id},
        type = ${p.type},
        last_sync = NOW(),
        updated_at = NOW()
      WHERE id = ${id}
    `;
  } else {
    await sql!`
      INSERT INTO dec_products (sku, name, price, stock, status, category_id, image_url, woocommerce_id, parent_id, type, last_sync)
      VALUES (${p.sku}, ${p.name}, ${p.price}, ${p.stock}, ${p.status}, ${p.category_id}, ${p.image_url}, ${p.woocommerce_id}, ${p.parent_id}, ${p.type}, NOW())
    `;
  }
}

async function runSync() {
  console.log("🔄 Iniciando sincronización del catálogo de WooCommerce a Supabase...");

  try {
    // 1. SINCRONIZAR CATEGORÍAS
    console.log("\n📦 Sincronizando categorías...");
    const wooCategories = await fetchAllPages("products/categories");
    console.log(`✓ Descargadas ${wooCategories.length} categorías.`);

    // Mapeo temporal WooCommerce ID -> ID Interno
    const categoryMapping = new Map<number, string>();

    // Primera pasada: Insertar categorías
    for (const cat of wooCategories) {
      const existing = await sql!`
        SELECT id FROM dec_categories WHERE woocommerce_id = ${cat.id} LIMIT 1
      `;
      let internalId: string;
      if (existing.length > 0) {
        internalId = existing[0].id;
        await sql!`
          UPDATE dec_categories SET
            name = ${cat.name},
            slug = ${cat.slug}
          WHERE id = ${internalId}
        `;
      } else {
        const inserted = await sql!`
          INSERT INTO dec_categories (woocommerce_id, name, slug)
          VALUES (${cat.id}, ${cat.name}, ${cat.slug})
          RETURNING id
        `;
        internalId = inserted[0].id;
      }
      categoryMapping.set(cat.id, internalId);
    }

    // Segunda pasada: Vincular parent_id
    for (const cat of wooCategories) {
      if (cat.parent && cat.parent !== 0) {
        const parentInternalId = categoryMapping.get(cat.parent);
        const internalId = categoryMapping.get(cat.id);
        if (parentInternalId && internalId) {
          await sql!`
            UPDATE dec_categories SET parent_id = ${parentInternalId} WHERE id = ${internalId}
          `;
        }
      }
    }
    console.log("✅ Categorías sincronizadas correctamente.");

    // 2. SINCRONIZAR PRODUCTOS Y VARIACIONES
    console.log("\n🛍️ Sincronizando productos...");
    const wooProducts = await fetchAllPages("products");
    console.log(`✓ Descargados ${wooProducts.length} productos base.`);

    let countSimples = 0;
    let countVariables = 0;
    let countVariations = 0;

    for (const product of wooProducts) {
      // Determinar categoría interna
      let categoryId: string | null = null;
      if (product.categories && product.categories.length > 0) {
        const firstCatId = product.categories[0].id;
        categoryId = categoryMapping.get(firstCatId) || null;
      }

      const imageUrl = product.images?.[0]?.src || null;
      const sku = product.sku ? product.sku.trim() : `QD-TEMP-${product.id}`;

      // Insertar producto principal (simple o variable)
      const dbProduct: DBProduct = {
        sku,
        name: product.name,
        price: parseFloat(product.price || "0"),
        stock: product.stock_quantity || 0,
        status: product.status || "publish",
        category_id: categoryId,
        image_url: imageUrl,
        woocommerce_id: product.id,
        parent_id: null,
        type: product.type || "simple"
      };

      await upsertProduct(dbProduct);

      if (product.type === "simple") {
        countSimples++;
      } else if (product.type === "variable") {
        countVariables++;
        
        // Descargar variaciones de este producto variable
        const endpoint = `products/${product.id}/variations`;
        const variations = await fetchAllPages(endpoint);
        
        for (const v of variations) {
          const vSku = v.sku ? v.sku.trim() : `QD-TEMP-VAR-${v.id}`;
          const optionNames = v.attributes.map((a: any) => a.option).join(" ");
          const vName = `${product.name} - ${optionNames}`.trim();

          const dbVariation: DBProduct = {
            sku: vSku,
            name: vName,
            price: parseFloat(v.price || "0"),
            stock: v.stock_quantity || 0,
            status: v.status || "publish",
            category_id: categoryId,
            image_url: v.image?.src || imageUrl, // Fallback a la imagen del padre
            woocommerce_id: v.id,
            parent_id: product.id, // Guardar el ID de WooCommerce del padre
            type: "variation"
          };

          await upsertProduct(dbVariation);
          countVariations++;
        }
      }
    }

    console.log("\n🎉 Sincronización de catálogo finalizada con éxito.");
    console.log(`-----------------------------------------------`);
    console.log(`📦 Categorías Mapeadas: ${categoryMapping.size}`);
    console.log(`✓ Productos Simples:    ${countSimples}`);
    console.log(`✓ Productos Variables:  ${countVariables}`);
    console.log(`✓ Variaciones:          ${countVariations}`);
    console.log(`-----------------------------------------------`);

  } catch (err: any) {
    console.error("❌ Error fatal durante la sincronización:", err.message || err);
  } finally {
    process.exit(0);
  }
}

runSync();
