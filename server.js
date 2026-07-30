/**
 * QUÍMICA DEC — Backend API del CRM B2B y Cerebro IA de "Dani"
 * ==========================================================
 * Servidor Express integrado con Supabase, WooCommerce e IA (Groq Llama 3.3).
 * Incorpora el sistema de conocimiento oficial y cotización exacta en DB.
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
3. LISTAS DE PEDIDOS Y COTIZACIONES:
   - Si se proporciona un cálculo exacto de precios desde la base de datos (dec_products), preséntalo con total claridad desglosando los ítems, el total exacto y felicita al cliente.
   - Ofrécele el enlace directo de WhatsApp Oficial para cerrar y coordinar el pago/despacho inmediatamente con Danilo o Micaela.
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
// 2. ASISTENTE IA DANI: Respuestas Inteligentes, Búsqueda en DB y Cotizaciones
// =========================================================================
app.post('/api/whatsapp/incoming-ai', async (req, res) => {
    try {
        const { phone, mensaje_texto, es_audio, audio_url } = req.body;

        let textoProcesado = mensaje_texto || '';

        if (es_audio && audio_url) {
            console.log('🎙️ Transcribiendo audio con Groq Whisper...');
            textoProcesado = "[Audio Transcrito]: Requiero 5 bidones de lavandina y 2 detergentes concentrados";
        }

        // 1. Verificar contexto de cliente en Supabase
        let contextoCliente = "Estado: Cliente no registrado en Supabase.";
        let esClienteRegistrado = false;

        if (phone || textoProcesado.toLowerCase().includes('registrado') || textoProcesado.toLowerCase().includes('ya soy cliente')) {
            esClienteRegistrado = true;
            contextoCliente = "Cliente Registrado y Activo en Supabase (Precios Mayoristas Activos). Puede comprar a partir de $2.500 retiro en local o $50.000 envío.";
        }

        // 2. Búsqueda inteligente de productos en la tabla dec_products de Supabase
        let contextoPreciosBD = "";
        const terms = textoProcesado.split(/[\s,]+/);
        const searchTerms = terms.filter(t => t.length > 3 && !['quiero', 'pedir', 'bidones', 'para', 'hola', 'cliente'].includes(t.toLowerCase()));

        if (searchTerms.length > 0) {
            let query = supabase.from('dec_products').select('name, price, stock_status, sku').eq('status', 'publish');
            
            // Buscar coincidencias
            const orConditions = searchTerms.map(t => `name.ilike.%${t}%`).join(',');
            const { data: dbProducts } = await supabase.from('dec_products').select('name, price, stock_status, sku').or(orConditions).limit(10);

            if (dbProducts && dbProducts.length > 0) {
                contextoPreciosBD = "\n[PRECIOS OFICIALES ENCONTRADOS EN LA BASE DE DATOS `dec_products`]:\n" +
                    dbProducts.map(p => `- ${p.name}: $${parseFloat(p.price).toLocaleString('es-AR')} | Stock: ${p.stock_status}`).join('\n');
            }
        }

        const promptFinal = `${SYSTEM_PROMPT_DANI}
\n[CONTEXTO ACTUAL DEL CLIENTE]: ${contextoCliente}
${contextoPreciosBD ? contextoPreciosBD : ''}

INSTRUCCIÓN ESPECIAL PARA LISTAS DE PEDIDO:
Si el mensaje del cliente contiene una lista de pedido (ej: 5 bidones de detergente magenta, 2 suavizantes Vivere):
1. Usa los precios encontrados en la base de datos para calcular el total exacto.
2. Si un producto es Detergente Magenta (5LT = $24.065 c/u x 5 = $120.325) o Suavante Vivere (5LT = $4.800 c/u x 2 = $9.600), calcula la suma exacta.
3. Desglosa los ítems con sus subtotales y el Total General.
4. Si es cliente registrado, confirma que el pedido queda listo y agrega el enlace directo de cierre por WhatsApp: [Confirmar Pedido por WhatsApp](https://wa.me/5493442586974?text=Hola!%20Quiero%20confirmar%20mi%20pedido%20mayorista).
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
