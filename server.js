/**
 * QUÍMICA DEC — Backend API del CRM B2B y Cerebro IA de "Dani"
 * ==========================================================
 * Servidor Express con Gestión de Inventario, Descuento de Stock en Pagos,
 * Alertas de Stock Bajo Configurables, Actualización Masiva/IA y Carga de Fotos.
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
app.use(express.json({ limit: '10mb' }));
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
        service: 'Química DEC CRM, Inventario & IA API',
        timestamp: new Date().toISOString(),
        supabase: 'connected'
    });
});

// =========================================================================
// 1. GESTIÓN DE PEDIDOS Y DESCUENTO AUTOMÁTICO DE STOCK AL PAGAR
// =========================================================================
app.post('/api/crm/confirmar-pago-descontar-stock', async (req, res) => {
    try {
        const { pedido_id } = req.body;
        if (!pedido_id) return res.status(400).json({ error: 'Falta pedido_id' });

        // 1. Obtener pedido e ítems
        const { data: pedido, error: pErr } = await supabase
            .from('pedidos')
            .select('*, items_pedido(*)')
            .eq('id', pedido_id)
            .single();

        if (pErr || !pedido) throw new Error('Pedido no encontrado');

        // 2. Descontar stock para cada ítem en dec_products (Supabase)
        const items = pedido.items_pedido || [];
        const resultadosDescuento = [];

        for (const item of items) {
            const cant = parseInt(item.cantidad || 1);
            let prodName = item.producto_nombre || '';

            // Buscar producto por nombre o SKU
            const { data: prods } = await supabase
                .from('dec_products')
                .select('id, name, stock, stock_status')
                .ilike('name', `%${prodName.split(' ')[0]}%`)
                .limit(1);

            if (prods && prods.length > 0) {
                const prod = prods[0];
                const stockActual = parseInt(prod.stock || 0);
                const nuevoStock = Math.max(0, stockActual - cant);
                const nuevoEstadoStock = nuevoStock > 0 ? 'instock' : 'outofstock';

                await supabase
                    .from('dec_products')
                    .update({ 
                        stock: nuevoStock, 
                        stock_status: nuevoEstadoStock,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', prod.id);

                resultadosDescuento.push({
                    producto: prod.name,
                    cant_descontada: cant,
                    stock_anterior: stockActual,
                    stock_nuevo: nuevoStock
                });
            }
        }

        // 3. Cambiar estado del pedido a 'Pagado'
        await supabase
            .from('pedidos')
            .update({ estado: 'Pagado' })
            .eq('id', pedido_id);

        res.json({
            success: true,
            mensaje: `✅ Pago confirmado para el pedido #${pedido.woocommerce_order_id || pedido.id} y stock descontado en tiempo real.`,
            descuentos: resultadosDescuento
        });

    } catch (err) {
        console.error('❌ Error descontando stock:', err);
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// 2. ALERTAS DE STOCK BAJO CONFIGURABLES
// =========================================================================
app.get('/api/crm/alertas-stock', async (req, res) => {
    try {
        const umbralMinimoDefault = parseInt(req.query.umbral || 20);

        const { data: prods, error } = await supabase
            .from('dec_products')
            .select('id, woocommerce_id, name, price, stock, stock_status, category, image_url')
            .eq('status', 'publish')
            .order('stock', { ascending: true })
            .limit(50);

        if (error) throw error;

        // Filtrar productos por debajo del umbral o sin stock
        const alertasStock = (prods || []).filter(p => (parseInt(p.stock || 0) <= umbralMinimoDefault) || p.stock_status === 'outofstock').map(p => ({
            id: p.id,
            woocommerce_id: p.woocommerce_id,
            nombre: p.name,
            precio: parseFloat(p.price || 0),
            stock_actual: parseInt(p.stock || 0),
            estado_stock: p.stock_status,
            categoria: p.category || 'General',
            imagen_url: p.image_url,
            nivel_alerta: parseInt(p.stock || 0) === 0 ? 'CRÍTICO (SIN STOCK)' : 'ADVERTENCIA (STOCK BAJO)'
        }));

        res.json({
            success: true,
            umbral_aplicado: umbralMinimoDefault,
            total_alertas: alertasStock.length,
            alertas: alertasStock
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// 3. GESTIÓN DE CATÁLOGO CON IA & CARGA MASIVA DE PRECIOS
// =========================================================================
app.post('/api/crm/actualizar-catalogo-ia', async (req, res) => {
    try {
        const { instruccion_texto } = req.body;
        if (!instruccion_texto) return res.status(400).json({ error: 'Instrucción requerida' });

        // Groq analiza la instrucción comercial
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Analiza la instrucción del administrador sobre precios y catálogo. Devuelve un JSON con la acción requerida. 
Ejemplos de acciones:
1. Aumento porcentual por categoría: {"accion": "AUMENTO_PORCENTUAL", "categoria": "suavizantes", "porcentaje": 10}
2. Cambio de precio individual: {"accion": "CAMBIO_PRECIO_INDIVIDUAL", "producto_busqueda": "detergente magenta 5l", "nuevo_precio": 26500}
3. Crear producto: {"accion": "CREAR_PRODUCTO", "nombre": "Detergente Lavanda 5L", "precio": 18500, "stock": 50, "categoria": "Líquidos"}`
                },
                { role: "user", content: instruccion_texto }
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            temperature: 0.1
        });

        const operacion = JSON.parse(completion.choices[0]?.message?.content || '{}');
        let resultadoEjecucion = "";

        if (operacion.accion === 'AUMENTO_PORCENTUAL') {
            const cat = operacion.categoria || '';
            const pct = (100 + parseFloat(operacion.porcentaje || 0)) / 100;
            
            // Buscar productos de esa categoría y aplicar aumento
            const { data: prods } = await supabase.from('dec_products').select('id, price').ilike('name', `%${cat}%`);
            let count = 0;
            for (const p of (prods || [])) {
                const newPrice = Math.round(parseFloat(p.price || 0) * pct);
                await supabase.from('dec_products').update({ price: newPrice }).eq('id', p.id);
                count++;
            }
            resultadoEjecucion = `✅ Se aumentó un ${operacion.porcentaje}% a ${count} productos relacionados con '${cat}'.`;

        } else if (operacion.accion === 'CAMBIO_PRECIO_INDIVIDUAL') {
            const search = operacion.producto_busqueda || '';
            const newPrice = parseFloat(operacion.nuevo_precio || 0);

            const { data: prods } = await supabase.from('dec_products').select('id, name').ilike('name', `%${search.split(' ')[0]}%`).limit(1);
            if (prods && prods.length > 0) {
                await supabase.from('dec_products').update({ price: newPrice }).eq('id', prods[0].id);
                resultadoEjecucion = `✅ Precio actualizado para '${prods[0].name}' a $${newPrice.toLocaleString('es-AR')}.`;
            } else {
                resultadoEjecucion = `⚠️ No se encontró el producto '${search}'.`;
            }

        } else if (operacion.accion === 'CREAR_PRODUCTO') {
            const imgDefault = "https://quimicadec.com/assets/img/categorias/productosparadiluir.jpeg";
            const newProd = {
                woocommerce_id: Math.floor(100000 + Math.random() * 900000),
                name: operacion.nombre,
                price: parseFloat(operacion.precio || 0),
                stock: parseInt(operacion.stock || 50),
                stock_status: 'instock',
                category: operacion.categoria || 'General',
                status: 'publish',
                image_url: imgDefault
            };

            await supabase.from('dec_products').insert([newProd]);
            resultadoEjecucion = `✅ Producto nuevo '${operacion.nombre}' creado exitosamente con precio $${operacion.precio} y foto por defecto de categoría.`;
        } else {
            resultadoEjecucion = `⚠️ No se pudo determinar la acción comercial requerida.`;
        }

        res.json({
            success: true,
            operacion_detectada: operacion,
            resultado: resultadoEjecucion
        });

    } catch (err) {
        console.error('❌ Error ejecutando instrucción IA:', err);
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// 4. ASISTENTE DANI Y RESTO DE RUTAS CRM
// =========================================================================
app.post('/api/whatsapp/incoming-ai', async (req, res) => {
    try {
        const { phone, mensaje_texto } = req.body;
        let textoProcesado = mensaje_texto || '';

        let itemsExtraidos = [];
        try {
            const parserCompletion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `Extrae una lista JSON de productos pedidos. Salida: {"items": [{"busqueda": "detergente magenta 5l", "cantidad": 5}]}. Si no hay productos pedidos, responde {"items": []}.`
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

        res.json({
            success: true,
            respuesta_sugerida_ia: completion.choices[0]?.message?.content || "¡Hola! 😊 ¿En qué te puedo ayudar hoy?"
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
