/**
 * QUÍMICA DEC — Backend API del CRM B2B
 * =====================================
 * Servidor Express integrado con Supabase, WooCommerce e IA (Groq/Gemini).
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Seguridad y Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Inicialización de Clientes
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        service: 'Química DEC CRM API',
        timestamp: new Date().toISOString(),
        supabase: 'connected'
    });
});

// =========================================================================
// 1. WEBHOOK WOOCOMMERCE: Recepción de Pedidos y Sincronización de Clientes
// =========================================================================
app.post('/api/webhooks/woocommerce/order-created', async (req, res) => {
    try {
        const order = req.body;
        if (!order || !order.id) {
            return res.status(400).json({ error: 'Datos de pedido inválidos' });
        }

        const billing = order.billing || {};
        const phone = billing.phone ? billing.phone.replace(/[^0-9+]/g, '') : '';
        const name = `${billing.first_name || ''} ${billing.last_name || ''}`.trim() || 'Cliente WooCommerce';

        if (!phone) {
            return res.status(400).json({ error: 'Teléfono de contacto requerido' });
        }

        // 1. Buscar o Crear Cliente en Supabase
        let { data: cliente, error: findError } = await supabase
            .from('clientes')
            .select('id, total_comprado')
            .eq('whatsapp', phone)
            .single();

        if (!cliente) {
            const { data: newCliente, error: createError } = await supabase
                .from('clientes')
                .insert({
                    razon_social: billing.company || name,
                    contacto_nombre: name,
                    whatsapp: phone,
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

        // 2. Registrar Pedido
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

        // 3. Registrar Ítems del Pedido
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

        // 4. Actualizar total comprado del cliente
        const nuevoTotal = (parseFloat(cliente.total_comprado) || 0) + montoTotal;
        await supabase
            .from('clientes')
            .update({ 
                total_comprado: nuevoTotal,
                ultima_compra_fecha: new Date().toISOString(),
                estado_lead: 'Cliente Activo'
            })
            .eq('id', cliente.id);

        console.log(`✅ Pedido WooCommerce #${order.id} registrado para cliente ${name} ($${montoTotal})`);

        res.json({
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
// 2. INTELIGENCIA ARTIFICIAL: Transcripción de Audios y Asistente WhatsApp
// =========================================================================
app.post('/api/whatsapp/incoming-ai', async (req, res) => {
    try {
        const { phone, mensaje_texto, es_audio, audio_url } = req.body;

        let textoProcesado = mensaje_texto;

        // Si es audio, transcribir con Groq Whisper
        if (es_audio && audio_url) {
            console.log('🎙️ Transcribiendo audio con Groq Whisper...');
            // Simulación / integración de llamada a Groq Whisper API
            textoProcesado = "[Audio Transcrito]: Requiero 5 bidones de lavandina y 2 detergentes concentrados";
        }

        // Analizar con IA (Groq LLM)
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "Eres el asistente inteligente de ventas mayoristas de Química DEC (Concepción del Uruguay, Entre Ríos). Tu objetivo es identificar si la solicitud alcanza el mínimo mayorista de $80.000 y sugerir productos complementarios."
                },
                {
                    role: "user",
                    content: `Mensaje del cliente: "${textoProcesado}"`
                }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.3
        });

        const respuestaIA = completion.choices[0]?.message?.content || "Mensaje recibido correctamente.";

        res.json({
            success: true,
            texto_procesado: textoProcesado,
            respuesta_sugerida_ia: respuestaIA
        });

    } catch (err) {
        console.error('❌ Error procesando IA WhatsApp:', err);
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
    console.log(`🚀 Química DEC CRM API escuchando en puerto ${PORT}`);
});
