import { bot } from "./instance.js";
export { bot };
import { config } from "../config.js";
import * as fs from "fs";
import * as path from "path";

// Load Knowledge Base
let systemInstructions = "";
let productCatalog = "";

try {
  systemInstructions = fs.readFileSync(path.resolve("../system_instruction_dani.md"), "utf-8");
} catch (err) {
  console.error("❌ Error loading system instructions:", err);
}

try {
  const fullCatalog = fs.readFileSync(path.resolve("../productos_muestra_asistente_ia.md"), "utf-8");
  productCatalog = fullCatalog.slice(0, 4000) + "\n\n... (Catálogo truncado para optimizar límites de API. Referir al cliente a la web https://pedix.app/quimica-dec para ver más productos)";
} catch (err) {
  console.error("❌ Error loading product catalog:", err);
}

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

// Save conversation in Supabase
async function saveConversationToSupabase(mensajeCliente: string, respuestaAgente: string) {
  if (!config.supabase.url || !config.supabase.key) return;
  const url = `${config.supabase.url}/rest/v1/Conversaciones`;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "apikey": config.supabase.key,
        "Authorization": `Bearer ${config.supabase.key}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        mensaje_cliente: mensajeCliente,
        respuesta_agente: respuestaAgente,
        negocio: "Química DEC"
      })
    });
  } catch (err) {
    console.error("❌ Error saving to Supabase:", err);
  }
}

// Fetch database records to inject as context
async function fetchSupabaseContext(query: string): Promise<string> {
  const lower = query.toLowerCase();
  let context = "";

  // Check for quality incidents
  if (lower.includes("incidencia") || lower.includes("calidad") || lower.includes("ticket") || lower.includes("falla")) {
    try {
      const res = await fetch(`${config.supabase.url}/rest/v1/incidencias?select=*`, {
        headers: {
          "apikey": config.supabase.key,
          "Authorization": `Bearer ${config.supabase.key}`
        }
      });
      if (res.ok) {
        const data = (await res.json()) as any[];
        context += "\n--- CONTEXTO DE INCIDENCIAS DE CALIDAD EN TIEMPO REAL ---\n";
        data.forEach(item => {
          context += `- Ticket #${item.id}: Área: ${item.area}, Estado: ${item.estado}, Responsable: ${item.operador}, Descripción: ${item.descripcion}\n`;
        });
      }
    } catch (err) {
      console.error("Error fetching incidents for AI context:", err);
    }
  }

  // Check for sales, reports, leads
  if (lower.includes("venta") || lower.includes("reporte") || lower.includes("lead") || lower.includes("conversac") || lower.includes("cliente")) {
    try {
      const res = await fetch(`${config.supabase.url}/rest/v1/Conversaciones?select=*`, {
        headers: {
          "apikey": config.supabase.key,
          "Authorization": `Bearer ${config.supabase.key}`
        }
      });
      if (res.ok) {
        const data = (await res.json()) as any[];
        context += "\n--- CONTEXTO DE CONVERSACIONES Y LEADS EN TIEMPO REAL ---\n";
        // Limit to last 15 records to fit model limit
        const recent = data.slice(-15);
        recent.forEach(item => {
          context += `- ID #${item.id}: Cliente: "${item.mensaje_cliente}", Respuesta: "${item.respuesta_agente}", Negocio: ${item.negocio || "Química DEC"}\n`;
        });
      }
    } catch (err) {
      console.error("Error fetching conversations for AI context:", err);
    }
  }

  return context;
}

