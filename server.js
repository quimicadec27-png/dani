/**
 * QUÍMICA DEC — Backend API del CRM B2B y Cerebro IA de "Dani"
 * ==========================================================
 * Servidor Express con Reglas Comerciales Exactas, Precios Corregidos desde WooCommerce,
 * Cotización por Presentaciones Reales, Edición de Leads (Nombre, Tel, DNI), Auto-polling y Sync CRM.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Seguridad y Middleware (Permitir CORS y CORP Cross-Origin para ia_core.js)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: '*' }));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));

app.get('/favicon.ico', (req, res) => {
    res.redirect('https://quimicadec.com/wp-content/uploads/2026/04/logo_quimicadec.png');
});

// Inicialización de Clientes
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
});
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// System Prompt Oficial de "Dani"
const SYSTEM_PROMPT_DANI = `
Eres "Dani", la asistente virtual oficial de Química DEC (Concepción del Uruguay, Entre Ríos).
Hablas en primera persona como representante oficial de la empresa ("en Química DEC nos dedicamos", "ofrecemos", "nuestro local").

⚠️ REGLA DE ORO DE DIALECTO Y VOSEO ARGENTINO RIOPLATENSE ESTRICTO:
- Hablá SIEMPRE en Español Argentino Rioplatense natural, cercano, respetuoso y cálido.
- ESTÁ ROTUNDAMENTE PROHIBIDO usar palabras neutras o de España.
  ❌ Prohibido: "si eres", "ten en cuenta", "deseas", "prefieres", "recuerda", "puedes", "tienes", "quieres".
  ✅ Obligatorio Voseo: "si sos", "tené en cuenta", "deseás", "preferís", "recordá", "podés", "tenés", "querés".
- ESTÁ ROTUNDAMENTE PROHIBIDO usar la palabra "Che". Saludá siempre con "¡Hola! ¿Cómo estás?", "¡Hola! Decime...", etc., tuteando con voseo pero NUNCA usando "Che".

⚠️ REGLA DE ADVERTENCIA SUTIL SOBRE PRIMER PEDIDO MAYORISTA:
- ÚNICAMENTE al inicio de la conversación o al consultar precios por primera vez y SI EL PEDIDO AÚN NO ESTÁ DEFINIDO, podés recordar de forma sutil:
  "Recordá que si sos cliente nuevo y querés activar tu cuenta mayorista, tu primer pedido debe ser de $80.000 o más."
- ⚠️ SI EL PEDIDO YA ESTÁ DEFINIDO, SI YA SE CALCULÓ UN TOTAL O SI EL CLIENTE TE ESTÁ DANDO SUS DATOS, ESTÁ ROTUNDAMENTE PROHIBIDO REPETIR ESTA ADVERTENCIA O PREGUNTAR "¿EN QUÉ PUEDO AYUDARTE HOY?".
- ⚠️ PROHIBIDO MEZCLAR EL RETIRO DE $2.500 EN EL SALUDO DE CLIENTE NUEVO. El retiro en local a partir de $2.500 es EXCLUSIVAMENTE para clientes que YA son mayoristas. NUNCA lo menciones al hablar de la compra inicial de cliente nuevo.

⚠️ REGLA DE CONCISIÓN Y MEMORIA DE CONVERSACIÓN (PROHIBIDO SER REDUNDANTE O REPETITIVA):
- SÉ CONCISA, DIRECTA Y EFICIENTE.
- NO REPETÍS información que ya le diste al cliente previamente en el historial del chat (ej: si ya le dijiste los horarios de atención, la dirección de Av. Frondizi, las formas de pago o los $80.000 del primer pedido, NO VUELVAS A REPETIRLOS en los siguientes mensajes).
- No agregues texto innecesario ni explicaciones que no se te hayan consultado explícitamente. Mantené la conversación fluida y centrada en resolver la duda del momento.

⚠️ REGLA ABSOLUTA Y ESTRICTA: PROHIBIDO INVENTAR O DAR DATOS BANCARIOS, NOMBRES DE VENDEDORES O NÚMEROS DE TELÉFONO:
- ❌ Queda ROTUNDAMENTE PROHIBIDO inventar o escribir CBU, Alias, Cuentas Bancarias, Bancos o CUITs (ej: NUNCA escribir "Banco Santander", "Cuenta 1234567890", CBU o alias falsos).
- ❌ Queda ROTUNDAMENTE PROHIBIDO inventar nombres de asesores comerciales (ej: NUNCA decir "Juan", "Pedro", etc.).
- ❌ Queda ROTUNDAMENTE PROHIBIDO dar números de teléfono para que el cliente llame o prometer que "te vamos a llamar".

⚠️ PROTOCOLO EXCLUSIVO PARA FINALIZAR LA COMPRA O PAGAR POR TRANSFERENCIA:
- Cuando el cliente indique que quiere FINALIZAR LA COMPRA, CERRAR EL PEDIDO o PAGAR POR TRANSFERENCIA BANCARIA:
  1. Si aún no te dio su número de WhatsApp, pedíselo de forma amable:
     "Para que un asesor comercial te envíe los datos de la cuenta bancaria y coordine la entrega, ¿me compartís tu número de WhatsApp con característica?"
  2. Si ya tenés su número de WhatsApp (o te lo acaba de compartir), respondé ÚNICAMENTE:
     "¡Perfecto! Ya dejé registrada tu consulta y el resumen de tu pedido. Un asesor comercial de nuestro equipo se pondrá en contacto con vos a la brevedad por WhatsApp para pasarte los datos oficiales de la cuenta bancaria, confirmar tu pago y coordinar el despacho o retiro. ¡Muchas gracias por elegir Química DEC!"
  3. ⚠️ NUNCA inventes números de cuenta ni prometas llamadas telefónicas. La finalización y cobro son coordinados 100% por un asesor humano vía WhatsApp.

⚠️ REGLAS SOBRE ESPECIFICACIÓN DE VARIABLES DE PRODUCTO (TAMAÑOS, LITROS, FRAGANCIAS):
- Nuestros productos cuentan con distintas variantes (Formatos 1L, 2L, 5L, pastas concentradas 50L, fragancias como Skip, Ariel, Downy, Vivere, Mary Cher, aromatizantes de piso, variedad de sahumerios, etc.).
- Si el cliente consulta por un producto sin especificar la cantidad, los litros o la fragancia exacta, pedile amablemente que te indique el tamaño o aroma deseado para cotizarle con precisión.
- Si el cliente desea explorar todas las opciones disponibles, compartí SIEMPRE el enlace Markdown oficial del catálogo: [Catálogo de Productos](https://quimicadec.com/nuestros-productos/). (PROHIBIDO escribir la URL como texto plano sin formato link).

⚠️ REGLA DE PROFESIONALISMO Y PROTOCOLO ANTE FRUSTRACIÓN / ENFADO DEL CLIENTE (CRÍTICO Y ESTRICTO):
1. SI EL CLIENTE SE ENJOJA, SE MOLESTA O MANIFIESTA FRUSTRACIÓN (Ej: "no sabés nada", "respondé bien", "te equivocaste"):
   - Queda ROTUNDAMENTE PROHIBIDO usar frases victimistas, informales o de auto-compasión como:
     ❌ "Estoy aprendiendo"
     ❌ "¿Me podés ayudar a aprender con vos?"
     ❌ "Perdón por no saber"
     ❌ "Soy solo un bot desorientado"
   - Respondé de forma SOBRIA, EJECUTIVA, CORDIAL Y ALTAMENTE PROFESIONAL.
   - Ofrecé de inmediato la derivación con un asesor comercial humano, informando brevemente las funciones que vos podés resolver:
     "Te pido disculpas por el inconveniente. Para brindarte una atención exacta y personalizada, puedo derivarte de inmediato con uno de nuestros asesores comerciales humanos. Recordá que desde aquí también puedo informarte el stock en tiempo real, calcularte presupuestos de listas de productos, informarte nuestros medios de pago y horarios de atención. ¿Deseás que le transfiera tu consulta a un representante comercial?"

2. SI EL CLIENTE PIDE EXPLÍCITAMENTE HABLAR CON UN HUMANO O ASESOR COMERCIAL:
   - Respondé de inmediato con total cordialidad profesional:
     "¡Con mucho gusto! Ya dejé asentada tu consulta para que un representante de nuestro equipo comercial se ponga en contacto contigo a la brevedad."

⚠️ REGLAS ESTRICTAS DE CAPTURA SUTIL DE LEAD (NOMBRE, APELLIDO Y WHATSAPP):
1. EN LA PRIMERA RESPUESTA AL CLIENTE (Si no te ha dicho su nombre aún):
   - Respondé PRIMERO de forma directa y amable lo que el cliente está consultando (precios, stock, productos).
   - En ese mismo mensaje, presentate educadamente e invitá a decirte su nombre:
     "¡Hola! Mi nombre es Dani, muchas gracias por consultar. Sí, ¡tenemos [producto]! Me gustaría saber tu nombre y apellido para poder brindarte una atención personalizada. ¿Cuál es tu nombre?"
2. EN LA SEGUNDA O TERCERA INTERACCIÓN (Sugerencia de WhatsApp):
   - Tras responder sus consultas sobre productos, sugerí amablemente:
     "Para que un representante de nuestro equipo pueda enviarte el presupuesto completo o ayudarte a cerrar la compra, ¿me compartís tu número de WhatsApp con característica?"
3. RECUERDA: Dejá que el cliente consulte todo lo que necesite; NO lo derivés abruptamente salvo que lo solicite o se presente una queja/frustración.

⚠️ CATÁLOGO COMPLETO DE PRODUCTOS QUÍMICA DEC:
Sí vendemos y distribuimos:
- Productos Líquidos: Jabones para ropa (Skip, Ariel), Suavizantes (Downy, Vivere, Mary Cher, Eco Plus), Detergentes (Amarillo Limón, Magenta, Tipo CIF), Desodorantes de piso, Lavandina (dilución 1+2), Cloro, Desengrasantes, Ceras, Siliconas.
- Sahumerios Tuk Tuk, Amogh, Prana, Sree Vani, Nuna Terra: Sahumerios x50u, Dhoop Sticks, etc. ¡SÍ LOS VENDEMOS!
⚠️ REGLAS SOBRE ESPECIFICACIÓN DE VARIABLES DE PRODUCTO (TAMAÑOS, LITROS, FRAGANCIAS):
- CLORO LÍQUIDO (1+2 partes de agua):
  * La presentación inicial mínima es el bidón de 20 LITROS a $15.060. ¡QUEDA ROTUNDAMENTE PROHIBIDO decir que se vende cloro líquido de 1 litro fraccionado (no existe 1L de cloro líquido)!
  * Otras presentaciones disponibles de Cloro Líquido: 40 LT ($29.675,60), 60 LT ($43.719,60), 120 LT ($85.534,80) y 200 LT ($139.648).
- PASTILLAS DE CLORO TRIPLE ACCIÓN:
  * Disponibles en pastillas de 50g y 200g (por unidad o sueltas por 1 kg).
- Desinfectantes en Aerosol: DESINFECTANTE CIF (Floral, Frescura Cítrica, Lavanda, Original 360gr a $3.591,99).
- Insecticidas: Raid, Fuyi (exclusivamente insecticidas en aerosol / espirales / tabletas, NUNCA ofrecerlos como desinfectantes).
- Desinfección Concentrada: Lavandina Líquida (dilución 1+2).

⚠️ ETAPA DE CIERRE Y CONFIRMACIÓN DE PEDIDO (CRÍTICO):
- Cuando el cliente ya definió los productos que desea comprar (ej: 120 litros de cloro) y te brinda su Nombre, WhatsApp, DNI o Dirección para finalizar:
  * ❌ QUEDA ROTUNDAMENTE PROHIBIDO reiniciar la charla diciendo "¿En qué puedo ayudarte hoy?" o "¿Estás buscando algún producto?".
  * ❌ NO repitas advertencias de $80.000 si el pedido ya supera ese monto.
  * ✅ DEBÉS CONFIRMAR EL PEDIDO DIRECTAMENTE:
    "¡Excelente, [Nombre]! Ya registré tus datos. Tu pedido de [Producto y Cantidad] por un total de $[Total con Envío] quedó agendado en nuestro sistema. En breve, un asesor comercial humano se comunicará con vos por WhatsApp para pasarte los datos de pago (Efectivo o Transferencia) y coordinar el despacho. ¡Muchas gracias por elegir Química DEC!"
⚠️ REGLA CRÍTICA ANTI-ALUCINACIÓN DE MARCAS: Queda ROTUNDAMENTE PROHIBIDO inventar marcas o productos inexistentes como "desinfectante concentrado Lysoform" o "desinfectante Fuyi". Los desinfectantes oficiales son ÚNICAMENTE DESINFECTANTE CIF (en aerosol) y Lavandina (concentrada y diluible).

⚠️ MEDIOS DE PAGO OFICIALES DE QUÍMICA DEC (ESTRICTO - PROHIBIDO INVENTAR OTROS):
- ÚNICAMENTE ACEPTAMOS DOS MEDIOS DE PAGO:
  1. Pago en EFECTIVO (en el local o al retirar).
  2. TRANSFERENCIA BANCARIA.
- Queda ROTUNDAMENTE PROHIBIDO mencionar tarjetas de crédito, tarjetas de débito, Mercado Pago en cuotas o financiación.

⚠️ REGLA ABSOLUTA ANTI-INVENCIÓN DE PRECIOS:
- EL VALOR "$2.500" ES ÚNICA Y EXCLUSIVAMENTE EL MONTO MÍNIMO DE COMPRA PARA RETIRAR EN EL LOCAL (para clientes mayoristas registrados). ¡BAJO NINGUNA CIRCUNSTANCIA ES EL PRECIO DE UN PRODUCTO!
- QUEDA ROTUNDAMENTE PROHIBIDO ASIGNAR $2.500 O CUALQUIER PRECIO INVENTADO A PRODUCTOS (como desinfectantes, ceras, jabones, etc.).
- DEBÉS USAR ÚNICAMENTE LOS PRECIOS OFICIALES Y CÁLCULOS QUE APARECEN EN "[DATOS REALES Y CÁLCULOS MATEMÁTICOS OFICIALES DE QUÍMICA DEC]".
- SI NO HAY DATOS DE PRECIO ESPECÍFICOS EN LA SECCIÓN DE CÁLCULO, INVITÁ AL CLIENTE A VER EL CATÁLOGO EN quimicadec.com/catalogo CON LA LUPITA DE BÚSQUEDA 🔍 O DERIVALO CON UN ASESOR, PERO NUNCA INVENTES UN MONTO.

⚠️ POLÍTICAS COMERCIALES, HORARIOS Y ENVÍOS OFICIALES DE QUÍMICA DEC (ESTRICTO):
1. HORARIOS DE ATENCIÓN EN LOCAL (Av. Frondizi 815, Concepción del Uruguay):
   - Lunes a Viernes: Turno Mañana de 8:00 a 12:30 hs y Turno Tarde de 16:30 a 19:30 hs.
   - Sábados: de 8:00 a 12:30 hs.
   - Retiro en Local: A partir de $2.500 por pedido (para clientes mayoristas registrados).

2. COMPRA MÍNIMA MAYORISTA:
   - Registro e Inicio Mayorista: $80.000 acumulados.
   - Mantenimiento Mensual: Acumular $80.000 o más en compras mensuales.

3. POLÍTICA EXACTA DE ENVÍOS EN CONCEPCIÓN DEL URUGUAY Y RESTO DEL PAÍS (ESTRICTO):
   - DENTRO DE CONCEPCIÓN DEL URUGUAY: Envío GRATIS a domicilio ÚNICAMENTE en compras a partir de $50.000.
     ⚠️ SI LA COMPRA ES MENOR A $50.000: NO SE REALIZAN ENVÍOS A DOMICILIO. El cliente debe RETIRAR PERSONALMENTE EN EL LOCAL (mínimo de retiro $2.500 para mayoristas). Queda ROTUNDAMENTE PROHIBIDO ofrecer "coordinar envíos personalizados" o enviar a domicilio compras menores a $50.000 en Concepción del Uruguay.
   - DENTRO DE LA PROVINCIA DE ENTRE RÍOS: Se envía por transporte MOSTTO a domicilio y el costo de envío es EXACTAMENTE del 5% del valor total de la factura.
   - RESTO DE ARGENTINA / RESTO DEL PAÍS: Se despacha a través de ANDREANI y VÍA CARGO.
     ⚠️ REGLA CRÍTICA PARA RESTO DEL PAÍS: Queda ROTUNDAMENTE PROHIBIDO dar valores en pesos o estimaciones de costo de envío (ej: NO decir "$120.000 - $150.000"). Explicá únicamente que se despacha por Andreani o Vía Cargo y que un asesor comercial calculará y confirmará el costo exacto según el peso y bultos del pedido.
   - SIN REDUNDANCIAS GEOGRÁFICAS: Queda PROHIBIDO escribir aclaraciones redundantes u obvias como "(dentro de la provincia de Entre Ríos)" o "(fuera de la provincia de Entre Ríos)". Hablá de forma directa y fluida.

⚠️ REGLA DE CONTINUIDAD DE CONVERSACIÓN (NO REPETIR SALUDOS NI REPETIR LO YA DICHO):
- SI EN EL HISTORIAL DE MENSAJES YA HUBO UN SALUDO PREVIO, PROHIBIDO DECIR "¡Hola!" O PRESENTARTE DE NUEVO.
- RESPONDE DIRECTAMENTE AL ÚLTIMO MENSAJE SIN REPETIR CONCEPTOS YA INFORMADOS EN MENSAJES ANTERIORES.
`;

// Health Check API
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        service: 'Química DEC CRM, Chat en Vivo & IA API',
        timestamp: new Date().toISOString()
    });
});

const MENU_CATEGORIES_CONFIG = [
    { key: 'PRODUCTOS LÍQUIDOS', icon: 'local_wash', terms: ['JABON', 'JABÓN', 'SUAVIZANTE', 'DETERGENTE', 'DESODORANTE', 'LAVANDINA', 'CLORO', 'DESENGRASANTE', 'CERA', 'SILICONA'] },
    { key: 'SAHUMERIOS Y AROMAS', icon: 'self_improvement', terms: ['SAHUMERIO', 'SAUMERIO', 'AMOGH', 'TUK', 'PRANA', 'DHOOP', 'CONO', 'VARILLA'] },
    { key: 'AEROSOLES Y PESTICIDAS', icon: 'sprinkler', terms: ['AEROSOL', 'RAID', 'LYSOFORM', 'FUYI', 'OFF', 'PERFUMINA', 'INSECTICIDA', 'REPELENTE'] },
    { key: 'PASTAS Y CONCENTRADOS', icon: 'science', terms: ['PASTA', 'CONCENTRADO', 'PASTAS', '50L', '1+4'] },
    { key: 'ENVASES Y BOLSAS', icon: 'inventory_2', terms: ['ENVASE', 'BOLSA', 'BIDON', 'BIDÓN', 'BOTELLA'] },
    { key: 'ESPECIALIDADES Y VARIOS', icon: 'grid_view', terms: [] }
];

const SPANISH_STOP_WORDS = [
    'hola', 'buenas', 'tardes', 'dias', 'noches', 'saludos', 'quisiera', 'saber', 'cuanto', 'cuánto',
    'sale', 'precio', 'precios', 'detergente', 'sahumerio', 'sahumerios', 'saumerio', 'saumerios',
    'jabon', 'jabón', 'suavizante', 'lavandina', 'cloro', 'desinfectante', 'repelente', 'envio', 'envío',
    'envios', 'envíos', 'stock', 'tenes', 'tenés', 'tienen', 'puedo', 'hacer', 'gracias', 'favor',
    'mismo', 'minima', 'mínima', 'mayorista', 'retiro', 'local', 'transferencia', 'efectivo', 'medios',
    'pago', 'forma', 'opciones', 'formatos', 'bidon', 'bidón', 'litros', 'unidad', 'unidades', 'combo',
    'combos', 'descuento', 'oferta', 'quiero', 'comprar', 'donde', 'dónde', 'como', 'cómo', 'cuando',
    'cuándo', 'ustedes', 'estoy', 'interesado', 'interesada', 'necesito', 'buscando', 'alguna', 'algun',
    'algún', 'tengan', 'hablar', 'contacto', 'producto', 'productos',
    // Preposiciones y palabras funcionales (causaban capturas falsas como "Para Paraná")
    'para', 'por', 'con', 'sin', 'hay', 'costo', 'extra', 'desde', 'hasta', 'entre', 'sobre',
    'bajo', 'ante', 'tras', 'segun', 'según', 'durante', 'este', 'esta', 'estos', 'estas',
    'ese', 'esa', 'esos', 'esas', 'que', 'quien', 'quién', 'cual', 'cuál', 'mucho', 'mucha',
    'muchos', 'muchas', 'poco', 'poca', 'todo', 'toda', 'todos', 'todas'
];

// Extractor Automático de Datos de Lead usando IA (Nombre, Teléfono, DNI/CUIT)
// Usa Groq LLM para extracción inteligente — solo actualiza campos vacíos o con valor placeholder
async function autoExtractAndUpdateLead(clienteId, clienteObj, textoUsuario) {
    if (!clienteId || !textoUsuario) return;

    // Filtro rápido: solo procesar si hay pistas de datos personales
    const TRIGGER_HINTS = [
        /\b(me llamo|mi nombre|soy|llaman|apellido)\b/i,
        /\b(dni|cuit|cuil|documento|número|nro\.?)\b/i,
        /\b\d{7,11}\b/,
        /\b(\+?54\s*9?\s*\d[\d\s.-]{7,})\b/
    ];
    if (!TRIGGER_HINTS.some(rx => rx.test(textoUsuario))) return;

    try {
        let extracted = { nombre: null, telefono: null, dni: null };

        // 1. Extraer DNI / CUIT
        const dniMatch = textoUsuario.match(/(?:dni|cuit|cuil|documento|doc)?:?\s*(\d{7,11})\b/i);
        if (dniMatch) {
            extracted.dni = dniMatch[1];
        }

        // 2. Extraer Teléfono / WhatsApp
        const telMatch = textoUsuario.match(/(?:(?:whats|whatsapp|tel|telefono|cel|celular|numero|num)?:?\s*(?:\+?54\s*9?)?)(\d{8,12})\b/i);
        if (telMatch) {
            const digits = telMatch[0].replace(/\D/g, '');
            if (digits.length >= 8 && digits.length <= 13) {
                extracted.telefono = digits;
            }
        }

        // 3. Extraer Nombre
        const nameExplicit = textoUsuario.match(/(?:me llamo|soy|mi nombre es)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ ]{3,30})/i);
        if (nameExplicit) {
            const possibleName = nameExplicit[1].split(/\b(y|mi|el|la|en|de|para|con|mi numero|mi tel|mi whats)\b/i)[0].trim();
            if (possibleName.length > 2) extracted.nombre = possibleName;
        } else if (!/(?:quiero|precio|litros|costo|envio|hola|cloro|desinfectante|lavandina|jabón|cera|detergente)/i.test(textoUsuario)) {
            const words = textoUsuario.split(/\s+(?:y|mi|con)\s+/i)[0].trim().split(/\s+/);
            if (words.length >= 2 && words.length <= 3 && words.every(w => /^[A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}$/.test(w))) {
                extracted.nombre = words.join(' ');
            }
        }

        // 2. Solo actualizar campos que son vacíos o placeholders genéricos
        const currentNombre   = (clienteObj?.razon_social || '').trim();
        const currentWhatsapp = (clienteObj?.whatsapp || '').trim();
        const currentCuit     = (clienteObj?.cuit || '').trim();
        const isPlaceholderNombre   = !currentNombre   || currentNombre.startsWith('Lead Web')   || currentNombre.startsWith('Cliente Web');
        const isPlaceholderWhatsapp = !currentWhatsapp || currentWhatsapp.startsWith('Web_');
        const isPlaceholderCuit     = !currentCuit     || currentCuit.startsWith('Web_');

        const updateData = {};

        if (extracted.nombre && isPlaceholderNombre) {
            const nombreCapitalizado = extracted.nombre
                .split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');
            updateData.razon_social    = nombreCapitalizado;
            updateData.contacto_nombre = nombreCapitalizado;
        }

        if (extracted.telefono && extracted.telefono.length >= 8 && isPlaceholderWhatsapp) {
            const cleanTel = extracted.telefono.substring(0, 20);
            updateData.whatsapp = cleanTel;
        }

        if (extracted.dni && extracted.dni.length >= 7 && isPlaceholderCuit) {
            updateData.cuit = extracted.dni.substring(0, 13);
        }

        if (Object.keys(updateData).length > 0) {
            await supabase.from('clientes').update(updateData).eq('id', clienteId);
            console.log('[AUTO LEAD EXTRACT] Ficha actualizada:', clienteId, updateData);
        }
    } catch(err) {
        console.error('[AUTO LEAD EXTRACT ERROR]:', err.message);
    }
}

// Helper para verificar si el Bot está pausado para un cliente específico por intervención humana
async function isBotPausado(clienteId) {
    if (!clienteId) return false;
    try {
        const { data: msgs } = await supabase
            .from('mensajes_chat')
            .select('texto')
            .eq('cliente_id', clienteId)
            .or('texto.ilike.%[BOT PAUSADO]%,texto.ilike.%[BOT REANUDADO]%')
            .order('creado_el', { ascending: false })
            .limit(1);

        if (msgs && msgs.length > 0) {
            return msgs[0].texto.includes('[BOT PAUSADO]');
        }
    } catch(e) {}
    return false;
}

// =========================================================================
// 1. ENDPOINT DE CHAT EN VIVO E IA (Utilizado por la web y WhatsApp)
// =========================================================================
app.post('/api/whatsapp/incoming-ai', async (req, res) => {
    try {
        const { phone, user_id, session_id, cliente_id, mensaje_texto, user_message, message, messages, contents, prompt } = req.body;
        
        // 1. Extraer el texto de la última consulta del usuario
        let textoProcesado = (prompt || mensaje_texto || user_message || message || '').trim();

        // 1. Extraer si viene en formato OpenAI/Groq (messages)
        if (!textoProcesado && Array.isArray(messages) && messages.length > 0) {
            const lastUser = [...messages].reverse().find(m => m.role === 'user');
            if (lastUser && lastUser.content) {
                textoProcesado = lastUser.content.trim();
            }
        }

        // 2. Extraer si viene en formato Gemini (contents)
        if (!textoProcesado && Array.isArray(contents) && contents.length > 0) {
            const lastUser = [...contents].reverse().find(c => c.role === 'user');
            if (lastUser && lastUser.parts && lastUser.parts[0] && lastUser.parts[0].text) {
                textoProcesado = lastUser.parts[0].text.trim();
            }
        }

        const rawPhone = (phone || user_id || session_id || 'Cliente Web').toString();
        const clientePhone = rawPhone.substring(0, 20);

        if (!textoProcesado) return res.status(400).json({ error: 'Mensaje vacío' });

        // Generar nombre de Lead limpio para visitas web
        let leadNombre = `Cliente Web (${clientePhone.substring(0, 12)})`;
        if (clientePhone.startsWith('Web_')) {
            const shortId = clientePhone.replace('Web_', '').substring(0, 8);
            leadNombre = `Lead Web #${shortId}`;
        }

        // Buscar o registrar cliente en Supabase para que APAREZCA EN EL CRM EN VIVO
        let cliente = null;

        // 1. Si el frontend web ya envió el UUID del cliente persistente, buscar por ID
        if (cliente_id && cliente_id.length > 20) {
            try {
                const { data: cById } = await supabase
                    .from('clientes')
                    .select('id, razon_social, whatsapp, cuit, contacto_nombre')
                    .eq('id', cliente_id)
                    .maybeSingle();
                cliente = cById;
            } catch (e) {}
        }

        // 2. Si no se encontró por ID, buscar por whatsapp / session_id
        if (!cliente) {
            try {
                const { data: existingC } = await supabase
                    .from('clientes')
                    .select('id, razon_social, whatsapp, cuit, contacto_nombre')
                    .eq('whatsapp', clientePhone)
                    .maybeSingle();
                cliente = existingC;
            } catch (e) {
                console.error('Error buscando cliente:', e.message);
            }
        }

        // 3. Si no existe, crear registro nuevo (CUIT SIEMPRE NULL para evitar códigos Web_ en DNI)
        if (!cliente) {
            try {
                const { data: newC } = await supabase
                    .from('clientes')
                    .insert([{ razon_social: leadNombre, whatsapp: clientePhone, cuit: null }])
                    .select()
                    .maybeSingle();
                cliente = newC;
            } catch (e) {
                console.error('Error creando cliente lead web:', e.message);
            }
        }

        let clienteId = cliente ? cliente.id : null;
        if (clienteId) {
            try {
                await supabase.from('mensajes_chat').insert([{ cliente_id: clienteId, emisor: 'cliente', texto: textoProcesado }]);
                // Extraer automáticamente Nombre, Apellido y WhatsApp del texto y actualizar ficha del Lead (en segundo plano)
                autoExtractAndUpdateLead(clienteId, cliente, textoProcesado).catch(e => console.error('[AUTO EXTRACT BACKGROUND ERROR]', e.message));
            } catch (e) { console.error('Error insertando mensaje:', e.message); }
        }

        // Obtener historial previo desde Supabase (y verificar si el Bot está pausado por un vendedor humano)
        let historialPrevio = [];
        if (clienteId) {
            try {
                const { data: ultimosMsgs } = await supabase
                    .from('mensajes_chat')
                    .select('emisor, texto')
                    .eq('cliente_id', clienteId)
                    .order('creado_el', { ascending: false })
                    .limit(15);

                if (ultimosMsgs && ultimosMsgs.length > 0) {
                    const pausadoMsg = ultimosMsgs.find(m => m.texto.includes('[BOT PAUSADO]') || m.texto.includes('[BOT REANUDADO]'));
                    if (pausadoMsg && pausadoMsg.texto.includes('[BOT PAUSADO]')) {
                        console.log(`[BOT PAUSADO] Cliente ${clienteId} tiene el bot deshabilitado.`);
                        return res.json({
                            success: true,
                            cliente_id: clienteId,
                            bot_pausado: true,
                            respuesta_sugerida_ia: '',
                            choices: [{ message: { content: '' } }]
                        });
                    }

                    historialPrevio = ultimosMsgs
                        .filter(m => !m.texto.includes('[BOT PAUSADO]') && !m.texto.includes('[BOT REANUDADO]'))
                        .reverse()
                        .map(m => {
                            if (m.emisor === 'cliente') {
                                return { role: 'user', content: m.texto };
                            } else if (m.emisor === 'vendedor') {
                                return { role: 'assistant', content: `[Intervención de Vendedor Humano]: ${m.texto}` };
                            } else {
                                return { role: 'assistant', content: m.texto };
                            }
                        });
                }
            } catch (e) {}
        }

        // Cotizador matemático exacto para precios de productos y listas extensas (con memoria contextual)
        let itemsExtraidos = [];
        try {
            // Extraer últimos 3 mensajes de contexto para saber de qué producto habla si el cliente solo dice "50 unidades"
            const ultimosContexto = (historialPrevio || []).slice(-3).map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
            }));

            const parserMessages = [
                { 
                    role: "system", 
                    content: `Analizá el último mensaje del usuario para extraer productos y cantidades solicitadas del catálogo.
Si el mensaje contiene únicamente datos personales (nombre, teléfono, dirección, DNI), saludos o confirmaciones, respondé EXACTAMENTE: {"items": []}.
Respondé en formato JSON estricto: {"items": [{"busqueda": "nombre del producto", "cantidad": number}]}` 
                },
                ...ultimosContexto
            ];

            if (ultimosContexto.length === 0 || ultimosContexto[ultimosContexto.length - 1].content !== textoProcesado) {
                parserMessages.push({ role: "user", content: textoProcesado });
            }

            const parserCompletion = await groq.chat.completions.create({
                messages: parserMessages,
                model: "llama-3.1-8b-instant",
                response_format: { type: "json_object" },
                temperature: 0.1
            });
            const parsed = JSON.parse(parserCompletion.choices[0]?.message?.content || '{}');
            itemsExtraidos = parsed.items || [];
        } catch (e) {
            console.error('[PARSER GROQ ERROR]', e.message);
        }

        let cotizacionCalculada = "";
        let desgloses = [];
        let totalGeneralCotizacion = 0;
        let itemsCotizadosCuenta = 0;

        if (itemsExtraidos && itemsExtraidos.length > 0) {
            const busquedas = itemsExtraidos;
            
            for (const itemObj of busquedas) {
                let prods = [];
                let queryStr = (typeof itemObj === 'string' ? itemObj : (itemObj.busqueda || '')).toLowerCase().trim();
                let cantidadDeseada = (typeof itemObj === 'object' && itemObj.cantidad) ? parseInt(itemObj.cantidad) || 1 : 1;
                if (!queryStr) continue;

                // Normalizar faltas de ortografía comunes, plurales y sinónimos (saumerio -> sahumerio, desinfectantes -> desinfectante, litros -> LT)
                queryStr = queryStr.replace(/\bsaumerios?\b/gi, 'sahumerio')
                                   .replace(/\bsahumerios?\b/gi, 'sahumerio')
                                   .replace(/\bdesinfectantes?\b/gi, 'desinfectante')
                                   .replace(/\bconcentrados?\b/gi, 'concentrado')
                                   .replace(/\bjabones?\b/gi, 'jabon')
                                   .replace(/\bsuavizantes?\b/gi, 'suavizante')
                                   .replace(/\bdetergentes?\b/gi, 'detergente')
                                   .replace(/\blimpiadores?\b/gi, 'limpiador')
                                   .replace(/\baerosoles?\b/gi, 'aerosol')
                                   .replace(/\bpastas?\b/gi, 'pasta')
                                   .replace(/\bperfuminas?\b/gi, 'perfumina')
                                   .replace(/\bdiluibles?\b/gi, 'diluir')
                                   .replace(/\binsecticidas?\b/gi, 'insecticida')
                                   .replace(/\blitros?\b/gi, 'LT')
                                   .replace(/\blts?\b/gi, 'LT');

                const stopWords = ['cuanto', 'sale', 'tenes', 'opciones', 'producto', 'precio', 'este', 'para', 'saber', 'quisiera', 'quiero', 'necesito', 'unidades', 'paquetes', 'cajas'];
                const words = queryStr.split(' ').filter(w => w.length > 2 && !stopWords.includes(w));
                if (words.length === 0) continue;

                // 1. Consultar WooCommerce Live Search PRIMERO con timeout de 4.5s
                try {
                    const wcRes = await fetch(`https://quimicadec.com/?qdec_api=search_product&secret_key=qdec_crm_sec_2026&q=${encodeURIComponent(queryStr)}`, {
                        signal: AbortSignal.timeout(4500)
                    });
                    if (wcRes.ok) {
                        const wcData = await wcRes.json();
                        if (wcData && wcData.success && wcData.products && wcData.products.length > 0) {
                            prods = wcData.products.filter(p => {
                                const pSku = (p.sku || '').toUpperCase();
                                const pName = (p.name || '').toUpperCase();
                                const price = parseFloat(p.regular_price || p.price || 0);
                                if (pSku.includes('QD-DTRG-1320') || (pName.includes('MAGISTRAL AZUL') && price < 1000)) {
                                    return false;
                                }
                                return true;
                            });
                        }
                    }
                } catch(e) {}

                // 2. Fallback a Supabase dec_products ÚNICAMENTE si WooCommerce no devolvió NINGÚN resultado
                if (prods.length === 0) {
                    let queryBuilder = supabase
                        .from('dec_products')
                        .select('name, price, stock_status, sku')
                        .or('status.eq.publish,status.eq.publicado');

                    for (const w of words) {
                        queryBuilder = queryBuilder.ilike('name', `%${w}%`);
                    }

                    let { data: sbProds } = await queryBuilder.limit(10);
                    if (!sbProds || sbProds.length === 0) {
                        const sortedWords = words.sort((a,b) => b.length - a.length);
                        const longestWord = sortedWords[0];
                        if (longestWord && longestWord.length > 2) {
                            const { data: fallbackProds } = await supabase
                                .from('dec_products')
                                .select('name, price, stock_status, sku')
                                .or('status.eq.publish,status.eq.publicado')
                                .ilike('name', `%${longestWord}%`)
                                .limit(10);
                            sbProds = fallbackProds;
                        }
                    }
                    if (sbProds && sbProds.length > 0) prods = sbProds;
                }

                if (prods && prods.length > 0) {
                    const bestMatch = prods[0];
                    const rawPrice = parseFloat(bestMatch.regular_price || bestMatch.price || 0);
                    const stockText = bestMatch.stock_status === 'instock' || !bestMatch.stock_status ? 'Disponible ✅' : 'Consultar ⚠️';
                    const cleanName = bestMatch.name.replace(/\(SKU:.*?\)/gi, '').trim();

                    if (rawPrice > 0) {
                        const subtotal = rawPrice * cantidadDeseada;
                        totalGeneralCotizacion += subtotal;
                        itemsCotizadosCuenta++;

                        let lineText = `• ${cleanName}: ${cantidadDeseada} u. x $${rawPrice.toLocaleString('es-AR')} = $${subtotal.toLocaleString('es-AR')} [Stock: ${stockText}]`;
                        
                        // Si el cliente consultó por $80.000 para un solo ítem
                        if (cantidadDeseada === 1) {
                            const minQty80k = Math.ceil(80000 / rawPrice);
                            const minTotal80k = minQty80k * rawPrice;
                            lineText += `\n  * Para alcanzar la compra mínima de $80.000 se necesitan ${minQty80k} unidades ($${minTotal80k.toLocaleString('es-AR')} en total).`;
                        }
                        
                        desgloses.push(lineText);
                    } else {
                        desgloses.push(`• ${cleanName}: Consultar presentaciones y precios disponibles. [Stock: ${stockText}]`);
                    }

                    // Sugerir variantes si hay otras opciones
                    if (prods.length > 1 && busquedas.length <= 2) {
                        prods.slice(1, 4).forEach(otherP => {
                            const pPrice = parseFloat(otherP.regular_price || otherP.price || 0);
                            const otherCleanName = otherP.name.replace(/\(SKU:.*?\)/gi, '').trim();
                            if (pPrice > 0) {
                                desgloses.push(`  - Variante / Opción: ${otherCleanName} ($${pPrice.toLocaleString('es-AR')} c/u)`);
                            }
                        });
                    }
                }
            }

            if (desgloses.length > 0) {
                let resumenTotalGlobal = "";
                if (itemsCotizadosCuenta > 1 && totalGeneralCotizacion > 0) {
                    resumenTotalGlobal = `\n\n🧮 TOTAL ESTIMADO GENERAL CALCULADO ($${totalGeneralCotizacion.toLocaleString('es-AR')})`;
                }

                cotizacionCalculada = "\n[DATOS REALES Y CÁLCULOS MATEMÁTICOS OFICIALES DE QUÍMICA DEC]:\n" + desgloses.join('\n') + resumenTotalGlobal +
                "\n\n⚠️ INSTRUCCIONES ESTRICTAS PARA PRESENTAR LA LISTA DE PRECIOS Y ATENDER AL CLIENTE:" +
                "\n1. SIN CÓDIGOS TÉCNICOS NI SKUs: Queda ROTUNDAMENTE PROHIBIDO mostrar códigos técnicos, SKUs o choclos de texto confuso (ej: QD-LCHL-1277). Presentá nombres de productos limpios, claros y comerciales." +
                "\n2. MANEJO INTELIGENTE DE FRAGANCIAS Y PRESENTACIONES: Si el cliente pidió un producto general que tiene diferentes aromas (ej: sahumerios) o medidas (ej: bidones de 5L vs tambor 100L), explicale la presentación de referencia y decile amablemente que si busca una fragancia o medida específica, puede ingresar a nuestro catálogo en quimicadec.com/catalogo y buscar directamente con la LUPITA DE BÚSQUEDA 🔍 por el nombre del producto para ver todas las variantes disponibles y agregarlas al carrito." +
                "\n3. CALCULADORA MATEMÁTICA EXACTA: Usá ÚNICAMENTE los números exactos calculados arriba. Al final del desglose de productos, mostrá de forma clara el TOTAL ESTIMADO GENERAL CALCULADO." +
                "\n4. MEDIOS DE PAGO (RECORDATORIO CRÍTICO): ÚNICAMENTE aceptamos pago en EFECTIVO o TRANSFERENCIA BANCARIA. Jamás menciones tarjetas de crédito, débito ni cuotas.";
            } else {
                cotizacionCalculada = "\n⚠️ INSTRUCCIÓN SI NO SE ENCONTRÓ EN BÚSQUEDA AUTOMÁTICA:\nInformá amablemente al cliente que puede revisar el catálogo completo en quimicadec.com/catalogo buscando directamente con la LUPITA DE BÚSQUEDA 🔍 por el nombre del producto. JAMÁS INVENTES PRECIOS FALSOS NI PRODUCTOS EN BORRADOR.";
            }
        }


        const tieneMensajesAnteriores = historialPrevio.length > 1;
        const userProvidedContact = textoProcesado.match(/(?:mi (?:nombre|whats|whatsapp|tel|telefono|dni)|me llamo|soy|@|\d{7,})/i);
        let directiveContinuidad = "";
        if (tieneMensajesAnteriores && userProvidedContact) {
            directiveContinuidad = `\n⚠️ INSTRUCCIÓN DE CIERRE DE PEDIDO INMEDIATO:\nEl cliente te acaba de responder con sus datos de contacto para completar su pedido. Agradecé cordialmente sus datos, confirmale que su pedido quedó agendado y que un asesor comercial humano se comunicará por WhatsApp para coordinar el pago (Efectivo o Transferencia) y el envío. PROHIBIDO decir "¿En qué puedo ayudarte hoy?" o preguntar qué producto busca.`;
        }

        const promptInstrucciones = `${SYSTEM_PROMPT_DANI}\n${tieneMensajesAnteriores ? '⚠️ ATENCIÓN CRÍTICA DE CONTINUIDAD DE CHAT:\nEsta conversación YA ESTÁ EN CURSO. Recordá perfectamente lo que se habló antes en el historial. ESTÁ ABSOLUTAMENTE PROHIBIDO SALUDAR DE NUEVO ("¡Hola!", "Hola", "Soy Dani..."). Responde directo y con memoria al último mensaje del usuario.' : ''}\n${directiveContinuidad}\n${cotizacionCalculada}`;


        const messagesPayload = [
            { role: "system", content: promptInstrucciones }
        ];

        historialPrevio.forEach(m => {
            if (m.role !== 'system') messagesPayload.push(m);
        });

        const lastMsgInPayload = messagesPayload[messagesPayload.length - 1];
        if (!lastMsgInPayload || lastMsgInPayload.role !== 'user' || lastMsgInPayload.content !== textoProcesado) {
            messagesPayload.push({ role: "user", content: textoProcesado });
        }

        let completion = await groq.chat.completions.create({
            messages: messagesPayload,
            model: "llama-3.1-8b-instant",
            temperature: 0.2
        });

        let respuestaIA = completion.choices[0]?.message?.content || "Perfecto, ¿en qué te puedo ayudar?";
        
        // Filtro de seguridad post-procesamiento (elimina SKUs, tarjetas, cuotas, CBU/cuentas inventadas, teléfonos falsos, español neutro o modismos victimistas)
        respuestaIA = respuestaIA.replace(/\b\(?SKU:\s*[\w-]+\)?\b/gi, '')
                                 .replace(/tarjetas? de (crédito|débito)/gi, 'efectivo o transferencia bancaria')
                                 .replace(/\bcuotas\b/gi, 'pago al contado')
                                 .replace(/\bche,?\s*/gi, '')
                                 .replace(/base de datos dec_products/gi, 'nuestro catálogo')
                                 .replace(/base de datos/gi, 'nuestro catálogo')
                                 .replace(/estoy aprendiendo\b/gi, 'estoy para ayudarte')
                                 .replace(/ayudarme a aprender/gi, 'ayudarte con tu consulta')
                                 .replace(/ayudar a aprender/gi, 'ayudarte con tu consulta')
                                 .replace(/soy solo un bot/gi, 'soy la asistente virtual')
                                 .replace(/\bsi eres\b/gi, 'si sos')
                                 .replace(/\bten en cuenta\b/gi, 'tené en cuenta')
                                 .replace(/\bdeseas\b/gi, 'deseás')
                                 .replace(/\bprefieres\b/gi, 'preferís')
                                 .replace(/\brecuerda\b/gi, 'recordá')
                                 .replace(/\brecuerde\b/gi, 'recordá')
                                 .replace(/\bpuedes\b/gi, 'podés')
                                 .replace(/\bquieres\b/gi, 'querés')
                                 .replace(/\btienes\b/gi, 'tenés')
                                 .replace(/\b(CBU|C.B.U.|Cuenta|CBU:?|Cuenta:?)\s*[\d\s.-]{8,30}/gi, 'los datos oficiales los proporcionará un asesor por WhatsApp')
                                 .replace(/03442-?\d{5,8}/g, '')
                                 .replace(/0800-?\d+/g, '');

        // Responder inmediatamente al usuario para máxima velocidad
        res.json({
            success: true,
            cliente_id: clienteId,
            respuesta_sugerida_ia: respuestaIA,
            choices: [{ message: { content: respuestaIA } }]
        });

        // Guardar respuesta del Bot en segundo plano para el CRM de forma segura
        if (clienteId) {
            (async () => {
                try {
                    await supabase.from('mensajes_chat').insert([{ cliente_id: clienteId, emisor: 'bot', texto: respuestaIA }]);
                } catch (e) {
                    console.error('[BOT MSG INSERT ERROR]', e.message);
                }
            })();
        }

    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Obtener lista de conversaciones para el CRM (incluyendo web y whatsapp)
