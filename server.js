/**
 * QUÍMICA DEC — Backend API del CRM B2B y Cerebro IA de "Dani"
 * ==========================================================
 * Servidor Express con Menús Desplegables de Alertas por Categoría Oficial,
 * Umbrales Mínimos por Voz/IA/Excel, Descuento de Stock, Voseo y CHAT EN VIVO ESTILO KOMMO.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
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

⚠️ REGLA DE ORO DE IDIOMA Y DIALECTO (ESPAÑOL ARGENTINO CON VOSEO ESTRICTO):
- Habla SIEMPRE en Español Argentino Rioplatense natural, cercano, respetuoso y cálido.
- ESTÁ ABSOLUTAMENTE PROHIBIDO usar conjugaciones en neutro como "puedes", "quieres", "tienes", "necesitas", "deseas".
- REEMPLÁZALAS OBLIGATORIAMENTE POR EL VOSEO ARGENTINO: "podés", "querés", "tenés", "necesitás", "ingresá", "fijate", "avisame", "decime".

REGLAS DE NEGOCIO Y POLÍTICAS COMERCIALES:
1. COMPRA MÍNIMA INICIAL: $80.000 para registrarse y activar la cuenta de precios mayoristas por primera vez.
2. CLIENTES ACTIVOS RECURRENTES: $2.500 retiro en local / $50.000 envío a domicilio / $80.000 acumulado mensual.
3. PRECIOS REALES DE BASE DE DATOS: Presenta los precios exactos centavo por centavo de la DB dec_products.
4. ENLACE DE CIERRE WHATSAPP: [Confirmar Pedido por WhatsApp](https://wa.me/5493442586974).
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
// 1. CHAT EN VIVO ESTILO KOMMO: HISTORIAL Y ENVIAR MENSAJES VENDEDOR
// =========================================================================

// Webhook / Proxy del Bot con registro de mensajes
app.post('/api/whatsapp/incoming-ai', async (req, res) => {
    try {
        const { phone, mensaje_texto } = req.body;
        let textoProcesado = mensaje_texto || '';
        const clientePhone = phone || 'WebCustomer';

        // Buscar o crear cliente
        let { data: cliente } = await supabase.from('clientes').select('id, bot_pausado').eq('whatsapp', clientePhone).single();
        if (!cliente) {
            const { data: newC } = await supabase.from('clientes').insert([{ razon_social: `Cliente Web (${clientePhone})`, whatsapp: clientePhone }]).select().single();
            cliente = newC;
        }

        // Guardar mensaje del cliente en el historial
        if (cliente) {
            await supabase.from('mensajes_chat').insert([{ cliente_id: cliente.id, emisor: 'cliente', texto: textoProcesado }]);
        }

        // Si el vendedor pausó el bot para este cliente, la IA no interfiere
        if (cliente && cliente.bot_pausado) {
            return res.json({
                success: true,
                bot_pausado: true,
                respuesta_sugerida_ia: "El bot está pausado. Un vendedor responderá a la brevedad."
            });
        }

        // Extraer intenciones de compra
        let itemsExtraidos = [];
        try {
            const parserCompletion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: `Extrae JSON de productos: {"items": [{"busqueda": "detergente magenta 5l", "cantidad": 5}]}` },
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
        let totalGeneralAcc = 0;

        if (itemsExtraidos.length > 0) {
            const desgloses = [];
            for (const item of itemsExtraidos) {
                const queryStr = (item.busqueda || '').toLowerCase();
                const qty = item.cantidad || 1;
                if (!queryStr) continue;

                const buscaPastaExplicitamente = queryStr.includes('pasta');
                const words = queryStr.split(' ').filter(w => w.length > 2);
                let dbRes = null;

                if (words.length > 0) {
                    const firstWord = words[0];
                    const { data: prods } = await supabase.from('dec_products').select('name, price, stock_status').ilike('name', `%${firstWord}%`).limit(20);
                    if (prods && prods.length > 0) {
                        let candidatos = prods;
                        if (!buscaPastaExplicitamente) {
                            const liquidos = candidatos.filter(p => !p.name.toUpperCase().includes('PASTA'));
                            if (liquidos.length > 0) candidatos = liquidos;
                        }

                        let bestMatch = candidatos[0];
                        if (words.length > 1) {
                            for (let i = 1; i < words.length; i++) {
                                const match = candidatos.find(p => p.name.toLowerCase().includes(words[i]));
                                if (match) { bestMatch = match; break; }
                            }
                        }
                        if (parseFloat(bestMatch.price) === 0) {
                            const conPrecio = candidatos.find(p => parseFloat(p.price) > 0);
                            if (conPrecio) bestMatch = conPrecio;
                        }
                        dbRes = bestMatch;
                    }
                }

                if (dbRes && parseFloat(dbRes.price) > 0) {
                    const price = parseFloat(dbRes.price);
                    const subtotal = price * qty;
                    totalGeneralAcc += subtotal;
                    desgloses.push(`- ${qty}x ${dbRes.name}: $${price.toLocaleString('es-AR')} c/u ➔ Subtotal: $${subtotal.toLocaleString('es-AR')} (Stock: ${dbRes.stock_status === 'instock' ? 'Disponible' : 'Agotado'})`);
                }
            }

            if (desgloses.length > 0) {
                cotizacionCalculada = "\n[COTIZACIÓN MATEMÁTICA EXACTA DB dec_products]:\n" + desgloses.join('\n') + `\nTOTAL GENERAL CALCULADO: $${totalGeneralAcc.toLocaleString('es-AR')}`;
            }
        }

        let contextoCliente = "Cliente Registrado y Activo en Supabase.";
        const promptFinal = `${SYSTEM_PROMPT_DANI}\n[CONTEXTO CLIENTE]: ${contextoCliente}\n${cotizacionCalculada}`;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: promptFinal },
                { role: "user", content: `Mensaje del usuario: "${textoProcesado}"` }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.2
        });

        const respuestaIA = completion.choices[0]?.message?.content || "¡Hola! 😊 ¿En qué te puedo ayudar hoy?";

        // Guardar respuesta del Bot en el historial
        if (cliente) {
            await supabase.from('mensajes_chat').insert([{ cliente_id: cliente.id, emisor: 'bot', texto: respuestaIA }]);
        }

        res.json({
            success: true,
            respuesta_sugerida_ia: respuestaIA
        });

    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Obtener lista de conversaciones estilo Kommo
app.get('/api/crm/chat/conversaciones', async (req, res) => {
    try {
        const { data: clientes } = await supabase.from('clientes').select('id, razon_social, whatsapp, bot_pausado, creado_el').order('creado_el', { ascending: false });
        res.json({ success: true, conversaciones: clientes || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Obtener mensajes de un chat específico
app.get('/api/crm/chat/mensajes/:clienteId', async (req, res) => {
    try {
        const { clienteId } = req.params;
        const { data: mensajes } = await supabase.from('mensajes_chat').select('*').eq('cliente_id', clienteId).order('creado_el', { ascending: true });
        const { data: cliente } = await supabase.from('clientes').select('*').eq('id', clienteId).single();
        res.json({ success: true, cliente: cliente, mensajes: mensajes || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Responder como Vendedor Humano e Interrumpir Bot
app.post('/api/crm/chat/enviar-mensaje-vendedor', async (req, res) => {
    try {
        const { cliente_id, texto_mensaje, pausar_bot } = req.body;
        if (!cliente_id || !texto_mensaje) return res.status(400).json({ error: 'Cliente y mensaje requeridos' });

        // Guardar respuesta del vendedor
        await supabase.from('mensajes_chat').insert([{ cliente_id: cliente_id, emisor: 'vendedor', texto: texto_mensaje }]);

        // Actualizar estado del bot para ese cliente
        if (typeof pausar_bot !== 'undefined') {
            await supabase.from('clientes').update({ bot_pausado: pausar_bot }).eq('id', cliente_id);
        }

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
            .eq('status', 'publish')
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

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/crm/configurar-umbrales-ia', async (req, res) => {
    try {
        const { instruccion_texto } = req.body;
        if (!instruccion_texto) return res.status(400).json({ error: 'Instrucción requerida' });

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Analiza la instrucción para definir umbrales mínimos de stock. Devuelve JSON con el umbral deseado. Ejemplo: {"umbral_general": 30, "mensaje_confirmacion": "Se estableció el límite mínimo de alerta en 30 unidades."}`
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

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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

app.listen(PORT, () => {
    console.log(`🚀 Química DEC CRM API escuchando en puerto ${PORT}`);
});
