import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config();

const connectionString = process.env.DATABASE_URL;

let sql: ReturnType<typeof postgres> | null = null;

if (connectionString) {
  try {
    sql = postgres(connectionString, {
      prepare: false,
      connect_timeout: 10,
    });
    console.log("🗄️ Módulo de base de datos PostgreSQL cargado.");
  } catch (err: any) {
    console.warn("⚠️ No se pudo inicializar cliente PostgreSQL:", err.message);
    sql = null;
  }
} else {
  console.warn("⚠️ DATABASE_URL no definida. Las consultas SQL directas no estarán disponibles.");
}

export { sql };
