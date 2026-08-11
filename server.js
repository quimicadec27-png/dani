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
- Al inicio de la conversación o al consultar precios por primera vez, recordá de forma sutil y amable:
  "Recordá que si sos cliente nuevo y querés activar tu cuenta mayorista, tu primer pedido debe ser de $80.000 o más."
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
- Aerosoles y Desinfectantes: Raid, Lysoform, Fuyi, Off, Perfuminas.
- Pastas Concentradas: Rinden 50 Litros.
- Productos para Diluir (Línea 1+4).
- Combos Emprendedores y Ofertas Semanales.

⚠️ MEDIOS DE PAGO OFICIALES DE QUÍMICA DEC (ESTRICTO - PROHIBIDO INVENTAR OTROS):
- ÚNICAMENTE ACEPTAMOS DOS MEDIOS DE PAGO:
  1. Pago en EFECTIVO (en el local o al retirar).
  2. TRANSFERENCIA BANCARIA.
- Queda ROTUNDAMENTE PROHIBIDO mencionar tarjetas de crédito, tarjetas de débito, Mercado Pago en cuotas o financiación.

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
    'algún', 'tengan', 'hablar', 'contacto', 'producto', 'productos'
];

// Detección e IA Extractor Automático de Datos de Lead (Nombre, Apellido, WhatsApp)
async function autoExtractAndUpdateLead(clienteId, clienteObj, textoUsuario) {
    if (!clienteId || !textoUsuario) return;

    try {
        let extractedNombre = null;
        let extractedWhatsapp = null;

        // 1. Extraer Número de WhatsApp / Teléfono inteligente con Regex (secuencias de 8 a 13 dígitos)
        // Soporta formatos como: 3442 586974, 3442-586974, +5493442586974, 5493442586974, 11 2345 6789, 3442586974
        const phoneRegex = /(?:\+?54\s*9?\s*)?(?:[0-9][\s.-]*){8,13}/g;
        const matches = textoUsuario.match(phoneRegex);
        if (matches && matches.length > 0) {
            for (const matchStr of matches) {
                let rawPhone = matchStr.replace(/[^0-9]/g, '');
                // Verificar que la longitud esté entre 8 y 13 dígitos y no sea una fecha u otro número técnico
                if (rawPhone.length >= 8 && rawPhone.length <= 13) {
                    if (rawPhone.length === 10 && (rawPhone.startsWith('3') || rawPhone.startsWith('11') || rawPhone.startsWith('2') || rawPhone.startsWith('9'))) {
                        rawPhone = '549' + rawPhone;
                    }
                    extractedWhatsapp = rawPhone;
                    break;
                }
            }
        }

        // 2. Extraer Nombre y Apellido real del texto
        // Prefijos explícitos: "me llamo X", "mi nombre es X", "soy X", "me dicen X", "habla X"
        const prefixRegex = /(?:me llamo|mi nombre es|soy|me dicen|habla|saluda)\s+([a-záéíóúñÁÉÍÓÚÑ]{2,}(?:\s+[a-záéíóúñÁÉÍÓÚÑ]{2,}){0,3})/i;
        const pm = textoUsuario.match(prefixRegex);
        if (pm && pm[1]) {
            const cand = pm[1].trim();
            const candWords = cand.toLowerCase().split(/\s+/);
            if (!candWords.some(w => SPANISH_STOP_WORDS.includes(w))) {
                extractedNombre = cand.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            }
        }

        // Si no hay prefijo, buscar si las palabras al inicio son un Nombre legítimo
        if (!extractedNombre) {
            const firstChunk = textoUsuario.split(/[,;\n\.]/)[0].trim();
            if (firstChunk) {
                const words = firstChunk.split(/\s+/);
                if (words.length >= 1 && words.length <= 3) {
                    const isAllLetters = words.every(w => /^[a-záéíóúñÁÉÍÓÚÑ]+$/i.test(w));
                    const hasStopWord = words.some(w => SPANISH_STOP_WORDS.includes(w.toLowerCase()));
                    if (isAllLetters && !hasStopWord) {
                        extractedNombre = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                    }
                }
            }
        }

        // 3. Actualizar en Supabase si se detectó un dato válido
        const updateData = {};
        
        if (extractedNombre) {
            updateData.razon_social = extractedNombre;
            updateData.contacto_nombre = extractedNombre;
        }

        if (extractedWhatsapp) {
            updateData.whatsapp = extractedWhatsapp;
        }

        if (Object.keys(updateData).length > 0) {
            await supabase.from('clientes').update(updateData).eq('id', clienteId);
            console.log(`[AUTO LEAD EXTRACT SUCCESS] Ficha del Lead ${clienteId} actualizada en Supabase:`, updateData);
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
        const { phone, user_id, session_id, mensaje_texto, user_message, message, messages, contents, prompt } = req.body;
        
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
            const shortId = clientePhone.replace('Web_', '').substring(0, 6);
            leadNombre = `Lead Web #${shortId}`;
        }

        // Buscar o registrar cliente en Supabase para que APAREZCA EN EL CRM EN VIVO (Buscando por whatsapp o cuit)
        let { data: cliente } = await supabase
            .from('clientes')
            .select('id, razon_social, whatsapp, cuit')
            .or(`whatsapp.eq.${clientePhone},cuit.eq.${clientePhone}`)
            .single();

        if (!cliente) {
            const { data: newC } = await supabase
                .from('clientes')
                .insert([{ razon_social: leadNombre, whatsapp: clientePhone, cuit: clientePhone }])
                .select()
                .single();
            cliente = newC;
        }

        let clienteId = cliente ? cliente.id : null;
        if (clienteId) {
            try {
                await supabase.from('mensajes_chat').insert([{ cliente_id: clienteId, emisor: 'cliente', texto: textoProcesado }]);
                // Extraer automáticamente Nombre, Apellido y WhatsApp del texto y actualizar ficha del Lead
                await autoExtractAndUpdateLead(clienteId, cliente, textoProcesado);
            } catch (e) { console.error('Error insertando mensaje:', e.message); }
        }

        // VERIFICACIÓN DE INTERVENCIÓN HUMANA: Si el Bot está pausado para este cliente, NO responder vía IA
        if (clienteId) {
            const estaPausado = await isBotPausado(clienteId);
            if (estaPausado) {
                console.log(`[BOT PAUSADO] Cliente ${clienteId} tiene el bot deshabilitado. Se registró el mensaje para el vendedor humano.`);
                return res.json({
                    success: true,
                    bot_pausado: true,
                    respuesta_sugerida_ia: '',
                    choices: [{ message: { content: '' } }]
                });
            }
        }

        // Obtener historial previo desde Supabase (garantiza que si un Vendedor Humano intervino, la IA tenga el contexto completo)
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

        // Cotizador matemático exacto para precios de productos y listas extensas
        let itemsExtraidos = [];
        try {
            const parserCompletion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: "system", 
                        content: `Analizá el mensaje del cliente y extraé un JSON con la lista de productos consultados o pedidos, corrigiendo errores de tipeo y registrando la cantidad pedida si el cliente la menciona.
Ejemplos:
- "quiero 2 alcohol etilico y 5 sahumerio" -> {"items": [{"busqueda": "alcohol etilico", "cantidad": 2}, {"busqueda": "sahumerio", "cantidad": 5}]}
- "cuanto sale el detergente magenta?" -> {"items": [{"busqueda": "detergente magenta", "cantidad": 1}]}
- "3 detergnt magnt, 10 lavandina y 1 desodorant piso" -> {"items": [{"busqueda": "detergente magenta", "cantidad": 3}, {"busqueda": "lavandina", "cantidad": 10}, {"busqueda": "desodorante piso", "cantidad": 1}]}
Devuelve JSON: {"items": [{"busqueda": "string", "cantidad": number}]}` 
                    },
                    { role: "user", content: textoProcesado }
                ],
                model: "llama-3.3-70b-versatile",
                response_format: { type: "json_object" },
                temperature: 0.1
            });
            const parsed = JSON.parse(parserCompletion.choices[0]?.message?.content || '{}');
            itemsExtraidos = parsed.items || [];
        } catch (e) {}

        let cotizacionCalculada = "";
        let desgloses = [];
        let totalGeneralCotizacion = 0;
        let itemsCotizadosCuenta = 0;

        if (itemsExtraidos.length > 0 || textoProcesado.length > 3) {
            const busquedas = itemsExtraidos.length > 0 ? itemsExtraidos : [{ busqueda: textoProcesado, cantidad: 1 }];
            
            for (const itemObj of busquedas) {
                let prods = [];
                let queryStr = (typeof itemObj === 'string' ? itemObj : (itemObj.busqueda || '')).toLowerCase().trim();
                let cantidadDeseada = (typeof itemObj === 'object' && itemObj.cantidad) ? parseInt(itemObj.cantidad) || 1 : 1;
                if (!queryStr) continue;

                // Normalizar faltas de ortografía comunes (saumerio -> sahumerio)
                queryStr = queryStr.replace(/\bsaumerios?\b/g, 'sahumerio')
                                   .replace(/\bsahumerios?\b/g, 'sahumerio');

                const stopWords = ['cuanto', 'sale', 'tenes', 'opciones', 'producto', 'precio', 'este', 'para', 'saber', 'quisiera', 'quiero', 'necesito', 'unidades', 'paquetes', 'cajas'];
                const words = queryStr.split(' ').filter(w => w.length > 2 && !stopWords.includes(w));
                if (words.length === 0) continue;

                // 1. Consultar WooCommerce Live Search PRIMERO (Exclusivamente productos PUBLICADOS)
                try {
                    const wcRes = await fetch(`https://quimicadec.com/?qdec_api=search_product&secret_key=qdec_crm_sec_2026&q=${encodeURIComponent(queryStr)}`);
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
                        .select('name, price, regular_price, stock_status, sku')
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
                                .select('name, price, regular_price, stock_status, sku')
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
                    const rawPrice = parseFloat(bestMatch.price || bestMatch.regular_price || 0);
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
                        prods.slice(1, 3).forEach(otherP => {
                            const pPrice = parseFloat(otherP.price || otherP.regular_price || 0);
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
        const promptInstrucciones = `${SYSTEM_PROMPT_DANI}\n${tieneMensajesAnteriores ? '⚠️ ATENCIÓN CRÍTICA DE CONTINUIDAD DE CHAT:\nEsta conversación YA ESTÁ EN CURSO. Recordá perfectamente lo que se habló antes en el historial. ESTÁ ABSOLUTAMENTE PROHIBIDO SALUDAR DE NUEVO ("¡Hola!", "Hola", "Soy Dani..."). Responde directo y con memoria al último mensaje del usuario.' : ''}\n${cotizacionCalculada}`;


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

        const completion = await groq.chat.completions.create({
            messages: messagesPayload,
            model: "llama-3.3-70b-versatile",
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

        // Guardar respuesta del Bot en el historial para el CRM
        if (clienteId) {
            try {
                await supabase.from('mensajes_chat').insert([{ cliente_id: clienteId, emisor: 'bot', texto: respuestaIA }]);
            } catch (e) {}
        }

        res.json({
            success: true,
            respuesta_sugerida_ia: respuestaIA,
            choices: [{ message: { content: respuestaIA } }]
        });

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

// Actualizar Datos de Lead / Cliente desde el CRM
app.post('/api/crm/clientes/actualizar', async (req, res) => {
    try {
        const { cliente_id, razon_social, whatsapp, dni_cuit, notas } = req.body;
        if (!cliente_id) return res.status(400).json({ error: 'ID de cliente requerido' });

        const updatePayload = {};
        if (razon_social) updatePayload.razon_social = String(razon_social).trim();
        if (whatsapp) updatePayload.whatsapp = String(whatsapp).replace(/[^\d+]/g, '').trim().substring(0, 20);
        
        let contactoStr = '';
        if (dni_cuit) contactoStr += `DNI: ${dni_cuit}`;
        if (notas) contactoStr += (contactoStr ? ` | ${notas}` : notas);
        if (contactoStr) updatePayload.contacto_nombre = contactoStr.substring(0, 150);

        const { data, error } = await supabase.from('clientes').update(updatePayload).eq('id', cliente_id).select().single();
        if (error) throw error;

        res.json({ success: true, mensaje: '✅ Datos del cliente actualizados correctamente en el CRM.', cliente: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
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

        // Si clienteId es un session_id web o teléfono, resolver al UUID correspondiente en clientes (buscando por whatsapp o cuit original)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clienteId);
        if (!isUUID) {
            // Aplicar la misma truncación que incoming-ai (substring 0,20) para que coincida con el whatsapp almacenado
            const truncatedId = clienteId.substring(0, 20);
            const { data: cData } = await supabase
                .from('clientes')
                .select('id')
                .or(`whatsapp.eq.${truncatedId},cuit.eq.${truncatedId}`)
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

// =========================================================================
// 2. ALERTAS DE INVENTARIO Y UMBRALES
// =========================================================================
app.get('/api/crm/alertas-stock', async (req, res) => {
    try {
        const umbralMinimoDefault = parseInt(req.query.umbral || 20);

        const { data: prods, error } = await supabase
            .from('dec_products')
            .select('id, woocommerce_id, name, price, stock, stock_status, category, image_url')
            .neq('status', 'borrador')
            .order('name', { ascending: true })
            .limit(1000);

        if (error) throw error;

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
        const { cliente_id, items, observaciones, origen } = req.body;
        if (!cliente_id) return res.status(400).json({ error: 'cliente_id es requerido' });

        const itemsList = Array.isArray(items) ? items : [];
        let montoTotal = 0;
        itemsList.forEach(it => {
            const cant = parseFloat(it.cantidad || 1);
            const precio = parseFloat(it.precio_unitario || 0);
            montoTotal += (cant * precio);
        });

        const origenBase = String(origen || 'CRM').trim();
        // IMPORTANTE: La columna 'origen' en la tabla 'pedidos' es VARCHAR(50) en PostgreSQL. Truncar estrictamente a 50 chars.
        const origenFormatted = (origenBase + (observaciones ? ` | Nota: ${observaciones}` : '')).substring(0, 50);

        const pedidoPayload = {
            cliente_id: cliente_id,
            origen: origenFormatted,
            monto_total: montoTotal,
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
                // Guardar la observación completa en la variacion del primer ítem para no perder caracteres por la restricción VARCHAR(50) de origen
                if (idx === 0 && observaciones) {
                    varTam = `Nota: ${observaciones}`.substring(0, 250);
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Endpoint para obtener catálogo simple de productos para el modal de presupuestos
app.get('/api/crm/productos-list', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('dec_products')
            .select('id, sku, name, price, stock, category, image_url')
            .order('name', { ascending: true })
            .limit(1000);
        if (error) throw error;
        res.json({ success: true, count: data.length, productos: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
            .select('id, name, sku, price, regular_price, status')
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
        const { data, error } = await supabase
            .from('dec_products')
            .delete()
            .or('name.ilike.%MAGISTRAL AZUL%,price.eq.785.02,status.eq.draft,status.eq.trash');
            
        res.json({ success: true, message: 'Borradores y productos obsoletos eliminados de Supabase dec_products', data, error });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para obtener la lista completa de productos (para Carga Masiva por Lote)
app.get('/api/products/all', async (req, res) => {

    try {
        let { data, error } = await supabase
            .from('dec_products')
            .select('id, name, sku, price, stock, image_url, stock_status')
            .order('name', { ascending: true })
            .limit(2000);

        if (error || !data || data.length === 0) {
            const wcUrl = 'https://quimicadec.com/?qdec_api=search_product&secret_key=qdec_crm_sec_2026&q=a';
            const wcRes = await fetch(wcUrl);
            const wcData = await wcRes.json().catch(() => ({}));
            if (wcData && wcData.products) {
                return res.json({ success: true, count: wcData.products.length, products: wcData.products });
            }
            return res.json({ success: true, count: 0, products: [] });
        }

        const formatted = data.map(p => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            price: p.price || 0,
            regular_price: p.price || 0,
            stock: p.stock,
            image_url: p.image_url,
            stock_status: p.stock_status
        }));

        res.json({ success: true, count: formatted.length, products: formatted });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint de búsqueda de productos por SKU o Nombre (Supabase + Fallback WooCommerce)
app.get('/api/products/search', async (req, res) => {

    try {
        let query = (req.query.q || '').trim();
        // Limpiar prefijos habituales como "SKU: ", "sku: ", "sku "
        query = query.replace(/^sku:\s*/i, '').replace(/^sku\s+/i, '').trim();

        if (!query || query.length < 2) {
            return res.json({ success: true, count: 0, products: [] });
        }

        // 1. Consultar Supabase dec_products (columna es price, no regular_price)
        let { data, error } = await supabase
            .from('dec_products')
            .select('id, name, sku, price, stock, image_url, stock_status')
            .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
            .limit(30);

        if (error) {
            console.error('Error buscando en Supabase:', error.message);
            data = [];
        }

        // Si Supabase trajo resultados, responder formateando regular_price
        if (data && data.length > 0) {
            const formatted = data.map(p => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                price: p.price || 0,
                regular_price: p.price || 0,
                stock: p.stock,
                image_url: p.image_url,
                stock_status: p.stock_status
            }));
            return res.json({ success: true, count: formatted.length, products: formatted });
        }

        // 2. Fallback: Consultar directamente WooCommerce si no está en Supabase
        try {
            const wcUrl = `https://quimicadec.com/?qdec_api=search_product&secret_key=qdec_crm_sec_2026&q=${encodeURIComponent(query)}`;
            const wcRes = await fetch(wcUrl);
            if (wcRes.ok) {
                const wcData = await wcRes.json();
                if (wcData && wcData.success && wcData.products && wcData.products.length > 0) {
                    return res.json({ success: true, count: wcData.products.length, products: wcData.products });
                }
            }
        } catch (wcErr) {
            console.error('Error fallback WooCommerce search:', wcErr.message);
        }

        res.json({ success: true, count: 0, products: [] });

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
        if (regular_price) updateDb.regular_price = parseFloat(regular_price);
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

