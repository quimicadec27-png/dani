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
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Seguridad y Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Inicialización de Clientes
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
});
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// System Prompt Oficial de "Dani"
const SYSTEM_PROMPT_DANI = `
Eres "Dani", el asistente virtual oficial de Química DEC (Concepción del Uruguay, Entre Ríos).
Hablas en primera persona como representante oficial ("en Química DEC nos dedicamos", "ofrecemos", "nuestro local").

⚠️ REGLA DE ORO DE DIALECTO Y VOSEO ARGENTINO RIOPLATENSE ESTRICTO:
- Habla SIEMPRE en Español Argentino Rioplatense natural, cercano, respetuoso y cálido.
- ESTÁ ROTUNDAMENTE PROHIBIDO USAR LA PALABRA "Che" O "Che,". Es demasiado informal con los clientes. Saluda siempre con "¡Hola! ¿Cómo estás?", "¡Hola! Decime...", etc., tuteando con voseo pero NUNCA usando "Che".
- ESTÁ ABSOLUTAMENTE PROHIBIDO usar conjugaciones en neutro o latino como:
  * "recuerda" / "recuerde" ➔ DEBES USAR OBLIGATORIAMENTE "recordá".
  * "puedes" ➔ DEBES USAR OBLIGATORIAMENTE "podés".
  * "quieres" ➔ DEBES USAR OBLIGATORIAMENTE "querés".
  * "tienes" ➔ DEBES USAR OBLIGATORIAMENTE "tenés".
  * "necesitas" ➔ DEBES USAR OBLIGATORIAMENTE "necesitás".

⚠️ REGLA DE COMUNICACIÓN COMERCIAL (PROHIBIDO MENCIONAR BASES DE DATOS):
- ESTÁ PROHIBIDO MENCIONAR A UN CLIENTE PALABRAS TÉCNICAS COMO "base de datos", "dec_products", "nuestra DB" O "sistema".
- Si el cliente te ofrece pasarte una lista de productos, responde de forma humana y comercial: "¡Claro que sí! Pasame la lista de productos que necesitás y te paso los precios actualizados al instante."

⚠️ REGLA DE PRECIOS E INVENTARIO (CERO ALUCINACIONES):
- USA ÚNICAMENTE Y EXCLUSIVAMENTE LOS PRECIOS Y PRESENTACIONES REALES INYECTADAS EN EL SECTOR [DATOS REALES Y PRECIOS EXACTOS DE NUESTRO CATÁLOGO].
- ESTÁ PROHIBIDO INVENTAR O CALCULAR CUALQUIER PRECIO NO LISTADO (COMO $2.350 O CUALQUIER OTRO). SI UN PRODUCTO O PRESENTACIÓN NO CONSTA EN LOS DATOS REALES, MENCIONÁ LAS OPCIONES OFICIALES DISPONIBLES O INVITALOS A HABLAR CON UN REPRESENTANTE DE VENTAS POR WHATSAPP.

⚠️ REGLAS COMERCIALES EXACTAS DE CLIENTE MAYORISTA EN QUÍMICA DEC:
1. REGISTRO E INICIO MAYORISTA: Para registrarse y activar la cuenta con precios mayoristas por primera vez, el cliente debe realizar una COMPRA MÍNIMA INICIAL de $80.000.
2. MANTENIMIENTO MES A MES: Para mantener los precios mayoristas en los meses siguientes, el cliente debe acumular compras totales de $80.000 o más en el transcurso del mes (puede realizar compras más pequeñas durante el mes, siempre que el acumulado del mes llegue a $80.000 o más).
3. ENVÍOS A DOMICILIO (Concepción del Uruguay): Mínimo de $50.000 por pedido.
4. RETIROS EN LOCAL: A partir de $2.500 por pedido.

⚠️ REGLA DE CONTINUIDAD DE CONVERSACIÓN (NO REPETIR SALUDOS):
- SI EN EL HISTORIAL DE MENSAJES YA HUBO UN SALUDO O CONVERSACIÓN PREVIA, ESTÁ PROHIBIDO VOLVER A DECIR "¡Hola!", "Hola" O PRESENTARTE DE NUEVO ("Soy Dani...").
- RESPONDE DIRECTAMENTE Y CON FLUIDEZ A LO QUE EL CLIENTE ACABA DE PREGUNTAR.
`;

