import { sql } from "./db.js";

async function checkDb() {
  if (!sql) {
    console.error("No database connection available.");
    process.exit(1);
  }
  try {
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `;
    console.log("Tables in database:", tables.map(t => t.table_name));

    // Check columns of dec_products if it exists
    const cols = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'dec_products';
    `;
    console.log("Columns of dec_products:", cols);
  } catch (err: any) {
    console.error("Error checking db:", err.message);
  } finally {
    process.exit(0);
  }
}

checkDb();
