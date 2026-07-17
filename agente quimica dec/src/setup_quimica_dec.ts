import { sql } from "./db.js";

async function setup() {
  if (!sql) {
    console.error("❌ Error: No se pudo conectar a la base de datos PostgreSQL.");
    process.exit(1);
  }

  console.log("🚀 Iniciando configuración de tablas para Química DEC (Agente 13 y 14)...");

  try {
    // 1. Modificar dec_products para agregar columnas faltantes
    console.log("🛠️ Verificando y actualizando columnas en 'dec_products'...");
    await sql`
      ALTER TABLE public.dec_products 
      ADD COLUMN IF NOT EXISTS stock_status TEXT DEFAULT 'instock';
    `;
    await sql`
      ALTER TABLE public.dec_products 
      ADD COLUMN IF NOT EXISTS category TEXT;
    `;
    await sql`
      ALTER TABLE public.dec_products 
      ADD COLUMN IF NOT EXISTS subcategory TEXT;
    `;
    console.log("✅ Columnas verificadas/agregadas en 'dec_products'.");

    // 2. Crear tabla cola_comandos si no existe
    console.log("🛠️ Verificando tabla 'cola_comandos'...");
    await sql`
      CREATE TABLE IF NOT EXISTS public.cola_comandos (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
          comando TEXT NOT NULL,
          argumentos JSONB,
          estado TEXT DEFAULT 'pendiente',
          resultado TEXT,
          chat_id BIGINT,
          notificado BOOLEAN DEFAULT false
      );
    `;
    // Asegurar que notificado exista si la tabla ya existía
    await sql`
      ALTER TABLE public.cola_comandos
      ADD COLUMN IF NOT EXISTS notificado BOOLEAN DEFAULT false;
    `;
    console.log("✅ Tabla 'cola_comandos' lista.");

    // 3. Crear tabla dec_formulas si no existe
    console.log("🛠️ Creando tabla 'dec_formulas'...");
    await sql`
      CREATE TABLE IF NOT EXISTS public.dec_formulas (
          id SERIAL PRIMARY KEY,
          product_name TEXT UNIQUE NOT NULL,
          base_quantity_liters NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
          ingredients JSONB NOT NULL,
          steps TEXT[] NOT NULL,
          epp TEXT[] NOT NULL,
          warnings TEXT[] NOT NULL
      );
    `;
    console.log("✅ Tabla 'dec_formulas' lista.");

    // 4. Crear tabla dec_price_history si no existe
    console.log("🛠️ Creando tabla 'dec_price_history'...");
    await sql`
      CREATE TABLE IF NOT EXISTS public.dec_price_history (
          id SERIAL PRIMARY KEY,
          sku TEXT REFERENCES public.dec_products(sku) ON DELETE CASCADE,
          product_name TEXT NOT NULL,
          price_old NUMERIC(10, 2) NOT NULL,
          price_new NUMERIC(10, 2) NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `;
    console.log("✅ Tabla 'dec_price_history' lista.");

    // 5. Insertar Fórmulas Semilla de Prueba
    console.log("🧪 Insertando fórmula semilla de Jabón de Manos...");
    await sql`
      INSERT INTO public.dec_formulas (product_name, base_quantity_liters, ingredients, steps, epp, warnings) VALUES (
        'Jabón de Manos', 
        50.00, 
        '[
          {"name": "Agua limpia", "amount": 25, "unit": "litros"},
          {"name": "Formol", "amount": 125, "unit": "ml"},
          {"name": "Esencia", "amount": 125, "unit": "ml"},
          {"name": "Base limpiadora concentrada", "amount": 16.5, "unit": "kg"},
          {"name": "Colorantes", "amount": 1, "unit": "al gusto"}
        ]'::jsonb,
        ARRAY[
          'Verificar que el recipiente mezclador esté 100% limpio y libre de residuos.',
          'Agregar los 25 litros de agua limpia.',
          'Incorporar el formol con agitación suave.',
          'Agregar la esencia del aroma seleccionado.',
          'Agregar el colorante correspondiente según la esencia.',
          'Incorporar la base limpiadora concentrada muy lentamente para evitar la formación de grumos.',
          'Mezclar suavemente durante 10 minutos hasta lograr homogeneidad visual.',
          'Dejar reposar 15 minutos antes de realizar los controles de envasado.'
        ],
        ARRAY['Gafas de seguridad', 'Guantes de nitrilo', 'Barbijo para vapores (al manipular formol)'],
        ARRAY['Incorporar la base concentrada MUY despacio; si se vierte rápido, se formarán grumos difíciles de disolver.', 'No batir con demasiada fuerza para evitar la generación excesiva de espuma.']
      )
      ON CONFLICT (product_name) DO NOTHING;
    `;
    console.log("✅ Fórmula semilla insertada exitosamente.");

    console.log("🎉 Todas las tablas configuradas con éxito.");
  } catch (err: any) {
    console.error("❌ Error durante la configuración:", err.message);
  } finally {
    process.exit(0);
  }
}

setup();
