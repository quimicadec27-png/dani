import { bot } from "./instance.js";
export { bot };
import { config } from "../config.js";
import { sql } from "../db.js";

// ─── System Prompt (Santi - Asistente de Operaciones de Química DEC) ───

const SYSTEM_PROMPT = `
Sos "Santi - Asistente de Operaciones de Química DEC". Tu rol es ayudar a la administración y producción del depósito.
Hablás en español con voseo argentino (vos, tenés, querés).
Tienes acceso a las siguientes herramientas que debes invocar devolviendo un bloque JSON limpio:
1. dec_actualizar_stock: Invocar cuando el usuario reporte ingreso de mercadería o pida cambiar el stock.
   JSON: { "tool": "dec_actualizar_stock", "args": { "sku": "SKU_DEL_PRODUCTO", "cantidad": 50 } }
2. dec_actualizar_price: Invocar cuando el usuario pida cambiar el precio de un producto.
   JSON: { "tool": "dec_actualizar_price", "args": { "sku": "SKU_DEL_PRODUCTO", "precio": 2500.00 } }
3. dec_calcular_formula: Invocar cuando un operario pida la receta o vaya a fabricar un producto (Ej: "Voy a fabricar 100 litros de Jabón de Manos").
   JSON: { "tool": "dec_calcular_formula", "args": { "producto": "Nombre del producto", "cantidad_litros": 100 } }

REGLAS DE OPERACIÓN:
- Para actualizar stock o precio, debes verificar que el SKU sea exacto. Si el usuario te da un nombre con dudas (ej: 'suavizante azul'), NO llames a la herramienta, pídele confirmación sobre cuál de las variantes/tamaños se refiere.
- NUNCA respondas con texto plano cuando debas invocar una herramienta. Devuelve solo el JSON de la herramienta.
`;

// Security Whitelist Middleware
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const allowed = config.telegram.allowedUserIds;
  if (allowed.length > 0 && !allowed.includes(userId)) {
    console.log(`⚠️ Access denied for unauthorized user ID: ${userId}`);
    await ctx.reply("❌ Acceso denegado. No tienes autorización para interactuar con este bot.");
    return;
  }

  await next();
});

// Start Command
bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 ¡Hola! Soy **Santi**, tu asistente de operaciones de **Química DEC**.\n\n" +
    "Estoy configurado y listo para ayudarte con la actualización de stock, precios y fórmulas de producción del depósito. 🧪📊"
  );
});