// Health Check API
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        service: 'Química DEC CRM, Chat en Vivo & IA API',
        timestamp: new Date().toISOString(),
        supabase: 'connected'
    });
});

// Auto Ping Interno de Render cada 10 Minutos para evitar suspensiones
setInterval(() => {
    const targetUrl = 'https://crm.quimicadec.com/health';
    https.get(targetUrl, (res) => {
        console.log(`[KEEP-ALIVE PING] Auto-ping enviado a ${targetUrl} - Status: ${res.statusCode}`);
    }).on('error', (err) => {
        console.log(`[KEEP-ALIVE PING ERROR]: ${err.message}`);
    });
}, 10 * 60 * 1000);

// Categorías Oficiales Estructuradas de Química DEC
const CATEGORIAS_OFICIALES = [
    { key: 'PRODUCTOS LÍQUIDOS', icon: 'water_drop', terms: ['LIQUIDO', 'LÍQUIDO', 'JABON', 'JABÓN', 'SUAVIZANTE', 'DETERGENTE', 'DESODORANTE', 'LIMPIADOR'] },
    { key: 'PRODUCTOS PARA DILUIR', icon: 'opacity', terms: ['DILUIR', 'CONCENTRADO 1+4'] },
    { key: 'PASTAS Y CONCENTRADOS', icon: 'science', terms: ['PASTA'] },
    { key: 'JABÓN EN POLVO Y PAN', icon: 'grain', terms: ['POLVO', 'PAN'] },
    { key: 'AEROSOLES Y PERFUMERÍA', icon: 'air', terms: ['AEROSOL', 'PERFUMINA', 'AROMATIZADOR', 'SAHUMERIO'] },
    { key: 'DESINFECTANTES Y REPELENTES', icon: 'sanitizer', terms: ['LAVANDINA', 'CLORO', 'DESINFECTANTE', 'REPELENTE', 'INSECTICIDA', 'RAID', 'FUYI', 'OFF'] },
    { key: 'ACCESORIOS Y HERRAMIENTAS', icon: 'cleaning_services', terms: ['ESPONJA', 'ESCOBILLON', 'ESCOBILLÓN', 'CEPILLO', 'SECADOR', 'CABO', 'BURLETE', 'GUANTE'] },
    { key: 'ENVASES Y BOLSAS', icon: 'inventory_2', terms: ['ENVASE', 'BOLSA', 'BIDON', 'BIDÓN', 'BOTELLA'] },
    { key: 'ESPECIALIDADES Y VARIOS', icon: 'grid_view', terms: [] }
];

// =========================================================================
// 1. CHAT EN VIVO: SINCRONIZACIÓN FLUIDA WEB + WHATSAPP Y CRM
// =========================================================================

