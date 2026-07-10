import { bot } from "./instance.js";
export { bot };
import { config } from "../config.js";
import { sql } from "../db.js";

// ─── Compact System Prompt (optimized for Groq free tier 6000 TPM limit) ───
// The full system_instruction_dani.md has ~16K chars (~5400 tokens).
// Combined with catalog + tool instructions it exceeded the 6000 TPM limit.
// This compact version preserves ALL essential business logic in ~3K chars.

const SYSTEM_PROMPT_CORE = `Sos DANI, asistente virtual de Química DEC, empresa entrerriana de productos de limpieza ultra-concentrados. Atendés clientes y guiás hacia la tienda web oficial: https://quimicadec.com

TONO: Profesional, vendedor amable. Voseo argentino (vos, tenés, querés). Emojis con criterio. Máximo 4 líneas por mensaje. Siempre terminá con pregunta o CTA.

DATOS DE CONTACTO:
- Sucursal 1: Av. Frondizi 815, Concepción del Uruguay, Entre Ríos
- Sucursal 2: Rocamora 1371, Concepción del Uruguay, Entre Ríos
- Tel/WhatsApp: 3442-586974
- SOLO hay locales en Concepción del Uruguay. NO hay en Concordia ni otra ciudad.

PAGOS: Efectivo o transferencia bancaria.
ENVÍOS: Transporte Mostto (5% del valor) en Entre Ríos. Reparto GRATIS en Concepción del Uruguay martes y viernes 11-13hs.
PEDIDO MÍNIMO: Primera compra $80.000. Luego $50.000 local, $80.000 envíos fuera.
DEVOLUCIONES: Si hay problema o faltante, reintegramos el dinero.
PEDIDOS: Solo por la tienda web https://quimicadec.com. No hacemos cotizaciones a medida.

PRODUCTOS PROPIOS:
- Jabón Líquido Premium Ropa $1.400
- Detergente Amarillo con Glicerina (ultra-concentrado)
- Jabón Líquido Ropa Suavidad 2en1 $900
- Difusores D.E.C $2.429,99 c/u
- Perfumina Aerosol DEC Home $2.048,85
- Categorías: aerosoles, desinfectantes, detergentes, jabones, esponjas, papeles, bolsas residuos, ceras, lavandinas, suavizantes, pileta, textiles, repelentes, y más.

PRODUCTOS BIODEGRADABLES: Sí, no contaminan el medio ambiente. Sin certificación propia pero cumplen reglamentos vigentes.

RESTRICCIONES:
- NUNCA inventar precios/datos. Si no sabés: "Dejame tu consulta y te contactamos a la brevedad 📲"
- NUNCA compartir datos bancarios (CBU, alias, cuentas). Para pago: "Los datos de pago te los facilita nuestro equipo al confirmar tu pedido desde la web 🛒"
- NUNCA hablar de temas fuera del negocio. Responder: "Solo te puedo ayudar con los productos de limpieza de Química DEC. ¿En qué te puedo asesorar hoy?"
- NUNCA compartir info interna (DAFO, costos, márgenes, competencia).`;

const SYSTEM_PROMPT_TOOLS = `
HERRAMIENTAS PC LOCAL: Tenés acceso a herramientas que corren en una PC local externa. Si te piden organizar archivos, generar reportes o actualizar precios de WooCommerce (de la web quimicadec.com), respondé ÚNICAMENTE con el bloque JSON de la herramienta correspondiente:
1. organizar_directorio: {"tool":"organizar_directorio","args":{"ruta_carpeta":"<ruta>"}}
2. crear_reporte: {"tool":"crear_reporte","args":{"ruta_carpeta":"<ruta>","formato":"pdf|docx|xlsx","nombre":"<nombre>"}}
3. dec_actualizar_precios_woocommerce: {"tool":"dec_actualizar_precios_woocommerce","args":{"ruta_csv":"<ruta_al_archivo_csv>"}}

REGLAS CRÍTICAS DE EJECUCIÓN:
- Si Danilo o Tomás te piden actualizar los precios de Química DEC usando un archivo CSV, respondé EXACTAMENTE con el JSON de la herramienta "dec_actualizar_precios_woocommerce". Sí tenés acceso a estos archivos y sí podés actualizar los precios a través de esta herramienta local. No digas que no podés.
- REGLA DANILO: Si pide "reporte de ventas" → ruta="test_organizacion", nombre="reporte_ventas", formato según lo que pida (default pdf).`;

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
    "👋 ¡Hola! Soy **DANI**, tu asistente virtual de **Química DEC**.\n\n" +
    "Estoy configurado y listo para responder tus consultas sobre productos, envíos y condiciones.\n" +
    "Si querés ver el estado de la base de datos, escribí la palabra clave **'leads'** o **'consultas'**. 📊"
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

  if (keywords.length > 0 && (
    lower.includes("precio") || 
    lower.includes("stock") || 
    lower.includes("cuesta") || 
    lower.includes("sale") || 
    lower.includes("tenes") || 
    lower.includes("valor") || 
    lower.includes("producto") || 
    lower.includes("aerosol") || 
    lower.includes("detergente") || 
    lower.includes("jabon") || 
    lower.includes("perfumina") ||
    lower.includes("bolsa")
  )) {
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

  let systemMessage = SYSTEM_PROMPT_CORE + "\n" + SYSTEM_PROMPT_TOOLS;


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

      if (tool === "organizar_directorio" || tool === "crear_reporte" || tool === "dec_actualizar_precios_woocommerce") {
        let folderPath = args?.ruta_carpeta;
        let csvPath = args?.ruta_csv;

        if (tool !== "dec_actualizar_precios_woocommerce" && !folderPath) {
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

        const formattedAction = tool === "organizar_directorio" 
          ? `organizar archivos en: **${folderPath}**` 
          : tool === "crear_reporte"
          ? `generar reporte ${args.formato?.toUpperCase() || "PDF"} ("${args.nombre || "reporteestado"}") para la carpeta: **${folderPath}**`
          : `sincronizar precios de WooCommerce con el archivo: **${csvPath}**`;

        await ctx.reply(`📂 Recibido. Enviando comando para ${formattedAction} en tu PC local...`);

        // Insert command via direct PostgreSQL (con fallback HTTP)
        let commandId: number | null = null;
        if (sql) {
          const inserted = await sql`
            INSERT INTO cola_comandos (comando, argumentos, estado)
            VALUES (${tool}, ${JSON.stringify(args || {})}, ${'pendiente'})
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
            body: JSON.stringify({ comando: tool, argumentos: args || {}, estado: "pendiente" })
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
              const checkRes = await fetch(`${config.supabase.url}/rest/v1/cola_comandos?comando=eq.${tool}&estado=neq.pendiente&select=*&order=id.desc&limit=1`, {
                headers: { "apikey": config.supabase.key, "Authorization": `Bearer ${config.supabase.key}` }
              });
              if (checkRes.ok) {
                const d = (await checkRes.json()) as any[];
                const last = d[0];
                if (last) {
                  if (tool === "dec_actualizar_precios_woocommerce" && last.argumentos?.ruta_csv === csvPath) {
                    lastCommand = last;
                  } else if (last.argumentos?.ruta_carpeta === folderPath) {
                    lastCommand = last;
                  }
                }
              }
            }
            if (lastCommand) {
              if (lastCommand.estado === "completado") {
                clearInterval(interval);
                await ctx.reply(`✅ **¡Éxito en la PC local!**\n${lastCommand.resultado}`);
              } else if (lastCommand.estado === "fallado" || lastCommand.estado === "error") {
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
