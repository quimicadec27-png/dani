import { sql } from "./db.js";

async function test() {
  if (!sql) return;
  try {
    const list = await sql!`SELECT DISTINCT name FROM dec_products WHERE name ILIKE '%suavizante%' LIMIT 30`;
    console.log(list);
  } catch (err: any) {
    console.error(err.message);
  }
  process.exit(0);
}

test();
