import { sql } from "./db.js";

async function migrate() {
  if (!sql) {
    console.error("❌ Error: No se pudo conectar a la base de datos PostgreSQL.");
    process.exit(1);
  }

  console.log("🚀 Iniciando migración SQL de Supabase...");

  try {
    // 1. TABLA DE CATEGORÍAS
    await sql`
      CREATE TABLE IF NOT EXISTS dec_categories (
          id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
          woocommerce_id INT UNIQUE,
          name TEXT NOT NULL,
          slug TEXT,
          parent_id BIGINT REFERENCES dec_categories(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    console.log("✅ Tabla 'dec_categories' creada.");

    // 2. TABLA DE PRODUCTOS
    await sql`
      CREATE TABLE IF NOT EXISTS dec_products (
          id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
          sku TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          price NUMERIC(10, 2) DEFAULT 0.00,
          stock INT DEFAULT 0,
          status TEXT DEFAULT 'publish',
          category_id BIGINT REFERENCES dec_categories(id) ON DELETE SET NULL,
          image_url TEXT,
          woocommerce_id INT UNIQUE,
          parent_id INT,
          type TEXT DEFAULT 'simple',
          last_sync TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    console.log("✅ Tabla 'dec_products' creada.");

    // 3. TABLA DE USUARIOS DEL BOT
    await sql`
      CREATE TABLE IF NOT EXISTS dec_bot_users (
          telegram_id BIGINT PRIMARY KEY,
          username TEXT,
          first_name TEXT,
          last_name TEXT,
          role TEXT DEFAULT 'client',
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    console.log("✅ Tabla 'dec_bot_users' creada.");

    // 4. TABLA DE SESIONES
    await sql`
      CREATE TABLE IF NOT EXISTS dec_bot_sessions (
          telegram_id BIGINT PRIMARY KEY REFERENCES dec_bot_users(telegram_id) ON DELETE CASCADE,
          current_state TEXT NOT NULL DEFAULT 'START',
          state_data JSONB DEFAULT '{}'::jsonb,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    console.log("✅ Tabla 'dec_bot_sessions' creada.");

    // 5. TABLA DE PEDIDOS / COTIZACIONES
    await sql`
      CREATE TABLE IF NOT EXISTS dec_orders (
          id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
          buyer_id BIGINT REFERENCES dec_bot_users(telegram_id),
          status TEXT DEFAULT 'pending',
          total_amount NUMERIC(10, 2) DEFAULT 0.00,
          items JSONB NOT NULL DEFAULT '[]'::jsonb,
          woocommerce_order_id INT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    console.log("✅ Tabla 'dec_orders' creada.");

    // 6. COLA DE SINCRONIZACIÓN WOOCOMMERCE
    await sql`
      CREATE TABLE IF NOT EXISTS dec_sync_queue (
          id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
          sku TEXT NOT NULL,
          action_type TEXT NOT NULL,
          payload JSONB DEFAULT '{}'::jsonb,
          status TEXT DEFAULT 'pending',
          attempts INT DEFAULT 0,
          error_message TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          processed_at TIMESTAMP WITH TIME ZONE
      );
    `;
    console.log("✅ Tabla 'dec_sync_queue' creada.");

    // Índices
    await sql`CREATE INDEX IF NOT EXISTS idx_dec_products_sku ON dec_products(sku);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_dec_products_name ON dec_products(name);`;
    console.log("✅ Índices creados.");

    // Activar Realtime
    try {
      await sql`ALTER PUBLICATION supabase_realtime ADD TABLE dec_sync_queue;`;
      console.log("✅ Realtime activado para 'dec_sync_queue'.");
    } catch (realtimeErr: any) {
      console.log(`⚠️ Advertencia sobre Realtime: ${realtimeErr.message}. (Es posible que ya esté habilitado o requiera privilegios de superusuario).`);
    }

    console.log("🎉 Migración completada con éxito.");
  } catch (err: any) {
    console.error("❌ Error durante la migración:", err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

migrate();
