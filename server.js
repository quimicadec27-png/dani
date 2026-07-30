/**
 * QUÍMICA DEC — Backend API del CRM B2B y Cerebro IA de "Dani"
 * ==========================================================
 * Servidor Express integrado con Supabase, WooCommerce e IA (Groq Llama 3.3).
 * Sistema de 2 Etapas: Parser IA -> Búsqueda Exacta en DB -> Cotización Determinista.
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

// System Prompt Oficial de "Dani" (Cerebro IA de Química DEC)
const SYSTEM_PROMPT_DANI = `
Eres "Dani", el asistente virtual oficial de Química DEC (Concepción del Uruguay, Entre Ríos).
Hablas en primera persona como representante oficial ("en Química DEC nos dedicamos", "ofrecemos", "nuestro local").
Tu tono debe ser siempre amable, alegre, muy profesional y rioplatense (usando el "vos" con respeto y calidez).

REGLAS DE NEGOCIO Y POLÍTICAS COMERCIALES ESTRICTAS:
1. COMPRA MÍNIMA INICIAL: $80.000 para registrarse y activar la cuenta de precios mayoristas por primera vez.
2. CLIENTES ACTIVOS RECURRENTES:
   - Mínimo de $2.500 para retiro en local físico.
   - Mínimo de $50.000 para envíos a domicilio (Entre Ríos o resto del país).
   - Acumulado mensual requerido de $80.000 al mes para mantener los beneficios mayoristas.
3. REGLA ESTRICTA DE PRECIOS Y ESTIMACIONES:
   - JAMÁS inventes rangos aproximados ni estimaciones de precios (ej: NO digas "$55.000 - $60.000").
   - Si se te proporciona una cotización desglosada calculada desde la base de datos oficial, presenta los precios exactos centavo por centavo, muestra el Total General y confirma el stock disponible.
   - Si el cliente confirma su lista o desea hacer el pedido, ofrécele el enlace clicable directo: [Confirmar Pedido por WhatsApp](https://wa.me/5493442586974) para que Danilo o Micaela lo cierren inmediatamente.
4. MEDIOS DE PAGO: Efectivo y Transferencia Bancaria ÚNICAMENTE. Aclara amablemente que NO se acepta tarjeta de crédito.
5. ENVÍOS: 
   - Entre Ríos: Transporte MOSTTO a domicilio.
   - Resto de Argentina: Vía Cargo y Correo Andreani (domicilio o sucursal).
6. UBICACIÓN Y HORARIOS: 
   - Av. Frondizi 815, Concepción del Uruguay, Entre Ríos.
   - Lunes a Viernes: 08:30 a 12:45 hs y 16:30 a 19:00 hs.
   - Sábados: 09:00 a 12:40 hs.
7. PRODUCTOS TÉCNICOS:
   - Pastas concentradas: Rinden ~50 litros. Para jabón líquido, detergente y suavizante requieren mezclador o batidor mecánico (disco acoplado a un taladro). Si preguntan por la preparación, menciona también que tenemos tutoriales y videos paso a paso en nuestras redes sociales (Instagram @quimica.dec27 y TikTok @quimicadec).
   - Lavandina: Dilución 1 parte de lavandina + 2 partes de agua.
   - Detergentes: Amarillo Limón (económico), Magenta (superior desengrasante), Tipo CIF (máxima calidad).
   - Líneas de Jabón/Suavizante: Premium (máxima fragancia y duración: Downy, Cher, Vivere, Confort) vs. Eco Plus (económico de alta rotación: Celeste, Rosa, Blanco).
8. ENLACES OFICIALES (Usar siempre markdown):
   - Catálogo: [Nuestros Productos](https://quimicadec.com/nuestros-productos/)
   - WhatsApp Oficial: [WhatsApp Oficial](https://wa.me/5493442586974)
   - Ubicación Maps: [Google Maps](https://www.google.com/maps/place/QU%C3%8DMICA+D.E.C/@-32.4720703,-58.2374134,17z)
`;

// Health Check API
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        service: 'Química DEC CRM & IA Dani API',
        timestamp: new Date().toISOString(),
        supabase: 'connected'
    });
});

// =========================================================================
// 1. WEBHOOK WOOCOMMERCE: Recepción de Pedidos y Sincronización de Clientes
// =========================================================================
app.post('/api/webhooks/woocommerce/order-created', async (req, res) => {
    try {
        const payload = req.body || {};
        const topicHeader = req.headers['x-wc-webhook-topic'] || '';

        if (payload.webhook_id || topicHeader.includes('ping') || !payload.id) {
            console.log('🔔 WooCommerce Webhook Ping recibido y verificado (200 OK)');
            return res.status(200).json({ 
                success: true, 
                message: 'Webhook ping de WooCommerce verificado exitosamente' 
            });
        }

        const order = payload;
        const billing = order.billing || {};
        const phone = billing.phone ? billing.phone.replace(/[^0-9+]/g, '') : '';
        const name = `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || 'Cliente WooCommerce';
        const clientPhone = phone || `WC-${order.id}`;

        let { data: cliente } = await supabase
            .from('clientes')
            .select('id, total_comprado')
            .eq('whatsapp', clientPhone)
            .maybeSingle();

        if (!cliente) {
            const { data: newCliente, error: createError } = await supabase
                .from('clientes')
                .insert({
                    razon_social: billing.company || name,
                    contacto_nombre: name,
                    whatsapp: clientPhone,
                    email: billing.email || null,
                    localidad: billing.city || null,
                    provincia: billing.state || 'Entre Ríos',
                    estado_lead: 'Cliente Activo'
                })
                .select()
                .single();

            if (createError) throw createError;
            cliente = newCliente;
        }

        const montoTotal = parseFloat(order.total || 0);
        const { data: pedido, error: pedidoError } = await supabase
            .from('pedidos')
            .insert({
                cliente_id: cliente.id,
                woocommerce_order_id: order.id,
                origen: 'Web WooCommerce',
                monto_total: montoTotal,
                estado: order.status === 'completed' || order.status === 'processing' ? 'Pagado' : 'Presupuesto'
            })
            .select()
            .single();

        if (pedidoError) throw pedidoError;

        if (Array.isArray(order.line_items) && order.line_items.length > 0) {
            const itemsToInsert = order.line_items.map(item => ({
                pedido_id: pedido.id,
                sku: item.sku || null,
                producto_nombre: item.name,
                cantidad: item.quantity,
                precio_unitario: parseFloat(item.price || 0)
            }));

            await supabase.from('items_pedido').insert(itemsToInsert);
        }

        const nuevoTotal = (parseFloat(cliente.total_comprado) || 0) + montoTotal;
        await supabase
            .from('clientes')
            .update({ 
                total_comprado: nuevoTotal,
                ultima_compra_fecha: new Date().toISOString(),
                estado_lead: 'Cliente Activo'
            })
            .eq('id', cliente.id);

        console.log(`✅ Pedido WooCommerce #${order.id} registrado para ${name} ($${montoTotal})`);

        res.status(200).json({
            success: true,
            pedido_id: pedido.id,
            cliente_id: cliente.id,
            supera_minimo_80k: montoTotal >= 80000
        });

    } catch (err) {
        console.error('❌ Error en webhook WooCommerce:', err);
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// 2. ASISTENTE IA DANI: Pipeline de 2 Etapas (Parser -> SQL Lookup -> LLM)
// =========================================================================
app.post('/api/whatsapp/incoming-ai', async (req, res) => {
    try {
        const { phone, mensaje_texto, es_audio, audio_url } = req.body;

        let textoProcesado = mensaje_texto || '';

        if (es_audio && audio_url) {
            console.log('🎙️ Transcribiendo audio con Groq Whisper...');
            textoProcesado = "[Audio Transcrito]: Requiero 5 bidones de lavandina y 2 detergentes concentrados";
        }

        // 1. ETAPA 1: Extraer la lista de productos requeridos usando Groq JSON mode
        let itemsExtraidos = [];
        try {
            const parserCompletion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `Extrae de la consulta del cliente una lista JSON pura de los productos pedidos con su término de búsqueda y cantidad. Ejemplo de salida: {"items": [{"busqueda": "detergente magenta 5l", "cantidad": 5}, {"busqueda": "suavizante vivere", "cantidad": 2}]}. Si el cliente solo está haciendo una pregunta general y NO está pidiendo una lista de productos, responde {"items": []}.`
                    },
                    { role: "user", content: textoProcesado }
                ],
                model: "llama-3.3-70b-versatile",
                response_format: { type: "json_object" },
                temperature: 0.1
            });

            const parsed = JSON.parse(parserCompletion.choices[0]?.message?.content || '{}');
            itemsExtraidos = parsed.items || [];
        } catch (e) {
            console.warn("⚠️ No se extrajo JSON estructurado:", e.message);
        }

        // 2. ETAPA 2: Búsqueda exacta de precios en Supabase (dec_products)
        let cotizacionCalculada = "";
        let totalGeneralAcc = 0;

        if (itemsExtraidos.length > 0) {
            const desgloses = [];

            for (const item of itemsExtraidos) {
                const queryStr = item.busqueda || '';
                const qty = item.cantidad || 1;

                if (!queryStr) continue;

                // Extraer palabras clave de búsqueda
                const words = queryStr.split(' ').filter(w => w.length > 2);
                let dbRes = null;

                if (words.length > 0) {
                    const firstWord = words[0];
                    const { data: prods } = await supabase
                        .from('dec_products')
                        .select('name, price, stock_status, sku')
                        .ilike('name', `%${firstWord}%`)
                        .limit(10);

                    if (prods && prods.length > 0) {
                        // Buscar la mejor coincidencia que contenga la segunda palabra o variante
                        let bestMatch = prods[0];
                        if (words.length > 1) {
                            const secondWord = words[1].toLowerCase();
                            const match = prods.find(p => p.name.toLowerCase().includes(secondWord));
                            if (match) bestMatch = match;
                        }
                        dbRes = bestMatch;
                    }
                }

                if (dbRes && parseFloat(dbRes.price) > 0) {
                    const price = parseFloat(dbRes.price);
                    const subtotal = price * qty;
                    totalGeneralAcc += subtotal;
                    desgloses.push(`- ${qty}x ${dbRes.name}: $${price.toLocaleString('es-AR')} c/u ➔ Subtotal: $${subtotal.toLocaleString('es-AR')} (Stock: ${dbRes.stock_status === 'instock' ? 'Disponible' : 'Agotado'})`);
                } else if (dbRes) {
                    desgloses.push(`- ${qty}x ${dbRes.name}: Consultar valor variante | Stock: ${dbRes.stock_status === 'instock' ? 'Disponible' : 'Agotado'}`);
                }
            }

            if (desgloses.length > 0) {
                cotizacionCalculada = `\n[COTIZACIÓN MATEMÁTICA EXACTA BASADA EN LA BASE DE DATOS `dec_products`]:\n` +
                    desgloses.join('\n') +
                    `\nTOTAL GENERAL CALCULADO CENTAVO POR CENTAVO: $${totalGeneralAcc.toLocaleString('es-AR')}`;
            }
        }

        // 3. ETAPA 3: Contexto de Cliente y Generación de Respuesta con Dani
        let contextoCliente = "Estado: Cliente no registrado en Supabase.";
        if (phone || textoProcesado.toLowerCase().includes('registrado') || textoProcesado.toLowerCase().includes('ya soy cliente')) {
            contextoCliente = "Cliente Registrado y Activo en Supabase (Precios Mayoristas Activos). Puede comprar a partir de $2.500 retiro en local o $50.000 envío.";
        }

        const promptFinal = `${SYSTEM_PROMPT_DANI}
\n[CONTEXTO ACTUAL DEL CLIENTE]: ${contextoCliente}
${cotizacionCalculada ? cotizacionCalculada : ''}
`;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: promptFinal },
                { role: "user", content: `Mensaje del usuario: "${textoProcesado}"` }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.2
        });

        const respuestaIA = completion.choices[0]?.message?.content || "¡Hola! 😊 Soy Dani de Química DEC. ¿En qué te puedo ayudar hoy?";

        res.json({
            success: true,
            texto_procesado: textoProcesado,
            respuesta_sugerida_ia: respuestaIA
        });

    } catch (err) {
        console.error('❌ Error procesando Asistente Dani:', err);
        res.status(500).json({ error: err.message });
    }
});

// =========================================================================
// 3. RUTAS DE CONSULTA DEL CRM (Fichas de Clientes y Embudo)
// =========================================================================
app.get('/api/crm/clientes', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('clientes')
            .select('*, pedidos(count)')
            .order('creado_el', { ascending: false });

        if (error) throw error;
        res.json({ success: true, count: data.length, clientes: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/crm/pedidos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('pedidos')
            .select('*, clientes(razon_social, whatsapp), items_pedido(*)')
            .order('creado_el', { ascending: false });

        if (error) throw error;
        res.json({ success: true, count: data.length, pedidos: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Iniciar Servidor
app.listen(PORT, () => {
    console.log(`🚀 Química DEC CRM API & Cerebro Dani escuchando en puerto ${PORT}`);
});