app.post('/api/whatsapp/incoming-ai', async (req, res) => {
    try {
        const { phone, user_id, session_id, mensaje_texto, user_message, message } = req.body;
        const textoProcesado = (mensaje_texto || user_message || message || '').trim();
        const clientePhone = (phone || user_id || session_id || 'Cliente Web').toString();

        if (!textoProcesado) return res.status(400).json({ error: 'Mensaje vacío' });

        // Generar nombre de Lead limpio para visitas web
        let leadNombre = `Cliente Web (${clientePhone.substring(0, 12)})`;
        if (clientePhone.startsWith('Web_')) {
            const shortId = clientePhone.replace('Web_', '').substring(0, 6);
            leadNombre = `Lead Web #${shortId}`;
        }

        // Buscar o registrar cliente en Supabase para que APAREZCA EN EL CRM EN VIVO
        let { data: cliente } = await supabase.from('clientes').select('id, razon_social, whatsapp').eq('whatsapp', clientePhone).single();
        if (!cliente) {
            const { data: newC } = await supabase.from('clientes').insert([{ razon_social: leadNombre, whatsapp: clientePhone }]).select().single();
            cliente = newC;
        }

        let clienteId = cliente ? cliente.id : null;
        if (clienteId) {
            try {
                await supabase.from('mensajes_chat').insert([{ cliente_id: clienteId, emisor: 'cliente', texto: textoProcesado }]);
            } catch (e) { console.error('Error insertando mensaje:', e.message); }
        }

        // Obtener historial previo (priorizando el historial enviado por la web o consultando Supabase)
        let historialPrevio = [];
        if (req.body.messages && Array.isArray(req.body.messages) && req.body.messages.length > 0) {
            historialPrevio = req.body.messages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .slice(-10)
                .map(m => ({ role: m.role, content: m.content }));
        } else if (clienteId) {
            try {
                const { data: ultimosMsgs } = await supabase
                    .from('mensajes_chat')
                    .select('emisor, texto')
                    .eq('cliente_id', clienteId)
                    .order('creado_el', { ascending: false })
                    .limit(10);

                if (ultimosMsgs && ultimosMsgs.length > 0) {
                    historialPrevio = ultimosMsgs.reverse().map(m => ({
                        role: m.emisor === 'cliente' ? 'user' : 'assistant',
                        content: m.texto
                    }));
                }
            } catch (e) {}
        }

        // Cotizador matemático exacto para precios de productos
        let itemsExtraidos = [];
        try {
            const parserCompletion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: `Extrae JSON de palabras clave de productos buscados: {"items": ["detergente magenta", "alcohol etilico"]}` },
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

        if (itemsExtraidos.length > 0 || textoProcesado.length > 3) {
            const busquedas = itemsExtraidos.length > 0 ? itemsExtraidos : [textoProcesado];
            
            for (const queryItem of busquedas) {
                const queryStr = (typeof queryItem === 'string' ? queryItem : (queryItem.busqueda || '')).toLowerCase();
                if (!queryStr) continue;

                const stopWords = ['cuanto', 'sale', 'tenes', 'opciones', 'producto', 'precio', 'este', 'para', 'saber', 'quisiera'];
                const words = queryStr.split(' ').filter(w => w.length > 2 && !stopWords.includes(w));
                if (words.length === 0) continue;

                // Consulta flexible multi-palabra en Supabase
                let queryBuilder = supabase
                    .from('dec_products')
                    .select('name, price, stock_status')
                    .gt('price', 0)
                    .in('status', ['publicado', 'publish']);

                for (const w of words) {
                    queryBuilder = queryBuilder.ilike('name', `%${w}%`);
                }

                let { data: prods } = await queryBuilder.order('price', { ascending: true }).limit(20);

                // Fallback: si no matchea con todas las palabras juntas, probar con la palabra clave más larga
                if (!prods || prods.length === 0) {
                    const sortedWords = words.sort((a,b) => b.length - a.length);
                    const longestWord = sortedWords[0];
                    if (longestWord && longestWord.length > 3) {
                        const { data: fallbackProds } = await supabase
                            .from('dec_products')
                            .select('name, price, stock_status')
                            .gt('price', 0)
                            .in('status', ['publicado', 'publish'])
                            .ilike('name', `%${longestWord}%`)
                            .order('price', { ascending: true })
                            .limit(15);
                        prods = fallbackProds;
                    }
                }

                if (prods && prods.length > 0) {
                    prods.forEach(p => {
                        const price = parseFloat(p.price);
                        const descLine = `- ${p.name}: $${price.toLocaleString('es-AR')} (Stock: ${p.stock_status === 'instock' ? 'Disponible' : 'Agotado'})`;
                        if (!desgloses.includes(descLine)) {
                            desgloses.push(descLine);
                        }
                    });
                }
            }

            if (desgloses.length > 0) {
                cotizacionCalculada = "\n[DATOS REALES DE PRODUCTOS PUBLICADOS Y PRECIOS OFICIALES EN NUESTRO CATÁLOGO]:\n" + desgloses.join('\n') + "\n⚠️ INSTRUCCIÓN OBLIGATORIA DE PRECIOS: Mencioná ÚNICAMENTE los productos y precios oficiales listados arriba. ESTÁ ABSOLUTAMENTE PROHIBIDO decir que no tenemos un producto si está en la lista anterior, y está prohibido inventar cualquier otro valor.";
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
        
        // Filtro de seguridad contra "Che", menciones de base de datos y dialecto neutro
        respuestaIA = respuestaIA.replace(/\bche,?\s*/gi, '')
                                 .replace(/base de datos dec_products/gi, 'nuestro catálogo')
                                 .replace(/base de datos/gi, 'nuestro catálogo')
                                 .replace(/\brecuerda\b/gi, 'recordá')
                                 .replace(/\brecuerde\b/gi, 'recordá')
                                 .replace(/\bpuedes\b/gi, 'podés')
                                 .replace(/\bquieres\b/gi, 'querés')
                                 .replace(/\btienes\b/gi, 'tenés');

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
        const { data: clientes, error } = await supabase
            .from('clientes')
            .select('id, razon_social, whatsapp, contacto_nombre, creado_el')
            .order('creado_el', { ascending: false });

        if (error) throw error;
        
        // Para cada cliente, obtener la fecha de su último mensaje y conteo
        const conversacionesFormatted = await Promise.all((clientes || []).map(async (c) => {
            let ultimoMsgFecha = c.creado_el;
            let ultimoTexto = '';
            try {
                const { data: lastM } = await supabase
                    .from('mensajes_chat')
                    .select('texto, creado_el')
                    .eq('cliente_id', c.id)
                    .order('creado_el', { ascending: false })
                    .limit(1);
                
                if (lastM && lastM.length > 0) {
                    ultimoMsgFecha = lastM[0].creado_el;
                    ultimoTexto = lastM[0].texto;
                }
            } catch (e) {}

            return {
                ...c,
                bot_pausado: false,
                ultimo_mensaje_el: ultimoMsgFecha,
                ultimo_texto: ultimoTexto
            };
        }));

        // Ordenar por fecha del último mensaje descendente
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
        if (razon_social) updatePayload.razon_social = razon_social;
        if (whatsapp) updatePayload.whatsapp = whatsapp;
        if (dni_cuit) updatePayload.contacto_nombre = `DNI: ${dni_cuit}`;
        if (notas) updatePayload.observaciones = notas;

        const { data, error } = await supabase.from('clientes').update(updatePayload).eq('id', cliente_id).select().single();
        if (error) throw error;

        res.json({ success: true, mensaje: '✅ Datos del cliente actualizados correctamente en el CRM.', cliente: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Obtener mensajes de un chat específico
app.get('/api/crm/chat/mensajes/:clienteId', async (req, res) => {
    try {
        const { clienteId } = req.params;
        let mensajes = [];
        try {
            const { data: mData } = await supabase.from('mensajes_chat').select('*').eq('cliente_id', clienteId).order('creado_el', { ascending: true });
            mensajes = mData || [];
        } catch (e) {}
        
        const { data: cliente } = await supabase.from('clientes').select('*').eq('id', clienteId).single();
        res.json({ success: true, cliente: cliente, mensajes: mensajes });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Responder como Vendedor Humano e Interrumpir Bot
app.post('/api/crm/chat/enviar-mensaje-vendedor', async (req, res) => {
    try {
        const { cliente_id, texto_mensaje, pausar_bot } = req.body;
        if (!cliente_id || !texto_mensaje) return res.status(400).json({ error: 'Cliente y mensaje requeridos' });

        await supabase.from('mensajes_chat').insert([{ cliente_id: cliente_id, emisor: 'vendedor', texto: texto_mensaje }]);

        res.json({ success: true, mensaje: '✅ Mensaje enviado y registrado en la conversación.' });
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

app.post('/api/crm/confirmar-pago-descontar-stock', async (req, res) => {
    try {
        const { pedido_id } = req.body;
        const { data: pedido } = await supabase.from('pedidos').select('*, items_pedido(*)').eq('id', pedido_id).single();
        if (!pedido) throw new Error('Pedido no encontrado');

        const items = pedido.items_pedido || [];
        for (const item of items) {
            const cant = parseInt(item.cantidad || 1);
            const { data: prods } = await supabase.from('dec_products').select('id, stock').ilike('name', `%${(item.producto_nombre || '').split(' ')[0]}%`).limit(1);
            if (prods && prods.length > 0) {
                const nuevoStock = Math.max(0, parseInt(prods[0].stock || 0) - cant);
                await supabase.from('dec_products').update({ stock: nuevoStock, stock_status: nuevoStock > 0 ? 'instock' : 'outofstock' }).eq('id', prods[0].id);
            }
        }

        await supabase.from('pedidos').update({ estado: 'Pagado' }).eq('id', pedido_id);
        res.json({ success: true, mensaje: `✅ Pago confirmado y stock descontado.` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/crm/clientes', async (req, res) => {
    try {
        const { data, error } = await supabase.from('clientes').select('*, pedidos(count)').order('creado_el', { ascending: false });
        if (error) throw error;
        res.json({ success: true, count: data.length, clientes: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/crm/pedidos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('pedidos').select('*, clientes(razon_social, whatsapp), items_pedido(*)').order('creado_el', { ascending: false });
        if (error) throw error;
        res.json({ success: true, count: data.length, pedidos: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/crm/alertas-seguimiento', async (req, res) => {
    try {
        const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { data: clientes } = await supabase.from('clientes').select('*').order('razon_social', { ascending: true });
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
// BÚSQUEDA Y CARGA DIRECTA DE IMÁGENES A WOOCOMMERCE & SUPABASE
// =========================================================================

// Endpoint de búsqueda de productos por SKU o Nombre (Supabase + Fallback WooCommerce)
app.get('/api/products/search', async (req, res) => {
    try {
        let query = (req.query.q || '').trim();
        // Limpiar prefijos habituales como "SKU: ", "sku: ", "sku "
        query = query.replace(/^sku:\s*/i, '').replace(/^sku\s+/i, '').trim();

        if (!query || query.length < 2) {
            return res.json({ success: true, count: 0, products: [] });
        }

        // 1. Consultar Supabase dec_products
        let { data, error } = await supabase
            .from('dec_products')
            .select('id, name, sku, regular_price, stock, image_url, stock_status')
            .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
            .limit(20);

        if (error) {
            console.error('Error buscando en Supabase:', error.message);
            data = [];
        }

        // Si Supabase trajo resultados, responder
        if (data && data.length > 0) {
            return res.json({ success: true, count: data.length, products: data });
        }

        // 2. Fallback: Consultar directamente WooCommerce si no está en Supabase
        try {
            const wcUrl = `https://quimicadec.com/?qdec_api=search_product&q=${encodeURIComponent(query)}`;
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


// Endpoint de Carga e Integración Directa de Imagen a WooCommerce + Supabase
app.post('/api/products/upload-image', async (req, res) => {
    try {
        const { sku, imageBase64, imageUrl, filename } = req.body;
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
            filename: filename || `producto_${sku}_${Date.now()}.jpg`
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

        res.json({
            success: true,
            mensaje: `✅ Imagen asignada con éxito al producto SKU ${sku}.`,
            sku: sku,
            image_url: uploadedUrl,
            woocommerce_synced: !!(wcResult && wcResult.success),
            supabase_synced: dbUpdated,
            wc_response: wcResult
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Química DEC CRM API escuchando en puerto ${PORT}`);
});

