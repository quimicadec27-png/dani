import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ Error: DATABASE_URL no está definida en las variables de entorno.");
  process.exit(1);
}

const sql = postgres(connectionString, { prepare: false });

async function run() {
  console.log("📡 Conectando a Supabase PostgreSQL...");

  try {
    // 1. Obtener todas las tablas en el esquema public y su estado actual de RLS
    console.log('🔍 Consultando tablas en el esquema "public"...');
    const tables = await sql`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY table_name;
    `;

    console.log(`📋 Se encontraron ${tables.length} tablas.`);

    // 2. Habilitar RLS en cada una de ellas (sin agregar políticas => API HTTP queda bloqueada)
    console.log("\n🛡️ Habilitando Row-Level Security (RLS)...");
    for (const row of tables) {
      const tableName = row.table_name;
      const alreadyEnabled = row.rls_enabled;

      if (alreadyEnabled) {
        console.log(`⚡ La tabla "${tableName}" ya tiene RLS activo. Omitiendo.`);
        continue;
      }

      console.log(`⚙️ Habilitando RLS para la tabla "${tableName}"...`);
      await sql.unsafe(`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;`);
      console.log(`✅ RLS activado para "${tableName}".`);
    }

    // 3. Verificar estado final
    const finalTables = await sql`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY table_name;
    `;

    console.log("\n📊 Estado final de las tablas:");
    console.table(finalTables.map(t => ({ tabla: t.table_name, rls_activo: t.rls_enabled })));
    console.log("🎉 ¡Todas las tablas del esquema público están blindadas!");
  } catch (err: any) {
    console.error("❌ Error durante la migración de seguridad:", err.message || err);
  } finally {
    await sql.end();
    console.log("🔌 Conexión cerrada.");
  }
}

run();