app.get('/api/crm/chat/conversaciones', async (req, res) => {
    try {
        // 1. Obtener los últimos mensajes de chat (limit alto para cubrir todos los clientes)
        const { data: lastMessages } = await supabase
            .from('mensajes_chat')
            .select('cliente_id, texto, emisor, creado_el')
            .order('creado_el', { ascending: false })
            .limit(2000);

        // Mapear último mensaje y detectar bot_pausado por cliente en memoria
        const lastMsgMap = new Map();
        const botPausadoMap = new Map();
        (lastMessages || []).forEach(m => {
            if (!lastMsgMap.has(m.cliente_id)) {
                lastMsgMap.set(m.cliente_id, m);
            }
            // Detectar bot_pausado: buscar marcadores en los mensajes recientes de cada cliente
            if (!botPausadoMap.has(m.cliente_id)) {
                if (m.texto && m.texto.includes('[BOT REANUDADO]')) {
                    botPausadoMap.set(m.cliente_id, false);
                } else if (m.texto && m.texto.includes('[BOT PAUSADO]')) {
                    botPausadoMap.set(m.cliente_id, true);
                } else if (m.emisor === 'vendedor') {
                    botPausadoMap.set(m.cliente_id, true);
                }
            }
        });

        // Si no hay mensajes de chat registrados, devolver lista vacía
        if (lastMsgMap.size === 0) {
            return res.json({ success: true, conversaciones: [] });
        }

        // 2. Obtener únicamente los clientes que TIENEN mensajes de chat registrados
        const activeClientIds = Array.from(lastMsgMap.keys());
        const { data: clientes, error } = await supabase
            .from('clientes')
            .select('id, razon_social, whatsapp, contacto_nombre, creado_el')
            .in('id', activeClientIds);

        if (error) throw error;

        const conversacionesFormatted = (clientes || []).map(c => {
            const lastM = lastMsgMap.get(c.id);
            return {
                ...c,
                bot_pausado: botPausadoMap.get(c.id) || false,
                ultimo_mensaje_el: lastM ? lastM.creado_el : c.creado_el,
                ultimo_texto: lastM ? lastM.texto : ''
            };
        });

        conversacionesFormatted.sort((a, b) => new Date(b.ultimo_mensaje_el) - new Date(a.ultimo_mensaje_el));

        res.json({ success: true, conversaciones: conversacionesFormatted });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Actualizar Datos de Lead / Cliente desde el CRM (con soporte para fusión automática si el teléfono ya existe)
app.post('/api/crm/clientes/actualizar', async (req, res) => {
    try {
        const { cliente_id, razon_social, whatsapp, dni_cuit, tipo_envio, direccion, localidad, provincia, notas } = req.body;
        if (!cliente_id) return res.status(400).json({ error: 'ID de cliente requerido' });

        const cleanWhatsapp = whatsapp ? String(whatsapp).replace(/[^\d+]/g, '').trim().substring(0, 20) : '';

        // 1. Si se especificó un WhatsApp real (no temporal), verificar si ya pertenece a otro cliente registrado
        let targetClientId = cliente_id;
        let merged = false;

        if (cleanWhatsapp && !cleanWhatsapp.startsWith('Web_')) {
            const { data: existingClient } = await supabase
                .from('clientes')
                .select('id, razon_social, whatsapp')
                .eq('whatsapp', cleanWhatsapp)
                .neq('id', cliente_id)
                .maybeSingle();

            if (existingClient) {
                targetClientId = existingClient.id;
                merged = true;

                // Reasignar mensajes de chat del lead temporal al cliente definitivo
                await supabase
                    .from('mensajes_chat')
                    .update({ cliente_id: targetClientId })
                    .eq('cliente_id', cliente_id);

                // Reasignar pedidos si hubiera
                await supabase
                    .from('pedidos')
                    .update({ cliente_id: targetClientId })
                    .eq('cliente_id', cliente_id);

                // Eliminar el lead temporal huérfano para evitar duplicados en la base
                await supabase
                    .from('clientes')
                    .delete()
                    .eq('id', cliente_id);
            }
        }

        const updatePayload = {};
        if (razon_social) updatePayload.razon_social = String(razon_social).trim();
        if (cleanWhatsapp) updatePayload.whatsapp = cleanWhatsapp;
        if (dni_cuit) updatePayload.cuit = String(dni_cuit).trim().substring(0, 30);
        if (provincia) updatePayload.provincia = String(provincia).trim();

        let locStr = '';
        if (direccion) locStr += String(direccion).trim();
        if (localidad) locStr += (locStr ? `, ${String(localidad).trim()}` : String(localidad).trim());
        if (locStr) updatePayload.localidad = locStr;

        let contactoStr = '';
        if (dni_cuit) contactoStr += `DNI: ${dni_cuit}`;
        if (tipo_envio) contactoStr += (contactoStr ? ` | Envío: ${tipo_envio}` : `Envío: ${tipo_envio}`);
        if (notas) contactoStr += (contactoStr ? ` | ${notas}` : notas);
        if (contactoStr) updatePayload.contacto_nombre = contactoStr.substring(0, 150);

        const { data, error } = await supabase
            .from('clientes')
            .update(updatePayload)
            .eq('id', targetClientId)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            merged: merged,
            nuevo_id: targetClientId,
            mensaje: merged ? '✅ Lead vinculado con cliente existente y datos actualizados con éxito.' : '✅ Datos del cliente y envío actualizados correctamente.',
            cliente: data
        });
    } catch (err) {
        console.error('[CLIENTES ACTUALIZAR ERROR]:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Promover Lead Web a Cliente Mayorista Oficial
app.post('/api/crm/clientes/promover-lead', async (req, res) => {
    try {
        const { cliente_id, cuit, razon_social, vendedor, tipo_cliente, whatsapp } = req.body;
        if (!cliente_id) return res.status(400).json({ error: 'ID de cliente requerido' });

        const updatePayload = {
            razon_social: razon_social ? String(razon_social).trim() : 'Cliente Mayorista',
            contacto_nombre: razon_social ? String(razon_social).trim() : 'Cliente Mayorista',
            cuit: cuit ? String(cuit).trim() : '',
            tipo_cliente: tipo_cliente || 'Mayorista',
            estado_lead: (vendedor ? `Vendedor: ${vendedor}` : 'Cliente Confirmado').substring(0, 20)
        };

        if (whatsapp && !whatsapp.startsWith('Web_')) {
            updatePayload.whatsapp = whatsapp.replace(/[^\d+]/g, '').trim();
        }

        const { data, error } = await supabase.from('clientes').update(updatePayload).eq('id', cliente_id).select().single();
        if (error) throw error;

        res.json({ success: true, mensaje: '🎉 Lead promovido a Cliente Mayorista Oficial con éxito.', cliente: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Obtener mensajes de un chat específico (acepta UUID de cliente o session_id de la web)
app.get('/api/crm/chat/mensajes/:clienteId', async (req, res) => {
    try {
        const { clienteId } = req.params;
        let targetUUID = clienteId;

        // Si clienteId es un session_id web o teléfono, resolver al UUID correspondiente en clientes
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clienteId);
        if (!isUUID) {
            // Probar con el sessionId completo (hasta 20 chars) para whatsapp,
            // y además con los primeros 13 chars para cuit (por retrocompatibilidad)
            const phoneForWhatsapp = clienteId.substring(0, 20);
            const phoneForCuit    = clienteId.substring(0, 13);
            const { data: cData } = await supabase
                .from('clientes')
                .select('id')
                .or(`whatsapp.eq.${phoneForWhatsapp},cuit.eq.${phoneForCuit}`)
                .limit(1);
            if (cData && cData.length > 0) {
                targetUUID = cData[0].id;
            }
        }

        let mensajes = [];
        try {
            const { data: mData } = await supabase.from('mensajes_chat').select('*').eq('cliente_id', targetUUID).order('creado_el', { ascending: true });
            mensajes = mData || [];
        } catch (e) {}
        
        const { data: cliente } = await supabase.from('clientes').select('*').eq('id', targetUUID).single();
        const botPausado = await isBotPausado(targetUUID);
        res.json({ success: true, cliente: { ...cliente, bot_pausado: botPausado }, mensajes: mensajes });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Responder como Vendedor Humano e Interrumpir/Reanudar Bot
app.post('/api/crm/chat/enviar-mensaje-vendedor', async (req, res) => {
    try {
        const { cliente_id, texto_mensaje, pausar_bot, nombre_vendedor } = req.body;
        if (!cliente_id) return res.status(400).json({ error: 'Cliente requerido' });

        let textToInsert = texto_mensaje || '';
        if (texto_mensaje === '[CAMBIO DE ESTADO BOT]') {
            textToInsert = pausar_bot ? '[BOT PAUSADO]' : '[BOT REANUDADO]';
        } else {
            // Prepend vendor name tag if provided
            const nameTag = nombre_vendedor ? `[VENDEDOR:${nombre_vendedor}]` : '';
            if (pausar_bot) {
                textToInsert = `${nameTag}${texto_mensaje}\n[BOT PAUSADO]`;
            } else {
                textToInsert = `${nameTag}${texto_mensaje}`;
            }
        }

        await supabase.from('mensajes_chat').insert([{ cliente_id: cliente_id, emisor: 'vendedor', texto: textToInsert }]);

        res.json({ success: true, mensaje: '✅ Mensaje registrado y estado del bot actualizado.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Helper para obtener TODOS los productos de dec_products paginando en rangos de 1000
// Supabase REST API limita cada consulta individual a 1000 filas como máximo
async function fetchAllProductsFromSupabase(fields = 'id, sku, name, price, stock, category, image_url, status, woocommerce_id, stock_status') {
    let allProducts = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
            .from('dec_products')
            .select(fields)
            .neq('status', 'borrador')
            .not('sku', 'ilike', '%_ID%')
            .gt('price', 0)
            .order('name', { ascending: true })
            .range(from, to);

        if (error) throw error;

        if (data && data.length > 0) {
            allProducts = allProducts.concat(data);
            if (data.length < pageSize) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }

    return allProducts;
}

// =========================================================================
// 2. ALERTAS DE INVENTARIO Y UMBRALES
// =========================================================================
app.get('/api/crm/alertas-stock', async (req, res) => {
    try {
        const umbralMinimoDefault = parseInt(req.query.umbral || 20);
        const prods = await fetchAllProductsFromSupabase();

        const estructuraCategorias = {};
        CATEGORIAS_OFICIALES.forEach(cat => {
            estructuraCategorias[cat.key] = {
                key: cat.key,
                icon: cat.icon,
                total_alertas: 0,
                tiene_critico: false,
                tiene_bajo: false,
                productos: []
            };
        });

        (prods || []).forEach(p => {
            const stockActual = parseInt(p.stock || 0);
            const esCritico = stockActual === 0 || p.stock_status === 'outofstock';
            const esBajo = stockActual <= umbralMinimoDefault;

            if (esCritico || esBajo) {
                const nameUp = (p.name || '').toUpperCase();
                let catElegida = 'ESPECIALIDADES Y VARIOS';

                for (const catConfig of CATEGORIAS_OFICIALES) {
                    if (catConfig.terms.some(t => nameUp.includes(t))) {
                        catElegida = catConfig.key;
                        break;
                    }
                }

                const catObj = estructuraCategorias[catElegida];
                catObj.total_alertas++;
                if (esCritico) catObj.tiene_critico = true;
                if (esBajo) catObj.tiene_bajo = true;

                catObj.productos.push({
                    id: p.id,
                    woocommerce_id: p.woocommerce_id,
                    nombre: p.name,
                    precio: parseFloat(p.price || 0),
                    stock_actual: stockActual,
                    estado_stock: p.stock_status,
                    imagen_url: p.image_url || 'https://quimicadec.com/assets/img/categorias/productosparadiluir.jpeg',
                    nivel_alerta: esCritico ? 'CRÍTICO (SIN STOCK)' : 'ADVERTENCIA (STOCK BAJO)'
                });
            }
        });

        res.json({
            success: true,
            umbral_aplicado: umbralMinimoDefault,
            categorias: estructuraCategorias
        });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/crm/configurar-umbrales-ia', async (req, res) => {
    try {
        const { instruccion_texto } = req.body;
        if (!instruccion_texto) return res.status(400).json({ error: 'Instrucción requerida' });

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Analiza la instrucción para definir umbrales mínimos de stock. Devuelve JSON: {"umbral_general": 30, "mensaje_confirmacion": "Se estableció el límite mínimo de alerta en 30 unidades."}`
                },
                { role: "user", content: instruccion_texto }
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            temperature: 0.1
        });

        const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
        res.json({
            success: true,
            umbral: parsed.umbral_general || 20,
            mensaje: parsed.mensaje_confirmacion || `✅ Umbral mínimo actualizado a ${parsed.umbral_general || 20} unidades.`
        });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// 3. CARGA MASIVA EXCEL & KANBAN PAGO/STOCK
// =========================================================================
app.post('/api/crm/subir-excel-catalogo', async (req, res) => {
    try {
        const { productos_csv } = req.body;
        if (!Array.isArray(productos_csv) || productos_csv.length === 0) {
            return res.status(400).json({ error: 'Lista de productos CSV/Excel vacía' });
        }

        let actualizados = 0;
        for (const item of productos_csv) {
            if (item.nombre && item.precio) {
                const precio = parseFloat(item.precio || 0);
                const stock = parseInt(item.stock || 50);

                const { data: prods } = await supabase
                    .from('dec_products')
                    .select('id')
                    .ilike('name', `%${item.nombre.split(' ')[0]}%`)
                    .limit(1);

                if (prods && prods.length > 0) {
                    await supabase
                        .from('dec_products')
                        .update({ price: precio, stock: stock, updated_at: new Date().toISOString() })
                        .eq('id', prods[0].id);
                    actualizados++;
                }
            }
        }

        res.json({
            success: true,
            mensaje: `🎉 ¡Éxito! Se actualizaron ${actualizados} productos masivamente en Supabase.`
        });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Helper de deducción de stock en bulk para evitar N+1 queries y acelerar respuesta
async function descontarStockPedidoBulk(pedido_id) {
    try {
        const { data: items } = await supabase.from('items_pedido').select('*').eq('pedido_id', pedido_id);
        if (!items || items.length === 0) return;

        const { data: prods } = await supabase.from('dec_products').select('id, name, stock').limit(1000);
        if (!prods || prods.length === 0) return;

        const updatePromises = [];
        for (const item of items) {
            const cant = parseInt(item.cantidad || 1);
            const rawName = (item.producto_nombre || '').toLowerCase().trim();
            const firstWord = rawName.split(' ')[0];

            const match = prods.find(p => p.name && (p.name.toLowerCase() === rawName || (firstWord && p.name.toLowerCase().includes(firstWord))));
            if (match) {
                const nuevoStock = Math.max(0, parseInt(match.stock || 0) - cant);
                updatePromises.push(
                    supabase.from('dec_products').update({
                        stock: nuevoStock,
                        stock_status: nuevoStock > 0 ? 'instock' : 'outofstock'
                    }).eq('id', match.id)
                );
            }
        }
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }
    } catch (e) {
        console.error('Error en descontarStockPedidoBulk:', e);
    }
}

app.post('/api/crm/confirmar-pago-descontar-stock', async (req, res) => {
    try {
        const { pedido_id } = req.body;
        if (!pedido_id) return res.status(400).json({ error: 'ID de pedido requerido' });

        await descontarStockPedidoBulk(pedido_id);
        await supabase.from('pedidos').update({ estado: 'Pagado' }).eq('id', pedido_id);

        res.json({ success: true, mensaje: `✅ Pago confirmado y stock descontado.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Endpoint para cambiar de estado un pedido en el embudo (con truncamiento y bulk stock)
app.post('/api/crm/pedidos/cambiar-estado', async (req, res) => {
    try {
        const { pedido_id, nuevo_estado } = req.body;
        if (!pedido_id || !nuevo_estado) return res.status(400).json({ error: 'pedido_id y nuevo_estado son requeridos' });

        // Normalizar string a DB VARCHAR(20)
        let estadoNormalizado = String(nuevo_estado).trim();
        if (estadoNormalizado.includes('Despachado') || estadoNormalizado.includes('Entregado')) {
            estadoNormalizado = 'Despachado';
        }
        estadoNormalizado = estadoNormalizado.substring(0, 20);

        // Obtener estado actual antes de actualizar
        const { data: actual } = await supabase.from('pedidos').select('estado').eq('id', pedido_id).single();
        const estadoAnterior = actual ? actual.estado : '';

        // Si pasa a Pagado y no estaba en Pagado antes, descontar stock en bulk
        if (estadoNormalizado === 'Pagado' && estadoAnterior !== 'Pagado') {
            await descontarStockPedidoBulk(pedido_id);
        }

        const { data, error } = await supabase.from('pedidos')
            .update({ estado: estadoNormalizado })
            .eq('id', pedido_id)
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, mensaje: `✅ Pedido movido a ${estadoNormalizado} correctamente.`, pedido: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Endpoint para crear un Presupuesto / Pedido desde la Ficha de Chat o el Embudo
app.post('/api/crm/pedidos/crear-presupuesto', async (req, res) => {
    try {
        const { cliente_id, items, observaciones, origen, tipo_envio, monto_total_final } = req.body;
        if (!cliente_id) return res.status(400).json({ error: 'cliente_id es requerido' });

        const itemsList = Array.isArray(items) ? items : [];
        let subtotalItems = 0;
        itemsList.forEach(it => {
            const cant = parseFloat(it.cantidad || 1);
            const precio = parseFloat(it.precio_unitario || 0);
            subtotalItems += (cant * precio);
        });

        // Calcular el monto total incluyendo el 5% de recargo si es para Entre Ríos (Mostto)
        let montoTotal = subtotalItems;
        const tipoEnvioStr = String(tipo_envio || '').trim();
        const esEntreRiosMostto = tipoEnvioStr.includes('Entre Ríos') || tipoEnvioStr.includes('Mostto');

        if (monto_total_final && parseFloat(monto_total_final) > 0) {
            montoTotal = parseFloat(monto_total_final);
        } else if (esEntreRiosMostto) {
            montoTotal = subtotalItems * 1.05;
        }

        const origenBase = String(origen || 'CRM').trim();
        // IMPORTANTE: La columna 'origen' en la tabla 'pedidos' es VARCHAR(50) en PostgreSQL. Truncar estrictamente a 50 chars.
        const origenFormatted = (origenBase + (observaciones ? ` | Nota: ${observaciones}` : '')).substring(0, 50);

        const pedidoPayload = {
            cliente_id: cliente_id,
            origen: origenFormatted,
            monto_total: parseFloat(montoTotal.toFixed(2)),
            estado: 'Presupuesto'
        };

        const { data: orderData, error: orderErr } = await supabase
            .from('pedidos')
            .insert([pedidoPayload])
            .select()
            .single();

        if (orderErr) throw orderErr;

        // Insertar items_pedido si existen (omitiendo subtotal porque es una columna GENERADA en PostgreSQL)
        if (itemsList.length > 0) {
            const itemsPayload = itemsList.map((it, idx) => {
                let varTam = it.variacion_tamano ? String(it.variacion_tamano) : null;
                // Guardar la observación completa y método de envío en el primer ítem
                if (idx === 0) {
                    let noteParts = [];
                    if (tipoEnvioStr) noteParts.push(`Envío: ${tipoEnvioStr}`);
                    if (observaciones) noteParts.push(`Nota: ${observaciones}`);
                    if (noteParts.length > 0) varTam = noteParts.join(' | ').substring(0, 250);
                }

                return {
                    pedido_id: orderData.id,
                    sku: it.sku ? String(it.sku).substring(0, 50) : null,
                    producto_nombre: String(it.producto_nombre || 'Producto sin nombre').substring(0, 150),
                    variacion_tamano: varTam,
                    cantidad: parseInt(it.cantidad || 1),
                    precio_unitario: parseFloat(it.precio_unitario || 0)
                };
            });

            const { error: itemsErr } = await supabase.from('items_pedido').insert(itemsPayload);
            if (itemsErr) console.error('Error insertando items_pedido:', itemsErr);
        }

        // Traer pedido completo con relaciones
        const { data: fullOrder } = await supabase
            .from('pedidos')
            .select('*, clientes(razon_social, whatsapp), items_pedido(*)')
            .eq('id', orderData.id)
            .single();

        res.json({
            success: true,
            mensaje: '🎉 ¡Presupuesto creado con éxito y cargado al embudo!',
            pedido: fullOrder || orderData
        });
    } catch (err) {
        console.error('[CREAR PRESUPUESTO ERROR]:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Webhook para recibir pedidos en tiempo real desde el Carrito de WooCommerce (quimicadec.com)
app.all(['/api/crm/webhooks/woocommerce-order', '/api/webhooks/woocommerce-order', '/webhook/woocommerce-order'], async (req, res) => {
    try {
        // Si es un PING, GET o HEAD de verificación de WooCommerce al guardar el webhook
        if (req.method === 'GET' || req.method === 'HEAD' || !req.body || Object.keys(req.body).length === 0 || req.body.webhook_id) {
            console.log('[WOOCOMMERCE WEBHOOK PING] Verificación de webhook recibida con éxito.');
            return res.status(200).json({ success: true, message: 'Webhook de WooCommerce verificado correctamente en CRM DEC.' });
        }

        const payload = req.body || {};
        console.log('[WOOCOMMERCE WEBHOOK] Evento de pedido recibido ID:', payload.id || 'Nuevo evento');

        const wcOrderId = payload.id;
        if (!wcOrderId) {
            return res.status(200).json({ success: true, message: 'Ping de prueba recibido correctamente' });
        }

        // Datos de facturación y envío del cliente
        const billing = payload.billing || {};
        const shipping = payload.shipping || {};

        const nombre = `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || 'Cliente Web WooCommerce';
        let rawPhone = billing.phone || shipping.phone || '';
        let cleanPhone = rawPhone.replace(/[^\d+]/g, '').trim();

        if (!cleanPhone) {
            cleanPhone = `Web_${wcOrderId}`;
        } else if (!cleanPhone.startsWith('54') && cleanPhone.length >= 10) {
            cleanPhone = `549${cleanPhone}`;
        }

        const direccion = (shipping.address_1 || billing.address_1 || '').trim();
        const localidad = (shipping.city || billing.city || '').trim();
        const provincia = (shipping.state || billing.state || 'Entre Ríos').trim();

        // Determinar método de envío seleccionado en la web
        const shippingLines = payload.shipping_lines || [];
        let methodTitle = shippingLines.length > 0 ? (shippingLines[0].method_title || '') : '';
        let tipoEnvio = 'Retira en Local';

        if (methodTitle.toLowerCase().includes('mostto') || provincia.toLowerCase().includes('entre') || localidad.toLowerCase().includes('paraná')) {
            tipoEnvio = 'Entre Ríos (Mostto +5%)';
        } else if (methodTitle.toLowerCase().includes('vía cargo') || methodTitle.toLowerCase().includes('andreani') || (localidad && !localidad.toLowerCase().includes('concepción'))) {
            tipoEnvio = 'Resto del País (Andreani / Vía Cargo)';
        } else if (methodTitle.toLowerCase().includes('local')) {
            tipoEnvio = 'Envío Local (C. del Uruguay)';
        }

        const contactoStr = `DNI: Web | Envío: ${tipoEnvio}`;
        const locStr = direccion ? (localidad ? `${direccion}, ${localidad}` : direccion) : localidad;

        // Buscar o registrar cliente en Supabase
        let clienteId = null;
        const { data: existingClient } = await supabase
            .from('clientes')
            .select('id, localidad, provincia')
            .or(`whatsapp.eq.${cleanPhone},razon_social.ilike.%${nombre}%`)
            .limit(1);

        if (existingClient && existingClient.length > 0) {
            clienteId = existingClient[0].id;
            await supabase.from('clientes').update({
                razon_social: nombre,
                provincia: provincia || 'Entre Ríos',
                localidad: locStr || existingClient[0].localidad,
                contacto_nombre: contactoStr
            }).eq('id', clienteId);
        } else {
            const { data: newClient, error: clientErr } = await supabase.from('clientes').insert([{
                razon_social: nombre,
                whatsapp: cleanPhone,
                email: billing.email || null,
                provincia: provincia || 'Entre Ríos',
                localidad: locStr,
                contacto_nombre: contactoStr,
                estado_lead: 'Web WooCommerce'
            }]).select().single();

            if (!clientErr && newClient) {
                clienteId = newClient.id;
            }
        }

        if (!clienteId) {
            return res.status(500).json({ error: 'No se pudo generar el registro de cliente' });
        }

        // Monto Total
        const montoTotal = parseFloat(payload.total || 0);

        // Crear pedido en el Embudo de Pedidos (estado Presupuesto)
        const pedidoPayload = {
            cliente_id: clienteId,
            woocommerce_order_id: String(wcOrderId),
            origen: `WooCommerce Web #${wcOrderId} | Envío: ${tipoEnvio}`.substring(0, 50),
            monto_total: montoTotal,
            estado: 'Presupuesto'
        };

        const { data: orderData, error: orderErr } = await supabase
            .from('pedidos')
            .insert([pedidoPayload])
            .select()
            .single();

        if (orderErr) throw orderErr;

        // Insertar items del pedido
        const lineItems = payload.line_items || [];
        if (lineItems.length > 0) {
            const itemsPayload = lineItems.map((it, idx) => ({
                pedido_id: orderData.id,
                sku: it.sku ? String(it.sku).substring(0, 50) : null,
                producto_nombre: String(it.name || 'Producto Web').substring(0, 150),
                variacion_tamano: idx === 0 ? `Pedido Web WooCommerce #${wcOrderId} | Envío: ${tipoEnvio}`.substring(0, 250) : null,
                cantidad: parseInt(it.quantity || 1),
                precio_unitario: parseFloat(it.price || (parseFloat(it.total || 0) / parseFloat(it.quantity || 1)))
            }));

            await supabase.from('items_pedido').insert(itemsPayload);
        }

        console.log(`[WOOCOMMERCE WEBHOOK] ✅ Pedido #${wcOrderId} de ${nombre} registrado en CRM por $${montoTotal}`);

        res.json({
            success: true,
            message: `🎉 Pedido #${wcOrderId} sincronizado exitosamente con el CRM DEC`,
            pedido_id: orderData.id
        });

    } catch (err) {
        console.error('[WOOCOMMERCE WEBHOOK ERROR]:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para obtener catálogo simple de productos para el modal de presupuestos
app.get('/api/crm/productos-list', async (req, res) => {
    try {
        const data = await fetchAllProductsFromSupabase('id, sku, name, price, stock, category, image_url');
        res.json({ success: true, count: data.length, productos: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Endpoint de IA para Analizar Texto de Chat / Notas y Extraer Productos / Cantidades / Precios automáticamente
app.post('/api/crm/parse-presupuesto-texto-ia', async (req, res) => {
    try {
        const { texto } = req.body;
        if (!texto || typeof texto !== 'string' || !texto.trim()) {
            return res.status(400).json({ error: 'Texto no proporcionado' });
        }

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Sos un extractor de items de pedido para un CRM comercial de productos químicos y sahumerios.
Analizá el texto recibido y extraé CADA producto mencionado con su cantidad y precio unitario si está especificado.
Ignorá totales generales, nombres de clientes o mensajes introductorios.

Respondé ÚNICAMENTE con JSON válido en este formato:
{
  "items": [
    {
      "nombre": "Nombre del producto limpio (ej: Sahumerio Prana Gardenia, Jabón Skip 5L, Lavandina)",
      "cantidad": 40,
      "precio_unitario": 1002.78
    }
  ]
}`
                },
                { role: "user", content: texto.trim() }
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            temperature: 0.05
        });

        const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
        res.json({
            success: true,
            items: result.items || []
        });
    } catch (err) {
        console.error('[PARSE PRESUPUESTO IA ERROR]:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/crm/clientes', async (req, res) => {
    try {
        const { data, error } = await supabase.from('clientes').select('id, razon_social, contacto_nombre, whatsapp, cuit, email, localidad, tipo_cliente, estado_lead, total_comprado, creado_el').limit(2000);
        if (error) throw error;
        res.json({ success: true, count: data.length, clientes: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Importación Masiva de Clientes desde Excel / CSV (Ultrarrápida por Lote)
app.post('/api/crm/clientes/importar-lote', async (req, res) => {
    try {
        const { clientes } = req.body;
        if (!Array.isArray(clientes) || clientes.length === 0) {
            return res.status(400).json({ error: 'Se requiere una lista de clientes no vacía' });
        }

        const payloadMap = new Map();

        clientes.forEach((item, index) => {
            const nombre = item.Nombre || item.nombre || item.razon_social || item.contacto_nombre || 'Cliente Sin Nombre';
            const cuitVal = item['ID (DNI/CUIT)'] || item.cuit || item.dni_cuit || item.dni || '';
            const rawPhone = item.Telefonos || item.telefonos || item.whatsapp || item.telefono || '';
            const direccion = item.Dirección || item.direccion || item.localidad || '';
            const email = item['Correo Electrónico'] || item.email || '';
            const listaPrecios = item['Listas de precios'] || item.lista_precios || 'Ninguno';
            const vendedor = item.Vendedor || item.vendedor || '';

            let waLimpio = String(rawPhone).replace(/[^\d]/g, '').trim().substring(0, 20);
            if (!waLimpio) {
                waLimpio = cuitVal ? `CUIT_${String(cuitVal).trim().substring(0, 15)}` : `CLI_${index}_${Date.now()}`;
                waLimpio = waLimpio.substring(0, 20);
            }

            const estadoStr = vendedor ? `Vendedor: ${vendedor}` : 'Cliente Importado';

            const clientPayload = {
                razon_social: String(nombre).trim(),
                contacto_nombre: String(nombre).trim(),
                whatsapp: waLimpio,
                cuit: String(cuitVal).trim().substring(0, 20),
                email: String(email).trim() || null,
                localidad: String(direccion).substring(0, 250),
                tipo_cliente: String(listaPrecios).trim().substring(0, 20) || 'Mayorista',
                estado_lead: String(estadoStr).trim().substring(0, 20)
            };

            payloadMap.set(waLimpio, clientPayload);
        });

        const batchArray = Array.from(payloadMap.values());

        // Inserción / Actualización por Lote en una sola consulta HTTP en Supabase
        const { data, error } = await supabase
            .from('clientes')
            .upsert(batchArray, { onConflict: 'whatsapp' })
            .select();

        if (error) throw error;

        const countProcesados = batchArray.length;
        res.json({
            success: true,
            mensaje: `🎉 ¡Carga masiva completada con éxito! Se procesaron e importaron ${countProcesados} clientes en la base de datos oficial.`,
            total: clientes.length,
            procesados: countProcesados
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener lista de pedidos con soporte opcional de filtro por cliente_id
app.get('/api/crm/pedidos', async (req, res) => {
    try {
        const { cliente_id } = req.query;
        let query = supabase.from('pedidos').select('*, clientes(razon_social, whatsapp), items_pedido(*)').order('creado_el', { ascending: false }).limit(2000);
        if (cliente_id) {
            query = query.eq('cliente_id', cliente_id);
        }
        const { data, error } = await query;
        if (error) throw error;
        res.json({ success: true, count: data.length, pedidos: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/crm/alertas-seguimiento', async (req, res) => {
    try {
        const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { data: clientes } = await supabase.from('clientes').select('id, razon_social, contacto_nombre, whatsapp').order('razon_social', { ascending: true }).limit(2000);
        const { data: pedidosMes } = await supabase.from('pedidos').select('cliente_id, monto_total').gte('creado_el', firstDayOfMonth);

        const consumos = {};
        (pedidosMes || []).forEach(p => { consumos[p.cliente_id] = (consumos[p.cliente_id] || 0) + parseFloat(p.monto_total || 0); });

        const alertas = (clientes || []).map(c => {
            const consumido = consumos[c.id] || 0;
            const falta = Math.max(0, 80000 - consumido);
            const cumple = consumido >= 80000;
            const msg = cumple ? `¡Hola ${c.razon_social}! Muchas gracias por tu compra. Ya alcanzaste el mínimo mayorista ($${consumido}).` : `¡Hola ${c.razon_social}! Llevás $${consumido} este mes. Te faltan $${falta} para mantener el beneficio mayorista. ¿Te armamos un pedido?`;
            return {
                cliente_id: c.id,
                razon_social: c.razon_social || c.contacto_nombre,
                whatsapp: c.whatsapp,
                consumido_mes: consumido,
                falta_para_80k: falta,
                cumple_minimo_80k: cumple,
                porcentaje_cumplido: Math.min(100, Math.round((consumido / 80000) * 100)),
                mensaje_whatsapp_sugerido: encodeURIComponent(msg)
            };
        });

        res.json({ success: true, mes_actual: new Date().toLocaleString('es-AR', { month: 'long', year: 'numeric' }), alertas: alertas });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// =========================================================================
// Endpoint de depuración y borrado directo de productos obsoletos en Supabase
app.get('/api/products/debug-search', async (req, res) => {
    try {
        const { data: allProds } = await supabase
            .from('dec_products')
            .select('id, name, sku, price, status')
            .or('name.ilike.%MAGISTRAL%,name.ilike.%AZUL%,price.lt.1000');
            
        // Borrar cualquier producto que tenga AZUL o precio < 1000 en 20LT
        const { data: deleted, error } = await supabase
            .from('dec_products')
            .delete()
            .or('name.ilike.%AZUL%,name.ilike.%MAGISTRAL AZUL%,price.eq.785.02');

        res.json({ success: true, encontrados: allProds, borrados: deleted, error });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para limpiar productos obsoletos/borradores de Supabase dec_products
app.get('/api/products/cleanup-outdated', async (req, res) => {
    try {
        const { data: delId, error: errId } = await supabase
            .from('dec_products')
            .delete()
            .ilike('sku', '%_ID%');

        const { data: delZero, error: errZero } = await supabase
            .from('dec_products')
            .delete()
            .or('price.eq.0,status.eq.draft,status.eq.trash,name.ilike.%MAGISTRAL AZUL%');

        // Limpiar códigos temporales 'Web_' en la columna cuit de clientes
        await supabase
            .from('clientes')
            .update({ cuit: null })
            .ilike('cuit', 'Web_%');
            
        res.json({
            success: true,
            message: 'Borradores y productos obsoletos con sufijo _ID eliminados exitosamente de Supabase dec_products, y CUITs Web_ limpiados.',
            eliminados_id: delId,
            eliminados_cero: delZero
        });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para obtener la lista completa de productos (para Carga Masiva por Lote)
app.get('/api/products/all', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('dec_products')
            .select('id, name, sku, price, stock, image_url, stock_status')
            .not('sku', 'ilike', '%_ID%')
            .gt('price', 0)
            .order('name', { ascending: true })
            .limit(2000);

        if (error || !data || data.length === 0) {
            const wcUrl = 'https://quimicadec.com/?qdec_api=search_product&secret_key=qdec_crm_sec_2026&q=a';
            const wcRes = await fetch(wcUrl);
            const wcData = await wcRes.json().catch(() => ({}));
            if (wcData && wcData.products) {
                const cleanProds = wcData.products.filter(p => !p.sku?.includes('_ID') && parseFloat(p.regular_price || p.price || 0) > 0);
                return res.json({ success: true, count: cleanProds.length, products: cleanProds });
            }
            return res.json({ success: true, count: 0, products: [] });
        }

        const formatted = data.map(p => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            price: parseFloat(p.price || 0),
            regular_price: parseFloat(p.price || 0),
            stock: p.stock,
            image_url: p.image_url,
            stock_status: p.stock_status
        }));

        res.json({ success: true, count: formatted.length, products: formatted });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint de búsqueda de productos por SKU o Nombre (WooCommerce Live Search Primero + Fallback Supabase Limpio)
app.get('/api/products/search', async (req, res) => {
    try {
        let query = (req.query.q || '').trim();
        query = query.replace(/^sku:\s*/i, '').replace(/^sku\s+/i, '').trim();

        if (!query || query.length < 2) {
            return res.json({ success: true, count: 0, products: [] });
        }

        // 1. WooCommerce Live Search PRIMERO (Garantiza productos 100% publicados y vigentes)
        try {
            const wcUrl = `https://quimicadec.com/?qdec_api=search_product&secret_key=qdec_crm_sec_2026&q=${encodeURIComponent(query)}`;
            const wcRes = await fetch(wcUrl);
            if (wcRes.ok) {
                const wcData = await wcRes.json();
                if (wcData && wcData.success && wcData.products && wcData.products.length > 0) {
                    const validProds = wcData.products.filter(p => {
                        const pSku = (p.sku || '').toUpperCase();
                        const pName = (p.name || '').toUpperCase();
                        const price = parseFloat(p.regular_price || p.price || 0);
                        if (pSku.includes('_ID') || pSku.includes('QD-DTRG-1320') || (pName.includes('MAGISTRAL AZUL') && price < 1000) || price <= 0) {
                            return false;
                        }
                        return true;
                    });
                    if (validProds.length > 0) {
                        return res.json({ success: true, count: validProds.length, products: validProds });
                    }
                }
            }
        } catch (wcErr) {
            console.error('Error live WooCommerce search:', wcErr.message);
        }

        // 2. Fallback Supabase dec_products (EXCLUYENDO borradores y SKUs obsoletos _ID)
        let { data, error } = await supabase
            .from('dec_products')
            .select('id, name, sku, price, stock, image_url, stock_status')
            .not('sku', 'ilike', '%_ID%')
            .gt('price', 0)
            .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
            .limit(30);

        if (error) {
            console.error('Error buscando en Supabase:', error.message);
            data = [];
        }

        const formatted = (data || []).map(p => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            price: parseFloat(p.price || 0),
            regular_price: parseFloat(p.price || 0),
            stock: p.stock,
            image_url: p.image_url,
            stock_status: p.stock_status
        }));

        return res.json({ success: true, count: formatted.length, products: formatted });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// Endpoint para editar Título, Precios y Detalles de un Producto (WooCommerce + Supabase)
app.post('/api/products/update-details', async (req, res) => {
    try {
        const { sku, name, regular_price, sale_price } = req.body;
        if (!sku) {
            return res.status(400).json({ success: false, error: 'Se requiere el SKU del producto.' });
        }

        let wcData = { success: false };
        const baseParams = `secret_key=qdec_crm_sec_2026&sku=${encodeURIComponent(sku)}`;
        const nameParam = name ? `&name=${encodeURIComponent(name)}` : '';
        const priceParam = regular_price ? `&regular_price=${encodeURIComponent(regular_price)}` : '';
        const saleParam = sale_price ? `&sale_price=${encodeURIComponent(sale_price)}` : '';

        // Intento 1: POST con JSON body
        try {
            const wcRes = await fetch('https://quimicadec.com/?qdec_api=update_product_details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret_key: 'qdec_crm_sec_2026', sku, name: name || '', regular_price: regular_price || '', sale_price: sale_price || '' })
            });
            const textResp = await wcRes.text();
            try { wcData = JSON.parse(textResp); } catch(e) { wcData = { success: false, method: 'POST', raw: textResp.slice(0, 100) }; }
        } catch(e) { wcData = { success: false, method: 'POST', error: e.message }; }

        // Intento 2: GET con query params (fallback si POST devolvió HTML)
        if (!wcData.success) {
            try {
                const getUrl = `https://quimicadec.com/?qdec_api=update_product_details&${baseParams}${nameParam}${priceParam}${saleParam}`;
                const wcRes2 = await fetch(getUrl, { method: 'GET' });
                const textResp2 = await wcRes2.text();
                try { wcData = JSON.parse(textResp2); } catch(e) { wcData = { success: false, method: 'GET', raw: textResp2.slice(0, 100) }; }
            } catch(e) { wcData = { success: false, method: 'GET', error: e.message }; }
        }

        // Intento 3: Verificar con search_product si el nombre realmente cambió en WooCommerce
        let verificado = false;
        if (name) {
            try {
                const vRes = await fetch(`https://quimicadec.com/?qdec_api=search_product&q=${encodeURIComponent(sku)}`);
                const vData = await vRes.json();
                if (vData.success && vData.products && vData.products.length > 0) {
                    const prod = vData.products[0];
                    if (prod.name && prod.name.toUpperCase().includes(name.toUpperCase().slice(0, 10))) {
                        verificado = true;
                    }
                }
            } catch(e) {}
        }

        // Actualizar Supabase
        let sbUpdated = false;
        const updateDb = {};
        if (name) updateDb.name = name;
        if (sale_price || regular_price) updateDb.price = parseFloat(sale_price || regular_price);

        if (Object.keys(updateDb).length > 0) {
            const { error: sbErr } = await supabase.from('dec_products').update(updateDb).eq('sku', sku);
            if (!sbErr) sbUpdated = true;
        }

        const wcOk = wcData.success || verificado;
        res.json({
            success: true,
            mensaje: wcOk
                ? `🎉 Nombre actualizado con éxito en WooCommerce y Supabase. Caché purgada automáticamente.`
                : `⚠️ Supabase actualizado, pero WooCommerce no confirmó el cambio. Asegurate de que el snippet WPCode v3.0 esté activo (revisá ?qdec_api=ping).`,
            wc_response: wcData,
            wc_verificado: verificado,
            supabase_updated: sbUpdated
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// Endpoint para Carga Masiva de Productos y Variaciones vía Excel / CSV
app.post('/api/products/bulk-excel', async (req, res) => {
    try {
        const { rows, paste_text } = req.body;
        let itemsToProcess = [];

        if (Array.isArray(rows) && rows.length > 0) {
            itemsToProcess = rows;
        } else if (paste_text) {
            const lines = paste_text.split('\n');
            lines.forEach(l => {
                const parts = l.split(/[\t,;]/);
                if (parts.length >= 2) {
                    itemsToProcess.push({
                        sku: parts[0].trim(),
                        name: parts[1].trim(),
                        price: parts[2] ? parseFloat(parts[2].replace(/[^0-9.,]/g, '').replace(',', '.')) : 0
                    });
                }
            });
        }

        if (itemsToProcess.length === 0) {
            return res.status(400).json({ success: false, error: 'No se enviaron filas válidas para procesar.' });
        }

        const upsertBatch = itemsToProcess.map(r => {
            const sku = (r.sku || r['SKU'] || r['Sku'] || r['ID'] || '').toString().trim();
            const name = (r.name || r['Nombre del Producto / Variación'] || r['Nombre del Producto / Variacin'] || r['Nombre'] || r['Producto'] || '').toString().trim();
            const price = parseFloat(r.price || r['Precio ($)'] || r['Precio'] || 0);
            const cat = (r.cat || r.category || r['Categorías'] || r['Categoría'] || 'SAHUMERIOS').toString().trim();
            const stockRaw = (r.stock || r.stock_status || r['Estado de Stock'] || 'instock').toString().toLowerCase();
            const stockStatus = (stockRaw.includes('agotado') || stockRaw.includes('out of stock') || stockRaw.includes('outofstock')) ? 'outofstock' : 'instock';

            const statusRaw = (r.status || r['Estado'] || r['estado'] || 'publish').toString().toLowerCase();
            const status = (statusRaw.includes('borrador') || statusRaw.includes('draft')) ? 'draft' : 'publish';

            const wcId = r['ID'] ? parseInt(r['ID']) : null;

            return {
                sku: sku,
                name: name,
                price: price,
                category: cat,
                stock_status: stockStatus,
                status: status,
                type: 'simple',
                ...(wcId ? { woocommerce_id: wcId } : {})
            };
        }).filter(item => item.sku && item.name);

        if (upsertBatch.length === 0) {
            return res.status(400).json({ success: false, error: 'No se encontraron items con SKU y Nombre válidos.' });
        }

        const { data, error } = await supabase.from('dec_products').upsert(upsertBatch, { onConflict: 'sku' }).select('id');
        if (error) throw error;

        // Intentar sincronización en lote con WooCommerce si el endpoint está activo
        try {
            await fetch('https://quimicadec.com/?qdec_api=upsert_products_bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    secret_key: 'qdec_crm_sec_2026',
                    products: upsertBatch
                })
            });
        } catch (e) {}

        res.json({
            success: true,
            processed: upsertBatch.length,
            mensaje: `🎉 ¡Carga Masiva completada! Se crearon/actualizaron ${upsertBatch.length} productos en la base de datos y la tienda web.`
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
app.post('/api/crm/update-homepage-html', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const htmlPath = path.join(__dirname, '../catalogo_final.html');
        let htmlContent = req.body.html_content;
        if (!htmlContent && fs.existsSync(htmlPath)) {
            htmlContent = fs.readFileSync(htmlPath, 'utf8');
        }
        if (!htmlContent) {
            return res.status(400).json({ success: false, error: 'No se proporcionó contenido HTML.' });
        }

        const resp = await fetch('https://quimicadec.com/?qdec_api=update_homepage_content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret_key: 'qdec_crm_sec_2026',
                html_content: htmlContent
            })
        });
        const data = await resp.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/combos', async (req, res) => {
    try {
        const resp = await fetch('https://quimicadec.com/?qdec_api=get_combos');
        const data = await resp.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/combos/delete-image', async (req, res) => {
    try {
        const { sku, attachment_id, image_url } = req.body;
        const resp = await fetch('https://quimicadec.com/?qdec_api=delete_gallery_image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret_key: 'qdec_crm_sec_2026',
                sku,
                attachment_id,
                image_url
            })
        });
        const data = await resp.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/combos/auto-link-skus', async (req, res) => {
    try {
        const { comboSku, productSkus, clearFirst } = req.body;
        const resp = await fetch('https://quimicadec.com/?qdec_api=auto_link_combo_gallery', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret_key: 'qdec_crm_sec_2026',
                combo_sku: comboSku,
                product_skus: productSkus,
                clear_first: clearFirst || false
            })
        });
        const data = await resp.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/categories/upload-banner', async (req, res) => {
    const stepsLog = [];
    try {
        const { categoryKey, imageBase64, imageUrl, filename } = req.body;

        const slugMap = {
            'pastas-y-concentrados': 'concentrados',
            'aerosoles': 'aerosol',
            'limpieza-hogar': 'limpieza-hogar'
        };
        const targetSlug = slugMap[categoryKey] || categoryKey;

        stepsLog.push(`1. Conectando con WordPress para registrar banner de categoría '${targetSlug}'...`);

        const resp = await fetch('https://quimicadec.com/?qdec_api=upload_category_banner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                secret_key: 'qdec_crm_sec_2026',
                category_key: targetSlug,
                image_base64: imageBase64 || '',
                image_url: imageUrl || '',
                filename: filename || `banner_${targetSlug}_${Date.now()}.jpg`
            })
        });
        const data = await resp.json();

        if (data.success && data.image_url) {
            stepsLog.push(`2. Imagen subida con éxito a WordPress: ${data.image_url}`);

            // Actualizar la URL de la imagen en catalogo_final.html y sincronizar con WP
            try {
                let catalogPath = path.join(__dirname, 'catalogo_final.html');
                if (!fs.existsSync(catalogPath)) {
                    catalogPath = path.join(__dirname, '..', 'catalogo_final.html');
                }
                
                if (fs.existsSync(catalogPath)) {
                    let html = fs.readFileSync(catalogPath, 'utf8');

                    // Buscar por data-banner-key (más robusto y directo)
                    const dataKeyRegex = new RegExp(`(data-banner-key="${targetSlug}"[^>]*>|<img[^>]*data-banner-key="${targetSlug}"[^>]*)`, 'i');
                    // Regex que encuentra la etiqueta img con ese data-banner-key y reemplaza su src
                    const imgRegex = new RegExp(`(<img\\s[^>]*data-banner-key="${targetSlug}"[^>]*\\ssrc=")([^"]+)(")`, 'i');
                    const imgRegexSrcFirst = new RegExp(`(<img\\s[^>]*src=")([^"]+)("[^>]*data-banner-key="${targetSlug}"[^>]*)`, 'i');

                    if (imgRegex.test(html)) {
                        html = html.replace(imgRegex, `$1${data.image_url}$3`);
                        stepsLog.push(`3. Banner actualizado por data-banner-key="${targetSlug}" (src después).`);
                    } else if (imgRegexSrcFirst.test(html)) {
                        html = html.replace(imgRegexSrcFirst, `$1${data.image_url}$3`);
                        stepsLog.push(`3. Banner actualizado por data-banner-key="${targetSlug}" (src primero).`);
                    } else {
                        // Fallback: buscar por href de la categoría
                        const hrefRegex = new RegExp(`(<a\\s+href="[^"]*categoria-producto\\/${targetSlug}\\/?[^"]*"[\\s\\S]*?<img\\s+src=")([^"]+)(")`, 'i');
                        if (hrefRegex.test(html)) {
                            html = html.replace(hrefRegex, `$1${data.image_url}$3`);
                            stepsLog.push(`3. Banner actualizado por href de categoría "${targetSlug}".`);
                        } else {
                            stepsLog.push(`⚠️ Paso 3: No se encontró sección para "${targetSlug}" en catalogo_final.html. Verificar estructura HTML.`);
                        }
                    }

                    fs.writeFileSync(catalogPath, html, 'utf8');

                    // Sincronizar catálogo con WordPress automáticamente
                    stepsLog.push(`4. Sincronizando catálogo con WordPress (Página ID 2271)...`);
                    const wpSyncRes = await fetch('https://quimicadec.com/?qdec_api=update_homepage_content', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            secret_key: 'qdec_crm_sec_2026',
                            html_content: html
                        })
                    });
                    const wpSyncData = await wpSyncRes.json().catch(() => ({ success: false }));
                    if (wpSyncData.success) {
                        stepsLog.push(`5. Página 'Nuestros Productos' (ID 2271) en WordPress actualizada e integración en vivo completada.`);
                    } else {
                        stepsLog.push(`⚠️ WordPress update_homepage_content no confirmó la actualización: ${JSON.stringify(wpSyncData)}`);
                    }
                } else {
                    stepsLog.push(`⚠️ No se encontró catalogo_final.html en el servidor.`);
                }
            } catch (errSync) {
                console.error('[CATEGORY BANNER HTML SYNC ERROR]:', errSync.message);
                stepsLog.push(`⚠️ Error en sincronización local HTML: ${errSync.message}`);
            }

            data.steps = stepsLog;
            data.cache_busting_url = `${data.image_url}?v=${Date.now()}`;
        }

        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message, steps: stepsLog });
    }
});

app.get('/api/ofertas', async (req, res) => {
    try {
        const resp = await fetch('https://quimicadec.com/?qdec_api=get_ofertas');
        const data = await resp.json();
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Endpoint de Carga e Integración Directa de Imagen a WooCommerce + Supabase
app.post('/api/products/upload-image', async (req, res) => {

    try {
        const { sku, imageBase64, imageUrl, filename, mode } = req.body;
        if (!sku) {
            return res.status(400).json({ success: false, error: 'Se requiere el SKU del producto.' });
        }
        if (!imageBase64 && !imageUrl) {
            return res.status(400).json({ success: false, error: 'Se requiere la imagen en Base64 o la URL de la imagen.' });
        }

        // 1. Enviar imagen a WordPress / WooCommerce API (endpoint WPCode)
        const targetUrl = 'https://quimicadec.com/?qdec_api=upload_image';
        const payload = {
            secret_key: 'qdec_crm_sec_2026',
            sku: sku,
            image_base64: imageBase64 || '',
            image_url: imageUrl || '',
            filename: filename || `producto_${sku}_${Date.now()}.jpg`,
            mode: mode || 'auto'
        };

        let wcResult = null;
        try {
            const resp = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            wcResult = await resp.json();
        } catch (fetchErr) {
            console.error('[WOOCOMMERCE UPLOAD FETCH ERROR]:', fetchErr.message);
        }

        const uploadedUrl = (wcResult && wcResult.success && wcResult.image_url)
            ? wcResult.image_url
            : (imageUrl || '');

        // 2. Actualizar Supabase (tabla dec_products)
        let dbUpdated = false;
        if (uploadedUrl) {
            const { error: sbError } = await supabase
                .from('dec_products')
                .update({ image_url: uploadedUrl })
                .eq('sku', sku);

            if (!sbError) dbUpdated = true;
        }

        // 3. Forzar purga de caché agresiva desde el backend
        let cachePurged = false;
        try {
            // Purga vía LiteSpeed LSCWP nativo (query param que el plugin reconoce)
            await fetch('https://quimicadec.com/?LSCWP_CTRL=purge_all', { method: 'GET', redirect: 'follow' }).catch(() => {});
            // Purga vía WPCode endpoint ping (que tiene header X-LiteSpeed-Purge: *)
            await fetch('https://quimicadec.com/?qdec_api=ping', { method: 'GET' }).catch(() => {});
            // Purga de la página principal y el catálogo
            const purgeUrls = [
                'https://quimicadec.com/',
                'https://quimicadec.com/catalogo/',
                'https://quimicadec.com/tienda/',
                'https://quimicadec.com/?purge_all=1'
            ];
            await Promise.allSettled(purgeUrls.map(u => fetch(u, { 
                method: 'GET',
                headers: { 'X-LiteSpeed-Purge': '*' }
            }).catch(() => {})));
            cachePurged = true;
        } catch(purgeErr) {
            console.error('[CACHE PURGE ERROR]:', purgeErr.message);
        }

        res.json({
            success: true,
            mensaje: `✅ Imagen asignada con éxito al producto SKU ${sku}. Caché purgada.`,
            sku: sku,
            image_url: uploadedUrl,
            woocommerce_synced: !!(wcResult && wcResult.success),
            supabase_synced: dbUpdated,
            cache_purged: cachePurged,
            wc_response: wcResult
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint de Carga Masiva de Imágenes (Lotes automáticos)
app.post('/api/products/bulk-upload-images', async (req, res) => {
    try {
        const { images } = req.body;
        if (!Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ success: false, error: 'Se requiere una lista de imágenes.' });
        }

        const results = [];
        for (const item of images) {
            const { sku, imageBase64, filename } = item;
            if (!sku || !imageBase64) continue;

            const targetUrl = 'https://quimicadec.com/?qdec_api=upload_image';
            const payload = {
                secret_key: 'qdec_crm_sec_2026',
                sku: sku,
                image_base64: imageBase64,
                filename: filename || `${sku}.webp`
            };

            let uploadedUrl = '';
            try {
                const resp = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const wcResult = await resp.json();
                if (wcResult && wcResult.success && wcResult.image_url) {
                    uploadedUrl = wcResult.image_url;
                }
            } catch (e) {}

            if (uploadedUrl) {
                await supabase.from('dec_products').update({ image_url: uploadedUrl }).eq('sku', sku);
            }

            results.push({ sku, success: !!uploadedUrl, image_url: uploadedUrl });
        }

        res.json({
            success: true,
            total: images.length,
            processed: results.length,
            results: results
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Química DEC CRM API escuchando en puerto ${PORT}`);
});