// Save conversation — SQL directo si disponible, fallback HTTP
async function saveConversationToSupabase(mensajeCliente: string, respuestaAgente: string) {
  try {
    if (sql) {
      await sql`
        INSERT INTO "Conversaciones" (mensaje_cliente, respuesta_agente, negocio)
        VALUES (${mensajeCliente}, ${respuestaAgente}, ${'Química DEC'})
      `;
    } else if (config.supabase.url && config.supabase.key) {
      // Fallback HTTP (desarrollo local sin conexión TCP directa)
      await fetch(`${config.supabase.url}/rest/v1/Conversaciones`, {
        method: "POST",
        headers: {
          "apikey": config.supabase.key,
          "Authorization": `Bearer ${config.supabase.key}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({ mensaje_cliente: mensajeCliente, respuesta_agente: respuestaAgente, negocio: "Química DEC" })
      });
    }
  } catch (err: any) {
    console.error("❌ Error guardando conversación:", err.message || err);
  }
}

// Fetch database records — SQL directo si disponible, fallback HTTP
async function fetchSupabaseContext(query: string): Promise<string> {
  const lower = query.toLowerCase();
  let context = "";

  if (lower.includes("incidencia") || lower.includes("calidad") || lower.includes("ticket") || lower.includes("falla")) {
    try {
      if (sql) {
        const data = await sql`SELECT id, area, estado, operador FROM incidencias ORDER BY id DESC LIMIT 5`;
        context += "\n--- INCIDENCIAS ---\n";
        data.forEach((item: any) => { context += `- #${item.id}: ${item.area} (${item.estado}) - ${item.operador}\n`; });
      } else if (config.supabase.url && config.supabase.key) {
        const res = await fetch(`${config.supabase.url}/rest/v1/incidencias?select=*&limit=5`, {
          headers: { "apikey": config.supabase.key, "Authorization": `Bearer ${config.supabase.key}` }
        });
        if (res.ok) {
          const data = (await res.json()) as any[];
          context += "\n--- INCIDENCIAS ---\n";
          data.forEach(item => { context += `- #${item.id}: ${item.area} (${item.estado}) - ${item.operador}\n`; });
        }
      }
    } catch (err: any) { console.error("Error fetching incidents:", err.message); }
  }

  if (lower.includes("venta") || lower.includes("reporte") || lower.includes("lead") || lower.includes("conversac") || lower.includes("cliente")) {
    try {
      if (sql) {
        const data = await sql`SELECT id, mensaje_cliente, respuesta_agente FROM "Conversaciones" ORDER BY id DESC LIMIT 5`;
        context += "\n--- ÚLTIMAS CONVERSACIONES ---\n";
        data.forEach((item: any) => { context += `- #${item.id}: "${item.mensaje_cliente}" → "${item.respuesta_agente}"\n`; });
      } else if (config.supabase.url && config.supabase.key) {
        const res = await fetch(`${config.supabase.url}/rest/v1/Conversaciones?select=*&order=id.desc&limit=5`, {
          headers: { "apikey": config.supabase.key, "Authorization": `Bearer ${config.supabase.key}` }
        });
        if (res.ok) {
          const data = (await res.json()) as any[];
          context += "\n--- ÚLTIMAS CONVERSACIONES ---\n";
          data.forEach(item => { context += `- #${item.id}: "${item.mensaje_cliente}" → "${item.respuesta_agente}"\n`; });
        }
      }
    } catch (err: any) { console.error("Error fetching conversations:", err.message); }
  }

  // Búsqueda de Productos, Precios y Stock en tiempo real con filtro de Stop Words robusto
  const STOP_WORDS = new Set([
    "que", "qué", "como", "cómo", "cual", "cuál", "quien", "quién", 
    "donde", "dónde", "cuando", "cuándo", "cuanto", "cuánto", 
    "para", "con", "del", "los", "las", "una", "uno", "unos", "unas", 
    "este", "esta", "estos", "estas", "aquel", "aquella", "aquellos", "aquellas", 
    "precio", "precios", "stock", "cuesta", "cuestan", "sale", "salen", 
    "tenes", "tiene", "tienen", "mostrar", "buscar", "dec_products", 
    "quimica", "limpieza", "dec", "venta", "reporte", "lead", 
    "conversac", "conversación", "cliente", "clientes", "hola", "dani",
    "de", "la", "el", "en", "un", "y", "o", "nos", "les", "tus", "sus", "mis",
    "pero", "si", "no", "siempre", "nunca", "tal", "vez", "mas", "más", "menos",
    "quiero", "pido", "pedir", "comprar", "quisiera", "dame", "traeme", "ver",
    "hace", "hacer", "podes", "podés", "puedo", "puede", "pueden", "saber",
    "me", "te", "se", "lo", "la", "le", "nos", "os", "los", "las", "les",
    "es", "son", "fue", "eran", "ser", "estar", "esta", "está", "están", "estando"
  ]);

  // Estandarizar abreviaturas comunes de litros a la palabra completa "litros"
  const cleanText = lower
    .replace(/[?,.¿!¡]/g, " ")
    .replace(/\blts\b/g, "litros")
    .replace(/\blt\b/g, "litros")
    .replace(/\bl\b/g, "litros");

  const words = cleanText.split(/\s+/).filter(w => w.length >= 2);
  const keywords = words.filter(word => !STOP_WORDS.has(word));

  if (keywords.length > 0) {
    try {
      let data: any[] = [];
      if (sql) {
        if (keywords.length >= 2) {
          const pat1 = `%${keywords[0]}%`;
          const pat2 = `%${keywords[1]}%`;
          data = await sql!`
            SELECT name, price, stock, sku 
            FROM dec_products 
            WHERE (name ILIKE ${pat1} OR sku ILIKE ${pat1})
              AND (name ILIKE ${pat2} OR sku ILIKE ${pat2})
              AND status = 'publish'
            LIMIT 8
          `;
        }
        
        // Fallback: Si no hay resultados y teníamos múltiples palabras clave, buscar solo por la primera
        if (data.length === 0) {
          const pat = `%${keywords[0]}%`;
          data = await sql!`
            SELECT name, price, stock, sku 
            FROM dec_products 
            WHERE (name ILIKE ${pat} OR sku ILIKE ${pat})
              AND status = 'publish'
            LIMIT 8
          `;
        }
      } else if (config.supabase.url && config.supabase.key) {
        let url = `${config.supabase.url}/rest/v1/dec_products?status=eq.publish&select=name,price,stock,sku&limit=8`;
        if (keywords.length >= 2) {
          url += `&and=(or(name.ilike.*${keywords[0]}*,sku.ilike.*${keywords[0]}*),or(name.ilike.*${keywords[1]}*,sku.ilike.*${keywords[1]}*))`;
        } else {
          url += `&or=(name.ilike.*${keywords[0]}*,sku.ilike.*${keywords[0]}*)`;
        }
        let res = await fetch(url, {
          headers: { "apikey": config.supabase.key, "Authorization": `Bearer ${config.supabase.key}` }
        });
        if (res.ok) {
          data = (await res.json()) as any[];
        }

        // Fallback HTTP
        if ((!data || data.length === 0) && keywords.length >= 2) {
          const fallbackUrl = `${config.supabase.url}/rest/v1/dec_products?status=eq.publish&select=name,price,stock,sku&limit=8&or=(name.ilike.*${keywords[0]}*,sku.ilike.*${keywords[0]}*)`;
          res = await fetch(fallbackUrl, {
            headers: { "apikey": config.supabase.key, "Authorization": `Bearer ${config.supabase.key}` }
          });
          if (res.ok) {
            data = (await res.json()) as any[];
          }
        }
      }

      if (data && data.length > 0) {
        context += "\n--- PRODUCTOS DISPONIBLES EN STOCK / PRECIOS ---\n";
        data.forEach((item: any) => {
          context += `- ${item.name} (SKU: ${item.sku}) | Precio: $${item.price} | Stock: ${item.stock} unidades\n`;
        });
      }
    } catch (err: any) {
      console.error("Error fetching product context:", err.message);
    }
  }

  return context;
}


async function getGroqResponse(
  userMessage: string, 
  history: { role: "user" | "assistant"; content: string }[],
  dbContext: string
) {
  const apiEndpoint = "https://api.groq.com/openai/v1/chat/completions";
  let systemMessage = SYSTEM_PROMPT;


  if (dbContext) {
    systemMessage += `
Utilizá los siguientes datos en tiempo real de la base de datos para responder a la pregunta del usuario.

🚨 REGLAS CRÍTICAS DE RESPUESTA (OBLIGATORIO CUMPLIR):
1. MULTIPLICACIÓN POR LITROS (TOTAL): Si el producto indica una cantidad de litros en su nombre (ej: "20 LITROS", "40 LITROS", "60 LITROS", "120 LITROS", "200 LITROS"), el precio que figura en la base de datos es UNITARIO (POR LITRO). ¡DEBÉS HACER LA MULTIPLICACIÓN MATEMÁTICA Y DECIR EL PRECIO TOTAL EN TU RESPUESTA!
   - Ejemplo: Para "SUAVIZANTE TRIPLE PERFUME - 20 LITROS" con precio $897.18, calculá: 897.18 * 20 = $17.943,60. Decí claramente al cliente: "El precio por litro es de $897,18, por lo que el envase de 20 litros sale $17.943,60". ¡Hacé siempre esta multiplicación para todos los envases de litros!
2. VARIOS TIPOS / MARCAS COINCIDENTES: Si la lista de abajo tiene más de un tipo de producto que coincide con lo que pide el usuario (ej: si piden "suavizante de 20 litros" y figura tanto "SUAVIZANTE TRIPLE PERFUME - 20 LITROS" como "SUAVIZANTE ECO PLUS  20 LITROS"):
   - ¡NO elijas uno solo en tu respuesta!
   - Mencioná TODOS los tipos que coinciden, decí sus respectivos precios por litro y precios totales calculados, y preguntale amablemente al cliente cuál de ellos prefiere.
3. CATÁLOGO ESTRICTO: No ofrezcas ni inventes tamaños o productos que no estén listados abajo (por ejemplo, suavizante de 5 o 25 litros si no figura en los datos de abajo). Si no figura la presentación, aclaralo de forma amable y sugerí los tamaños disponibles que sí ves abajo.

Datos en tiempo real de la base de datos:
${dbContext}
`;
  }

  const messages = [
    { role: "system", content: systemMessage },
    ...history.map(msg => ({ role: msg.role, content: msg.content })),
    { role: "user", content: userMessage }
  ];

  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.groq.apiKey}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: messages,
      temperature: 0.3,
      max_tokens: 800
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || `Groq API returned status ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// Chat history mapping
const chatHistories = new Map<number, { role: "user" | "assistant"; content: string }[]>();

function getUserHistory(userId: number) {
  if (!chatHistories.has(userId)) {
    chatHistories.set(userId, []);
  }
  return chatHistories.get(userId)!;
}

function updateUserHistory(userId: number, role: "user" | "assistant", content: string) {
  const history = getUserHistory(userId);
  history.push({ role, content });
  if (history.length > 10) history.shift();
}

// Ticket Detail command regex handler
bot.hears(/^\/ticket(\d+)$/, async (ctx) => {
  const ticketId = parseInt(ctx.match[1], 10);
  await ctx.replyWithChatAction("typing");

  try {
    let ticket: any = null;

    if (sql) {
      const data = await sql`
        SELECT id, area, estado, operador, descripcion, created_at
        FROM incidencias WHERE id = ${ticketId} LIMIT 1
      `;
      ticket = data[0] ?? null;
    } else if (config.supabase.url && config.supabase.key) {
      const res = await fetch(`${config.supabase.url}/rest/v1/incidencias?id=eq.${ticketId}`, {
        headers: { "apikey": config.supabase.key, "Authorization": `Bearer ${config.supabase.key}` }
      });
      if (res.ok) { const d = (await res.json()) as any[]; ticket = d[0] ?? null; }
    }

    if (!ticket) {
      await ctx.reply(`❌ No se encontró la incidencia con el ID ${ticketId}.`);
      return;
    }

    const dateObj = new Date(ticket.created_at);
    const localDate = dateObj.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    const responseText =
      `🎫 **Ficha de Incidencia #${ticket.id}**\n\n` +
      `📅 **Fecha:** ${localDate}\n` +
      `📁 **Proyecto:** ${ticket.area}\n` +
      `🔄 **Estado:** ${ticket.estado}\n` +
      `⚠️ **Prioridad:** No especificada\n` +
      `👤 **Responsable:** ${ticket.operador}\n` +
      `📝 **Descripción:** ${ticket.descripcion}`;

    await ctx.reply(responseText, { parse_mode: "Markdown" });
  } catch (err: any) {
    console.error("❌ Error fetching ticket details:", err.message || err);
    await ctx.reply("❌ Ocurrió un error al intentar consultar los detalles de la incidencia.");
  }
});