// Groq API Completion
async function getGroqResponse(
  userMessage: string, 
  history: { role: "user" | "assistant"; content: string }[],
  dbContext: string
) {
  const apiEndpoint = "https://api.groq.com/openai/v1/chat/completions";

  let systemMessage = `
${systemInstructions}

A continuación tenés el CATÁLOGO de productos (resumen):
${productCatalog}

--- HERRAMIENTAS Y ACCIONES EN LA PC LOCAL ---
Tenés la capacidad de ejecutar tareas físicas en la PC local del usuario a través de comandos. Si el usuario te pide ordenar archivos, organizar carpetas o generar reportes de inventario de archivos, DEBÉS responder EXCLUSIVAMENTE con un bloque JSON estructurado con la llamada a la herramienta. No agregues explicaciones, introducciones ni despedidas fuera de las llaves del JSON.

Herramientas disponibles:

1. "organizar_directorio":
   - Uso: Ordena archivos por tipo (.pdf a carpeta PDF, .docx a DOCX, etc.) en la ruta dada.
   - Argumento:
     - "ruta_carpeta" (obligatorio): La ruta del directorio en la PC local.
   - Formato de respuesta JSON:
     {
       "tool": "organizar_directorio",
       "args": {
         "ruta_carpeta": "<ruta_carpeta>"
       }
     }

2. "crear_reporte":
   - Uso: Escanea recursivamente un directorio local y genera un reporte nativo de inventario de archivos en PDF, Word o Excel.
   - Argumentos:
     - "ruta_carpeta" (obligatorio): La ruta del directorio en la PC local.
     - "formato" (opcional): "pdf", "docx" o "xlsx". Por defecto usar "pdf".
     - "nombre" (opcional): Nombre del archivo sin extensión. Por defecto usar "reporteestado".
   - Formato de respuesta JSON:
     {
       "tool": "crear_reporte",
       "args": {
         "ruta_carpeta": "<ruta_carpeta>",
         "formato": "pdf" | "docx" | "xlsx",
         "nombre": "<nombre>"
       }
     }

--- REGLAS ESPECÍFICAS DE DANILO (Ventas) ---
- Si Danilo te pide "Pasame un reporte de ventas en PDF" o algo relacionado con "reporte de ventas", debés asumir que la ruta de carpeta es "test_organizacion", el formato es "pdf", y el nombre es "reporte_ventas". Es decir, debés retornar el siguiente JSON exacto:
  {
    "tool": "crear_reporte",
    "args": {
      "ruta_carpeta": "test_organizacion",
      "formato": "pdf",
      "nombre": "reporte_ventas"
    }
  }
- Si pide el reporte de ventas en otro formato (como excel), cambiá el parámetro "formato" a "xlsx".

REGLAS DE ORO:
1. Respuestas conversacionales: máximo 4 líneas o 1000 caracteres. Formato de párrafos cortos y emoticones.
2. Si te preguntan el precio, stock o datos técnicos de un producto, buscalo en el catálogo. Si figura "No ofrecer en ventas", respondé exactamente: "Dejame tu consulta y te contactamos a la brevedad 📲"
3. Si el dato NO figura de forma exacta en el catálogo, o te preguntan sobre stock que no está, o cualquier dato ausente, respondé exactamente: "Dejame tu consulta y te contactamos a la brevedad 📲"
4. NUNCA inventes datos, precios, condiciones de entrega u horarios.
5. Recordá saludar mencionando a "Química DEC" y hablar en tuteo argentino (voseo: "vos", "tenés", "querés", "buscás", "hacé").
6. Siempre terminá con una pregunta o llamada a la acción comercial (CTA).
7. Si te preguntan cosas fuera del negocio (fútbol, política, etc.), respondé con amabilidad que solo ayudás con productos Química DEC.
`;

  if (dbContext) {
    systemMessage += `
Utilizá los siguientes datos de la base de datos en tiempo real para responder a la pregunta del usuario. Respondé de manera amigable, conversacional y analizando esta información:
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
      model: "llama-3.1-8b-instant",
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

// Ticket Detail command regex handler (placed before general text handler)
bot.hears(/^\/ticket(\d+)$/, async (ctx) => {
  const ticketId = ctx.match[1];
  await ctx.replyWithChatAction("typing");

  try {
    const url = `${config.supabase.url}/rest/v1/incidencias?id=eq.${ticketId}`;
    const res = await fetch(url, {
      headers: {
        "apikey": config.supabase.key,
        "Authorization": `Bearer ${config.supabase.key}`
      }
    });

    if (!res.ok) {
      throw new Error(`Supabase returned status ${res.status}`);
    }

    const data = (await res.json()) as any[];
    if (data.length === 0) {
      await ctx.reply(`❌ No se encontró la incidencia con el ID ${ticketId}.`);
      return;
    }

    const ticket = data[0];
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
  } catch (err) {
    console.error("❌ Error fetching ticket details:", err);
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
      const url = `${config.supabase.url}/rest/v1/incidencias?select=*`;
      const res = await fetch(url, {
        headers: {
          "apikey": config.supabase.key,
          "Authorization": `Bearer ${config.supabase.key}`
        }
      });

      if (!res.ok) {
        throw new Error(`Supabase returned status ${res.status}`);
      }

      const data = (await res.json()) as any[];
      if (data.length === 0) {
        await ctx.reply("📋 No hay incidencias registradas en la base de datos.");
        return;
      }

      let message = "📋 **Lista de Incidencias:**\n";
      data.forEach(item => {
        message += `• ID ${item.id} - ${item.area} (${item.estado}) - /ticket${item.id}\n`;
      });
      await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (err) {
      console.error("❌ Error fetching Supabase incidences:", err);
      await ctx.reply("❌ Ocurrió un error al intentar consultar la lista de incidencias.");
    }
    return;
  }

  // General AI assistant processing with Groq (with dynamic database context lookup)
  await ctx.replyWithChatAction("typing");
  try {
    // 1. Fetch live database context if query asks for reports, sales, leads or quality incidents
    const dbContext = await fetchSupabaseContext(text);

    // 2. Call Groq using fast llama-3.1-8b-instant model
    const history = getUserHistory(userId);
    const responseText = await getGroqResponse(text, history, dbContext);

    // 3. Robust JSON Extractor Check
    const toolCall = extraerJSON(responseText);

    if (toolCall && toolCall.tool) {
      const { tool, args } = toolCall;
      console.log(`🤖 La IA decidió ejecutar la herramienta: ${tool} con argumentos:`, args);

      if (tool === "organizar_directorio" || tool === "crear_reporte") {
        const folderPath = args?.ruta_carpeta;
        if (!folderPath) {
          await ctx.reply("❌ No pude determinar la ruta de la carpeta. ¿Podrías indicármela?");
          return;
        }

        if (!config.supabase.url || !config.supabase.key) {
          throw new Error("Las variables SUPABASE_URL y/o SUPABASE_KEY no están definidas en la configuración.");
        }

        const formattedAction = tool === "organizar_directorio" 
          ? `organizar archivos en: **${folderPath}**` 
          : `generar reporte ${args.formato?.toUpperCase() || "PDF"} ("${args.nombre || "reporteestado"}") para la carpeta: **${folderPath}**`;

        await ctx.reply(`📂 Recibido. Enviando comando para ${formattedAction} en tu PC local...`);

        // Insert command in Supabase
        const url = `${config.supabase.url}/rest/v1/cola_comandos`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "apikey": config.supabase.key,
            "Authorization": `Bearer ${config.supabase.key}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            comando: tool,
            argumentos: args,
            estado: "pendiente"
          })
        });

        if (!res.ok) {
          throw new Error(`Supabase devolvió un estado de error ${res.status}`);
        }

        // Poll Supabase for the status change
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          if (attempts > 15) {
            clearInterval(interval);
            await ctx.reply("⚠️ El ejecutor local en tu PC no respondió a tiempo. Asegurate de que local_executor.ts esté corriendo.");
            return;
          }

          try {
            const checkRes = await fetch(`${config.supabase.url}/rest/v1/cola_comandos?comando=eq.${tool}&estado=neq.pendiente&select=*&order=id.desc&limit=1`, {
              headers: {
                "apikey": config.supabase.key,
                "Authorization": `Bearer ${config.supabase.key}`
              }
            });
            if (checkRes.ok) {
              const data = (await checkRes.json()) as any[];
              if (data.length > 0) {
                const lastCommand = data[0];
                if (lastCommand.argumentos?.ruta_carpeta === folderPath) {
                  if (lastCommand.estado === "completado") {
                    clearInterval(interval);
                    await ctx.reply(`✅ **¡Éxito en la PC local!**\n${lastCommand.resultado}`);
                  } else if (lastCommand.estado === "fallado" || lastCommand.estado === "error") {
                    clearInterval(interval);
                    await ctx.reply(`❌ **Error en la PC local:**\n${lastCommand.resultado}`);
                  }
                }
              }
            }
          } catch (err) {
            console.error("Error polling command status:", err);
          }
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