function extraerJSON(texto: string): any {
  const start = texto.indexOf("{");
  const end = texto.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end >= start) {
    const rawJson = texto.substring(start, end + 1);
    try {
      return JSON.parse(rawJson);
    } catch (err) {
      console.error("Error parsing extracted JSON:", err);
      return null;
    }
  }
  return null;
}

// Text Messages Handler
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  const lowerText = text.toLowerCase();
  const userId = ctx.from.id;

  // Handle 'leads' or 'consultas' database summary list queries (legacy quick view)
  if (lowerText === "leads" || lowerText === "consultas") {
    await ctx.replyWithChatAction("typing");
    try {
      let data: any[] = [];
      if (sql) {
        data = await sql`SELECT id, area, estado FROM incidencias ORDER BY id ASC`;
      } else if (config.supabase.url && config.supabase.key) {
        const res = await fetch(`${config.supabase.url}/rest/v1/incidencias?select=*`, {
          headers: { "apikey": config.supabase.key, "Authorization": `Bearer ${config.supabase.key}` }
        });
        if (res.ok) data = (await res.json()) as any[];
      }
      if (data.length === 0) {
        await ctx.reply("📋 No hay incidencias registradas en la base de datos.");
        return;
      }
      let message = "📋 **Lista de Incidencias:**\n";
      data.forEach(item => { message += `• ID ${item.id} - ${item.area} (${item.estado}) - /ticket${item.id}\n`; });
      await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (err: any) {
      console.error("❌ Error fetching incidencias:", err.message || err);
      await ctx.reply("❌ Ocurrió un error al intentar consultar la lista de incidencias.");
    }
    return;
  }

  // General AI assistant processing with Groq (with dynamic database context lookup)
  await ctx.replyWithChatAction("typing");
  try {
    // 1. Fetch live database context if query asks for reports, sales, leads or quality incidents
    const dbContext = await fetchSupabaseContext(text);

    // 2. Call Groq using llama-3.3-70b-versatile model
    const history = getUserHistory(userId);
    const responseText = await getGroqResponse(text, history, dbContext);

    // 3. Robust JSON Extractor Check
    const toolCall = extraerJSON(responseText);

    if (toolCall && toolCall.tool) {
      const { tool } = toolCall;
      let args = toolCall.args;
      console.log(`🤖 La IA decidió ejecutar la herramienta: ${tool} con argumentos:`, args);

      // Misión de Tadeo: Validar formatos de reporte soportados en el bot
      if (tool === "crear_reporte") {
        const formato = (args?.formato || "pdf").toLowerCase().trim();
        if (formato !== "pdf" && formato !== "docx" && formato !== "xlsx") {
          await ctx.reply("❌ Los formatos de reporte soportados son únicamente PDF, Word (docx) o Excel (xlsx). Por favor solicitá el reporte en alguno de estos formatos. 😊");
          return;
        }
      }

      if (tool === "dec_calcular_formula") {
        // Cálculo conversacional directo en la nube (Agente 14)
        const producto = args?.producto;
        const cantidad_litros = parseFloat(args?.cantidad_litros);

        if (!producto || isNaN(cantidad_litros)) {
          await ctx.reply("❌ Nombre de producto o cantidad de litros inválida para el cálculo de fórmula.");
          return;
        }

        let formula: any = null;
        try {
          if (sql) {
            const res = await sql`
              SELECT * FROM dec_formulas 
              WHERE product_name ILIKE ${'%' + producto + '%'}
              LIMIT 1
            `;
            formula = res[0] || null;
          } else if (config.supabase.url && config.supabase.key) {
            const res = await fetch(`${config.supabase.url}/rest/v1/dec_formulas?product_name=ilike.*${encodeURIComponent(producto)}*`, {
              headers: { 
                "apikey": config.supabase.key,
                "Authorization": `Bearer ${config.supabase.key}`
              }
            });
            if (res.ok) {
              const formulas = await res.json();
              formula = formulas[0] || null;
            }
          }
        } catch (dbErr: any) {
          console.error("Error consultando formula en base de datos:", dbErr.message);
        }

        if (formula) {
          const factor = cantidad_litros / formula.base_quantity_liters;
          // Calcular cantidades proporcionales
          const ingredsCalculados = formula.ingredients.map((i: any) => {
            const amount = typeof i.amount === 'number' ? (i.amount * factor).toFixed(2) : i.amount;
            return `- ${i.name}: ${amount} ${i.unit}`;
          }).join('\n');
          // Armar respuesta estructurada
          let respuesta = `🧪 *Fórmula de Producción: ${formula.product_name}*\n`;
          respuesta += `Cantidad final: *${cantidad_litros} Litros* (Fórmula base de ${formula.base_quantity_liters}L)\n\n`;
          respuesta += `*Ingredientes Necesarios:*\n${ingredsCalculados}\n\n`;
          respuesta += `*Paso a paso de producción:*\n${formula.steps.map((s: string, idx: number) => `${idx+1}. ${s}`).join('\n')}\n\n`;
          respuesta += `*EPP Obligatorio:*\n${formula.epp.map((e: string) => `• ${e}`).join('\n')}\n\n`;
          respuesta += `⚠️ *Advertencias:* ${formula.warnings.join(' ')}`;
          await ctx.reply(respuesta, { parse_mode: "Markdown" });
        } else {
          await ctx.reply(`No encontré ninguna fórmula cargada para "${producto}". Por favor, solicita al administrador de Química DEC que dé de alta la fórmula.`);
        }
        return;
      }

      if (
        tool === "organizar_directorio" || 
        tool === "crear_reporte" || 
        tool === "dec_actualizar_precios_woocommerce" ||
        tool === "dec_actualizar_stock" ||
        tool === "dec_actualizar_price"
      ) {
        let folderPath = args?.ruta_carpeta;
        let csvPath = args?.ruta_csv;
        let sku = args?.sku;

        if ((tool === "organizar_directorio" || tool === "crear_reporte") && !folderPath) {
          await ctx.reply("❌ No pude determinar la ruta de la carpeta. ¿Podrías indicármela?");
          return;
        }
        if (tool === "dec_actualizar_precios_woocommerce" && !csvPath) {
          csvPath = "woocommerce_final_completo_csv-1783705700655.csv";
          if (!args) {
            args = {};
            toolCall.args = args;
          }
          args.ruta_csv = csvPath;
        }
        if ((tool === "dec_actualizar_stock" || tool === "dec_actualizar_price") && !sku) {
          await ctx.reply("❌ No pude determinar el SKU del producto para la actualización.");
          return;
        }

        let formattedAction = "";
        if (tool === "organizar_directorio") {
          formattedAction = `organizar archivos en: **${folderPath}**`;
        } else if (tool === "crear_reporte") {
          formattedAction = `generar reporte ${args.formato?.toUpperCase() || "PDF"} ("${args.nombre || "reporteestado"}") para la carpeta: **${folderPath}**`;
        } else if (tool === "dec_actualizar_precios_woocommerce") {
          formattedAction = `sincronizar precios de WooCommerce con el archivo: **${csvPath}**`;
        } else if (tool === "dec_actualizar_stock") {
          formattedAction = `actualizar stock para el SKU **${sku}** (cantidad: ${args.cantidad})`;
        } else if (tool === "dec_actualizar_price") {
          formattedAction = `actualizar precio para el SKU **${sku}** (nuevo precio: $${args.precio})`;
        }

        await ctx.reply(`📂 Recibido. Enviando comando para ${formattedAction} en tu PC local...`);

        // Insert command via direct PostgreSQL (con fallback HTTP)
        let commandId: number | null = null;
        if (sql) {
          const inserted = await sql`
            INSERT INTO cola_comandos (comando, argumentos, estado, chat_id)
            VALUES (${tool}, ${JSON.stringify(args || {})}, ${'pendiente'}, ${ctx.chat.id})
            RETURNING id
          `;
          commandId = inserted[0]?.id;
        } else if (config.supabase.url && config.supabase.key) {
          const res = await fetch(`${config.supabase.url}/rest/v1/cola_comandos`, {
            method: "POST",
            headers: {
              "apikey": config.supabase.key,
              "Authorization": `Bearer ${config.supabase.key}`,
              "Content-Type": "application/json",
              "Prefer": "return=representation"
            },
            body: JSON.stringify({ comando: tool, argumentos: args || {}, estado: "pendiente", chat_id: ctx.chat.id })
          });
          if (res.ok) { const d = (await res.json()) as any[]; commandId = d[0]?.id; }
        }

        // Poll for status change
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          if (attempts > 30) {
            clearInterval(interval);
            await ctx.reply("⚠️ El ejecutor local en tu PC no respondió a tiempo. Asegurate de que local_executor.ts esté corriendo.");
            return;
          }

          try {
            let lastCommand: any = null;
            if (sql && commandId) {
              const data = await sql`
                SELECT id, estado, resultado FROM cola_comandos
                WHERE id = ${commandId} AND estado != ${'pendiente'} LIMIT 1
              `;
              lastCommand = data[0] ?? null;
            } else if (config.supabase.url && config.supabase.key) {
              const checkRes = await fetch(`${config.supabase.url}/rest/v1/cola_comandos?id=eq.${commandId}&select=*`, {
                headers: { "apikey": config.supabase.key, "Authorization": `Bearer ${config.supabase.key}` }
              });
              if (checkRes.ok) {
                const d = (await checkRes.json()) as any[];
                lastCommand = d[0] || null;
              }
            }
            if (lastCommand && lastCommand.estado !== "pendiente" && lastCommand.estado !== "ejecutando") {
              if (lastCommand.estado === "completado") {
                clearInterval(interval);
                await ctx.reply(`✅ **¡Éxito en la PC local!**\n${lastCommand.resultado}`);
              } else {
                clearInterval(interval);
                await ctx.reply(`❌ **Error en la PC local:**\n${lastCommand.resultado}`);
              }
            }
          } catch (err: any) { console.error("Error polling command status:", err.message); }
        }, 2000);

        return;
      }
    }

    // It was a normal conversation or no tool call was detected
    updateUserHistory(userId, "user", text);
    updateUserHistory(userId, "assistant", responseText);

    await ctx.reply(responseText);
    saveConversationToSupabase(text, responseText);
  } catch (error) {
    console.error("❌ Error generating response:", error);
    await ctx.reply("Ups, tuve un inconveniente para procesar tu mensaje. Dejame tu consulta y te contactamos a la brevedad 📲");
  }
});
