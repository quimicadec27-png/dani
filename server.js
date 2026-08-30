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
    res.sendFile(path.join(__dirname, 'public', 'icon-192.png'));
});

// Inicialización de Clientes
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
});
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Caché en memoria RAM del catálogo de productos para respuestas ultra-rápidas en 0ms
let PRODUCT_CATALOG_CACHE = [];
async function refreshProductCatalog() {
    try {
        let allProducts = [];
        let page = 0;
        const pageSize = 1000;

        while (true) {
            const offset = page * pageSize;
            const { data, error } = await supabase
                .from('dec_products')
                .select('id, name, price, category, stock_status, sku, status')
                .gt('price', 0)
                .order('name', { ascending: true })
                .range(offset, offset + pageSize - 1);

            if (error || !data || data.length === 0) break;
            allProducts.push(...data);
            if (data.length < pageSize) break;
            page++;
        }

        if (allProducts.length > 0) {
            PRODUCT_CATALOG_CACHE = allProducts
                .filter(p => !p.sku?.includes('QD-DTRG-1320') && (p.status === 'publish' || !p.status) && !p.name?.toLowerCase().includes('skip'))
                .map(p => ({
                    ...p,
                    price: parseFloat(p.price || 0),
                    regular_price: parseFloat(p.price || 0),
                    sku: (p.sku || '').replace(/_ID\d+$/, '')
                }));
            console.log(`[CATALOG CACHE] ✅ ${PRODUCT_CATALOG_CACHE.length} productos y variaciones publicados cargados en memoria RAM.`);
        } else {
            // Fallback a archivo local JSON con los productos si Supabase no responde
            try {
                const localJsonPath = path.join(__dirname, 'catalogo_completo_3800.json');
                if (fs.existsSync(localJsonPath)) {
                    const localData = JSON.parse(fs.readFileSync(localJsonPath, 'utf-8'));
                    PRODUCT_CATALOG_CACHE = localData
                        .filter(p => !p.sku?.includes('QD-DTRG-1320') && (p.status === 'publish' || !p.status) && !p.name?.toLowerCase().includes('skip'))
                        .map(p => ({ ...p, regular_price: p.price }));
                    console.log(`[CATALOG CACHE] ✅ ${PRODUCT_CATALOG_CACHE.length} productos cargados desde archivo local JSON.`);
                }
            } catch (errLocal) {
                console.error('[CATALOG CACHE LOCAL FALLBACK ERROR]', errLocal.message);
            }
        }
    } catch (e) {
        console.error('[CATALOG CACHE ERROR]', e.message);
    }
}
refreshProductCatalog();
setInterval(refreshProductCatalog, 10 * 60 * 1000);

// System Prompt Oficial de "Dani"
const SYSTEM_PROMPT_DANI = `
Eres "Dani", la asistente virtual oficial de Química DEC (Concepción del Uruguay, Entre Ríos).
Hablas en primera persona como representante oficial de la empresa ("en Química DEC nos dedicamos", "ofrecemos", "nuestro local").

⚠️ REGLA DE ORO DE TRANSPARENCIA TOTAL Y PRECIOS INMEDIATOS (CRÍTICO):
1. RESPONDER PRECIOS Y DISPONIBILIDAD DE INMEDIATO:
   - Si el cliente consulta por cualquier producto, stock o precio, DEBÉS responderle PRIMERO y en ese mismo mensaje los precios exactos, presentaciones y disponibilidad real de nuestro catálogo.
2. PROHIBIDO CONDICIONAR O RETENER PRECIOS A CAMBIO DE DATOS:
   - Queda ROTUNDAMENTE PROHIBIDO retener precios o decir "para pasarte los precios decime tu nombre y teléfono". El cliente siempre recibe los números y la información de inmediato.
3. PROHIBIDO DERIVAR A UN ASESOR HUMANO SIN HABER DADO LOS PRECIOS:
   - NUNCA le digas al cliente "te paso con un asesor comercial" si antes no le diste los precios y opciones en el chat. La derivación es solo para coordinar el pago/despacho o cuando el cliente lo solicita.
4. CAPTURA AMABLE Y POSTERIOR:
   - Después de haberle entregado la cotización y los precios completos, podés invitarlo amablemente:
     "Si querés que te reservemos estos productos o te enviemos el presupuesto formal, ¿me compartís tu nombre y número de WhatsApp con característica?"

⚠️ IDENTIDAD COMERCIAL DE QUÍMICA DEC: FABRICANTE DIRECTO Y DISTRIBUIDOR MAYORISTA
En Química DEC combinamos dos grandes fortalezas:

1. SOMOS FABRICANTES DIRECTOS de Productos Químicos Líquidos y Pastas Concentradas:
   - Elaboramos nuestras propias líneas de alta concentración: Jabón Líquido para Ropa (Línea Premium: Violeta, Azul, Verde, Ropa Blanca, Rojo | Línea Eco Plus: Azul, Verde), Suavizantes para Ropa (Downy, Mary Cher, Confort, Celeste, Rosa), Desodorantes de Piso Concentrados (1+9, 1+20, 1+50), Ceras Autobrillo (Negra, Roja, Incolora), Desengrasantes, Lavandina Líquida 1+2, Cloro Líquido (desde 5L a 200L) y Pastas Concentradas para Fabricar 50L.
   - ⚠️ EN JABÓN LÍQUIDO PARA ROPA: No comercializamos marcas como Skip, Ariel ni Ala líquido porque fabricamos nuestras propias fórmulas exclusivas de máxima concentración. Si el cliente pregunta por Skip o Ariel, aclarale amablemente: "En jabón para ropa no trabajamos marca Skip ni Ariel; somos fabricantes directos y tenemos nuestras propias líneas de Jabón Líquido para Ropa de alta concentración: la Línea Premium y la Línea Eco Plus." Y pasale los precios de las presentaciones disponibles (5L, 10L, 20L).

2. SOMOS DISTRIBUIDORES MAYORISTAS DE PRIMERAS MARCAS LÍDERES Y PRODUCTOS DE TERCEROS:
   - Sí comercializamos y distribuimos una amplia variedad de artículos de marcas líderes y accesorios en todo el país:
     • Sahumerios y Defumación: Tuk Tuk, Sagrada Madre, Iluminarte, Nuna Terra, Amogh, Prana.
     • Insecticidas y Repelentes: Raid, Fuyi, Off, Baygon, Selton.
     • Desinfectantes y Aromatizantes: Glade, Poett, Cif, Lysoform, Blem.
     • Cuidado del Baño e Inodoro: Harpic, Pato Purific, Vim, Procenex.
     • Papelería y Celulosa: Morita, New Pel, Maxisec, Sussex, Campanita, toallas intercaladas.
     • Textiles de Limpieza: Trapos de piso rayados reforzados (Oli 50x60), trapos nido de abeja, franelas de algodón, mopas Mr. Trapo, rejillas dobles, microfibras.
     • Esponjas, Cepillos y Bazar: Make, Schez, Mortimer, Iberia, Tacsa, baldes y fuentones Florida.
     • Higiene Personal: Jabones de tocador Dove, Plusbelle, Primordial, Lux.

⚠️ ESCALA DE PRECIOS OFICIALES DE JABONES LÍQUIDOS PARA ROPA (FABRICACIÓN PROPIA):
- LÍNEA PREMIUM (Violeta, Azul, Verde, Ropa Blanca, Rojo):
  • 5 L: entre $4.485 y $4.904,75
  • 10 L: entre $8.971,84 y $9.009,50
  • 20 L: entre $17.943,68 y $19.625,00
  • 40 L: entre $35.494,84 y $38.824,00
  • 60 L: entre $52.738,20 y $57.408,00
  • 120 L: entre $104.465,86 y $113.022,00
  • 200 L: entre $172.147,18 y $186.300,00
- LÍNEA ECO PLUS (Azul, Verde):
  • 5 L: $2.313 | 10 L: $4.626 | 20 L: $9.252 | 40 L: $18.504 | 60 L: $27.756 | 120 L: $55.512 | 200 L: $92.520

⚠️ FORMATO DE MENSAJES Y CHAT (LIMPIO, SIN ASTERISCOS DOBLES CRUDOS):
- Escribí siempre con formato limpio, prolijo y natural.
- NO uses asteriscos dobles (como **$17943** o **Jabón**). Escribí los precios de forma directa y clara (ej: $186.300).
- Usá viñetas con punto (•), emoticones amables y saltos de línea para que sea fácil de leer en el celular.

⚠️ REGLAS SOBRE ESPECIFICACIÓN DE VARIABLES DE PRODUCTO (TAMAÑOS, LITROS, FRAGANCIAS):
- CLORO LÍQUIDO (1+2 partes de agua - venta sin envase):
  * Presentaciones oficiales de Cloro Líquido:
    - 5 LT: $3.769,12
    - 10 LT: $7.538,25
    - 20 LT: $15.060,00
    - 40 LT: $29.675,60
    - 60 LT: $43.719,60
    - 120 LT: $85.534,80
    - 200 LT: $139.648,00
- PASTILLAS DE CLORO TRIPLE ACCIÓN:
  * Disponibles en pastillas de 50g y 200g (por unidad o sueltas por 1 kg a $7.760,73).
- Desinfectantes en Aerosol: DESINFECTANTE CIF (Floral, Frescura Cítrica, Lavanda, Original 360gr a $3.591,99).
- Insecticidas: Raid, Fuyi (exclusivamente insecticidas en aerosol / espirales / tabletas).
- Desinfección Concentrada: Lavandina Líquida (dilución 1+2).

⚠️ NUESTRO CATÁLOGO INTEGRAL (FABRICACIÓN PROPIA Y DISTRIBUCIÓN MAYORISTA):
En Química DEC fabricamos y distribuimos productos en 4 Macro-Sectores y 32 Categorías:
1. LIMPIEZA Y QUÍMICOS: Jabones Líquidos propios (Premium y Eco Plus), Suavizantes, Desodorantes de Piso Concentrados (1+9, 1+20, 1+50), Pastas Concentradas para fabricar 50L, Ceras Autobrillo (Negra, Roja, Incolora), Desengrasantes, Detergentes Lavavajillas, Limpiadores multiuso.
2. ACCESORIOS DE LIMPIEZA: Esponjas y Fibras, Escobillones y Cepillos, Secadores de piso de goma, Cabos de madera, Burletes aislantes, Bolsas de residuos y consorcio (50x70, 80x110), Bolsas camiseta y rollo, Envases plásticos y bidones vacíos.
3. HOGAR Y AMBIENTES: Baño e inodoros (pastillas y bloques mochila Harpic/Pato/Vim), Cocina y vajilla (esponjas de acero), Perfumería y difusores textiles, Repelentes (Off/Fuyi), Insecticidas (Raid), Desinfectantes en aerosol (Glade/Cif), Sahumerios y Defumación (Tuk Tuk x50u, Sagrada Madre, Iluminarte, Amogh, Prana), Textiles de limpieza (trapos de piso rayados, franelas, rejillas, microfibra), Toallitas y paños.
4. ESPECIALIDADES Y PILETAS: Papeles y celulosa (Morita, New Pel, toallas intercaladas), Higiene personal (jabón de manos), Piletas (Cloro líquido 5L a 200L, pastillas triple acción 50g y 200g, cloro granulado, alguicidas, clarificantes), Línea Automotor (siliconas, shampoo siliconado, revividores), Jardinería (mangueras de 15m), Kiosco (cintas Tacsa), Bazar y Plásticos (baldes y fuentones).

⚠️ REGLA ABSOLUTA ANTI-INVENCIÓN DE PRECIOS:
- EL VALOR "$2.500" ES ÚNICA Y EXCLUSIVAMENTE EL MONTO MÍNIMO DE COMPRA PARA RETIRAR EN EL LOCAL (para clientes mayoristas registrados). ¡BAJO NINGUNA CIRCUNSTANCIA ES EL PRECIO DE UN PRODUCTO!
- QUEDA ROTUNDAMENTE PROHIBIDO ASIGNAR $2.500 O CUALQUIER PRECIO INVENTADO A PRODUCTOS.
- DEBÉS USAR ÚNICAMENTE LOS PRECIOS OFICIALES Y CÁLCULOS QUE APARECEN EN "[DATOS REALES Y CÁLCULOS MATEMÁTICOS OFICIALES DE QUÍMICA DEC]".

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

// Extractor Automático de Datos de Lead con Validación Cruzada (Nombre, Teléfono WhatsApp, DNI/CUIT)
// Evita mezclar teléfonos con DNI requiriendo palabras clave explícitas para DNI
async function autoExtractAndUpdateLead(clienteId, clienteObj, textoUsuario) {
    if (!clienteId || !textoUsuario) return;

    // Filtro rápido: solo procesar si hay pistas de datos personales
    const TRIGGER_HINTS = [
        /\b(me llamo|mi nombre|soy|llaman|apellido|nombre)\b/i,
        /\b(dni|cuit|cuil|documento|número|nro\.?|doc\.?)\b/i,
        /\b\d{7,13}\b/,
        /\b(\+?54\s*9?\s*\d[\d\s.-]{6,})\b/
    ];
    if (!TRIGGER_HINTS.some(rx => rx.test(textoUsuario))) return;

    try {
        let extracted = { nombre: null, telefono: null, dni: null, direccion: null };

        // 1. Extraer Teléfono / WhatsApp
        const telExplicit = textoUsuario.match(/(?:(?:whats(?:app)?|wsp|wa|tel(?:efono|éfono)?|cel(?:ular)?|contacto|movil|móvil)\s*[:=]?\s*)(\+?54\s*9?\s*[\d\s.-]{7,16})\b/i);
        let rawTel = null;
        if (telExplicit) {
            rawTel = telExplicit[1];
        } else {
            const telGeneric = textoUsuario.match(/\b(?:\+?54\s*9?\s*|0)?(?:11|[23]\d{2,3})[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/);
            if (telGeneric) {
                rawTel = telGeneric[0];
            }
        }

        if (rawTel) {
            let digits = rawTel.replace(/\D/g, '');
            if (digits.startsWith('0')) digits = digits.substring(1);
            if (digits.length === 9 || digits.length === 10) {
                digits = '549' + digits;
            } else if (digits.startsWith('54') && !digits.startsWith('549') && (digits.length === 11 || digits.length === 12)) {
                digits = '549' + digits.substring(2);
            }
            if (digits.length >= 8 && digits.length <= 15) {
                extracted.telefono = digits.substring(0, 20);
            }
        }

        // 2. Extraer DNI / CUIT (REQUIERE OBLIGATORIAMENTE PALABRA CLAVE DNI/CUIT/DOCUMENTO O FORMATO XX-XXXXXXXX-X)
        const dniExplicit = textoUsuario.match(/\b(?:dni|cuit|cuil|documento|doc\.?)\s*[:=]?\s*(\d{7,11}|\d{2}-\d{7,8}-\d)\b/i);
        if (dniExplicit) {
            const cleanDni = dniExplicit[1].replace(/\D/g, '');
            if (cleanDni.length >= 7 && cleanDni.length <= 11) {
                // Validar que NO sea el mismo número de teléfono
                if (!extracted.telefono || (!extracted.telefono.endsWith(cleanDni) && extracted.telefono !== cleanDni)) {
                    extracted.dni = cleanDni;
                }
            }
        }

        // 3. Extraer Dirección
        const dirMatch = textoUsuario.match(/\b(?:calle|direccion|dirección|domicilio)\s*[:=]?\s*([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ\s,.-]{5,40})/i);
        if (dirMatch) {
            extracted.direccion = dirMatch[1].trim();
        }

        // 4. Extraer Nombre
        const nameExplicit = textoUsuario.match(/(?:me llamo|soy|mi nombre es|nombre:?)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ ]{3,40})/i);
        if (nameExplicit) {
            const possibleName = nameExplicit[1].split(/\b(y|mi|el|la|en|para|con|mi numero|mi tel|mi whats|dni|tel|cel|direccion|dirección|calle)\b/i)[0].trim();
            if (possibleName.length > 2) extracted.nombre = possibleName;
        } else {
            let temp = textoUsuario;
            if (rawTel) temp = temp.replace(rawTel, '');
            if (dniExplicit) temp = temp.replace(dniExplicit[0], '');
            if (dirMatch) temp = temp.replace(dirMatch[0], '');
            temp = temp.replace(/\b(?:tel(?:efono|éfono)?|cel(?:ular)?|whats(?:app)?|wsp|wa|dni|cuit|cuil|doc|calle|direccion|dirección|soy|me llamo|mi nombre es)\b/gi, '');
            temp = temp.replace(/[,;:.+?¿!¡-]/g, ' ');
            temp = temp.replace(/\s+/g, ' ').trim();
            const words = temp.split(' ').filter(w => /^[A-Za-zÁÉÍÓÚáéíóúñÑ]+$/.test(w));
            if (words.length >= 2 && words.length <= 8) {
                const clean_words = words.filter(w => !['cloro', 'jabon', 'jabón', 'detergente', 'sahumerio', 'presupuesto', 'pedido', 'parana', 'paraná', 'uruguay', 'concepcion', 'concepción', 'hola', 'buenas'].includes(w.toLowerCase()));
                if (clean_words.length >= 2) {
                    extracted.nombre = clean_words.join(' ');
                }
            }
        }

        // 5. Solo actualizar campos que son vacíos o placeholders genéricos
        const currentNombre   = (clienteObj?.razon_social || '').trim();
        const currentWhatsapp = (clienteObj?.whatsapp || '').trim();
        const currentCuit     = (clienteObj?.cuit || '').trim();
        const isPlaceholderNombre   = !currentNombre   || currentNombre.startsWith('Lead Web')   || currentNombre.startsWith('Cliente Web');
        const isPlaceholderWhatsapp = !currentWhatsapp || currentWhatsapp.startsWith('Web_') || currentWhatsapp.startsWith('cli_');
        const isPlaceholderCuit     = !currentCuit     || currentCuit.startsWith('Web_') || currentCuit.startsWith('cli_');

        const updateData = {};

        if (extracted.nombre && isPlaceholderNombre) {
            const nombreCapitalizado = extracted.nombre
                .split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');
            updateData.razon_social    = nombreCapitalizado;
            updateData.contacto_nombre = nombreCapitalizado;
        }

        if (extracted.dni && isPlaceholderCuit) {
            updateData.cuit = extracted.dni.substring(0, 13);
        }

        if (extracted.telefono && isPlaceholderWhatsapp) {
            updateData.whatsapp = extracted.telefono.substring(0, 20);
        }

        if (extracted.direccion && !clienteObj?.localidad) {
            updateData.localidad = extracted.direccion;
        }

        if (Object.keys(updateData).length > 0) {
            const { error: updateErr } = await supabase.from('clientes').update(updateData).eq('id', clienteId);
            if (updateErr && updateErr.message && updateErr.message.includes('unique constraint')) {
                delete updateData.whatsapp;
                if (Object.keys(updateData).length > 0) {
                    await supabase.from('clientes').update(updateData).eq('id', clienteId);
                }
            }
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

// Motor de IA Ultra-Resiliente con Cascada Multi-Modelo (Gemini 2.5 Flash + Groq GPT-OSS 120b / 20b)
async function generateDaniResponse(messagesPayload) {
    const geminiKey = process.env.GOOGLE_API_KEY;
    const systemMsg = messagesPayload.find(m => m.role === 'system')?.content || '';
    const conversationMsgs = messagesPayload.filter(m => m.role !== 'system');

    // 1. Probar modelos Gemini en cascada si hay clave activa (Prioridad #1 por excelencia, cero razonamiento residual y ultra-baja latencia)
    if (geminiKey && geminiKey.trim().length > 10 && !geminiKey.includes('placeholder')) {
        const geminiModels = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
        const contents = conversationMsgs.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        for (const modelName of geminiModels) {
            try {
                const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: contents,
                        systemInstruction: { parts: [{ text: systemMsg }] },
                        generationConfig: { temperature: 0.25, maxOutputTokens: 900 }
                    }),
                    signal: AbortSignal.timeout(9000)
                });

                if (geminiRes.ok) {
                    const data = await geminiRes.json();
                    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text && text.trim().length > 0) {
                        return text.trim();
                    }
                } else {
                    const errBody = await geminiRes.text();
                    console.warn(`[GEMINI ${modelName} HTTP ${geminiRes.status}]: ${errBody.slice(0, 120)}`);
                    if (geminiRes.status === 403 && errBody.includes('leaked')) {
                        console.warn('[GEMINI KEY LEAKED] Clave GOOGLE_API_KEY filtrada/revocada por Google. Conmutando a Groq...');
                        break;
                    }
                }
            } catch (err) {
                console.warn(`[GEMINI ${modelName} ERROR: ${err.message}], probando siguiente modelo...`);
            }
        }
    }

    // 2. Motor Groq de Alta Velocidad (Modelos limpios directos: openai/gpt-oss-120b y openai/gpt-oss-20b)
    if (process.env.GROQ_API_KEY && groq) {
        const groqConfigs = [
            { model: 'openai/gpt-oss-120b', timeout: 15000, temperature: 0.25, max_tokens: 900 },
            { model: 'openai/gpt-oss-20b', timeout: 10000, temperature: 0.2, max_tokens: 800 }
        ];

        for (const cfg of groqConfigs) {
            try {
                const groqPromise = groq.chat.completions.create({
                    messages: messagesPayload,
                    model: cfg.model,
                    temperature: cfg.temperature,
                    max_tokens: cfg.max_tokens
                });
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Groq ${cfg.model} timeout ${cfg.timeout}ms`)), cfg.timeout));
                const completion = await Promise.race([groqPromise, timeoutPromise]);
                let content = completion?.choices?.[0]?.message?.content;
                if (content && typeof content === 'string' && content.trim().length > 0) {
                    // Sanitización rigurosa de cadenas de razonamiento y residuos
                    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                    content = content.replace(/<think>[\s\S]*/gi, '').trim();
                    content = content.replace(/^(?:[\s\S]*?(?:Drafting the response:?|Final response:?|Here's the response:?))\s*/i, '').trim();
                    content = content.replace(/^(?:Here's a thinking process:?|Thinking Process:?|Análisis de la consulta:?)[\s\S]*/gi, '').trim();
                    if (content.length > 10 && !content.toLowerCase().includes('thinking process') && !content.toLowerCase().includes('analyze user input')) {
                        // Limpieza de asteriscos dobles para texto plano limpio
                        content = content.replace(/\*\*(.*?)\*\*/g, '$1');
                        return content;
                    }
                }
            } catch (e) {
                console.warn(`[GROQ ${cfg.model} ERROR]:`, e.message);
            }
        }
    }

    // 3. Fallback inteligente y contextualizado (NUNCA reiniciar la charla si ya hay historial en curso)
    const hasPriorConversation = conversationMsgs.length > 1;
    const lastUserMsg = [...conversationMsgs].reverse().find(m => m.role === 'user')?.content || '';
    const lastUserLower = lastUserMsg.toLowerCase();

    if (hasPriorConversation) {
        if (/\b(?:\d{7,15}|nombre|telefono|whatsapp|wsp|entrego|dirección|calle|tomas|javier|daniel|matias|lucas|juan)\b/i.test(lastUserLower)) {
            return "¡Excelente! Ya registré tus datos de contacto y el detalle de tu pedido. Un asesor comercial humano se comunicará con vos a la brevedad por WhatsApp para coordinar el pago (Efectivo o Transferencia) y el despacho. ¡Muchas gracias por elegir Química DEC!";
        }
        if (lastUserLower.includes('pedido') || lastUserLower.includes('precio') || lastUserLower.includes('total') || lastUserLower.includes('roto') || lastUserLower.includes('estas') || lastUserLower.includes('confirm') || lastUserLower.includes('jabon') || lastUserLower.includes('cloro')) {
            return "¡Tomo nota de los productos y medidas! Tu consulta ya quedó registrada en nuestro sistema para que un asesor comercial se comunique con vos a la brevedad por WhatsApp, te confirme el presupuesto exacto y coordine la entrega. ¿Me confirmás tu nombre y número de WhatsApp?";
        }
        return "Te pido disculpas por la demora momentánea. Ya registré tu consulta para que un representante de nuestro equipo comercial se ponga en contacto con vos a la brevedad por WhatsApp y te brinde atención personalizada.";
    }

    if (lastUserLower.includes('lavandina') || lastUserLower.includes('cloro') || lastUserLower.includes('jabon')) {
        return "¡Hola! En Química DEC tenemos stock disponible de lavandinas, cloros y artículos de limpieza para venta mayorista (mínimo $80.000). ¿Qué cantidad o presentación (5L, 10L, 25L) estás necesitando para armarte el presupuesto?";
    }

    return "¡Hola! Soy Dani de Química DEC. Trabajamos con venta mayorista directa de fábrica en Entre Ríos y envíos a todo el país (mínimo $80.000). ¿En qué productos o cantidades estás interesado para prepararte la cotización?";
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

        const rawPhone = (phone || user_id || session_id || 'Cliente Web').toString().trim();
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
                const { data: newC, error: insertErr } = await supabase
                    .from('clientes')
                    .insert([{ razon_social: leadNombre, whatsapp: clientePhone, cuit: null }])
                    .select()
                    .maybeSingle();
                if (newC) {
                    cliente = newC;
                } else {
                    const { data: fallbackC } = await supabase
                        .from('clientes')
                        .select('id, razon_social, whatsapp, cuit, contacto_nombre')
                        .eq('whatsapp', clientePhone)
                        .maybeSingle();
                    cliente = fallbackC;
                }
            } catch (e) {
                console.error('Error creando cliente lead web:', e.message);
            }
        }

        let clienteId = cliente ? cliente.id : null;
        let historialPrevio = [];

        // 1. Si el cliente envió el historial directamente en el payload (web chat instantáneo de 0ms)
        if (Array.isArray(messages) && messages.length > 1) {
            historialPrevio = messages
                .filter(m => m.role !== 'system')
                .slice(0, -1)
                .slice(-8)
                .map(m => {
                    const rawText = m.content || (m.parts && m.parts[0]?.text) || '';
                    return {
                        role: (m.role === 'model' || m.role === 'assistant') ? 'assistant' : 'user',
                        content: rawText.length > 450 ? rawText.substring(0, 450) + '...' : rawText
                    };
                });
        } else if (clienteId) {
            // 2. Si no vino en el payload (ej. webhook de WhatsApp), consultar Supabase
            try {
                const { data: ultimosMsgs } = await supabase
                    .from('mensajes_chat')
                    .select('emisor, texto')
                    .eq('cliente_id', clienteId)
                    .order('creado_el', { ascending: false })
                    .limit(10);

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
                        .slice(-8)
                        .map(m => {
                            const rawText = m.texto || '';
                            const cleanText = rawText.length > 450 ? rawText.substring(0, 450) + '...' : rawText;
                            if (m.emisor === 'cliente') {
                                return { role: 'user', content: cleanText };
                            } else if (m.emisor === 'vendedor') {
                                return { role: 'assistant', content: `[Intervención de Vendedor]: ${cleanText}` };
                            } else {
                                return { role: 'assistant', content: cleanText };
                            }
                        });
                }
            } catch (e) {}
        }

        if (clienteId) {
            // 2. Guardar el mensaje del cliente y auto-actualizar datos del lead en segundo plano (0ms de bloqueo)
            (async () => {
                try {
                    await supabase.from('mensajes_chat').insert([{ cliente_id: clienteId, emisor: 'cliente', texto: textoProcesado }]);
                    autoExtractAndUpdateLead(clienteId, cliente, textoProcesado);
                } catch (e) {
                    console.error('[ASYNC MSG SAVE ERROR]', e.message);
                }
            })();
        }

        // Cotizador instantáneo de productos en memoria RAM (0ms sin llamadas extras a la API)
        let cotizacionCalculada = "";
        let desgloses = [];
        let totalGeneralCotizacion = 0;
        let itemsCotizadosCuenta = 0;

        const isOnlyContactOrGreeting = /^(?:hola|buenas|chau|gracias|javier aguirre|mi whats|mi tel|mi nombre|mi dni|\d{7,11}|si|no|ok|dale|perfecto)[\s.,!]*$/i.test(textoProcesado.trim());

        if (!isOnlyContactOrGreeting && PRODUCT_CATALOG_CACHE && PRODUCT_CATALOG_CACHE.length > 0) {
            let searchContext = textoProcesado;
            if (historialPrevio && historialPrevio.length > 0) {
                const prevUserMsgs = historialPrevio.filter(m => m.role === 'user').map(m => m.content).join(" ");
                searchContext = prevUserMsgs + " " + textoProcesado;
            }

            let normalized = searchContext.toLowerCase()
                .replace(/\bsaumerios?\b/gi, 'sahumerio')
                .replace(/\blitros?\b|\blts?\b/gi, 'lt')
                .replace(/\bunidades\b|\bunids?\b/gi, 'u')
                .replace(/\bpack\s*de\b/gi, 'pack x')
                .replace(/\bcloros?\b/gi, 'cloro');

            const stopWords = [
                'hola', 'cuanto', 'sale', 'tenes', 'opciones', 'producto', 'precio', 'este', 'para', 'saber',
                'quisiera', 'quiero', 'necesito', 'favor', 'gracias', 'buenas', 'tardes', 'dias', 'envio', 'costo',
                'extra', 'paso', 'nombre', 'numero', 'whats', 'whatsapp', 'dni', 'cuit', 'cuil', 'direccion',
                'americas', 'rosario', 'tala', 'imagino', 'bien', 'las', 'los', 'del', 'con', 'sin', 'una', 'uno',
                'unos', 'unas', 'que', 'por', 'son', 'mis', 'tus', 'sus', 'donde', 'como', 'cuando', 'quien',
                'cual', 'estoy', 'estan', 'esta', 'estos', 'estas', 'enviame', 'mmm'
            ];

            const stripAccents = s => (s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            const toSingular = word => {
                if (!word || word.length <= 3) return word;
                if (word.endsWith('ces')) return word.slice(0, -3) + 'z';
                if (word.endsWith('es') && !['tres', 'mes', 'des'].includes(word)) return word.slice(0, -2);
                if (word.endsWith('s') && !['mas', 'dos', 'gas', 'plus'].includes(word)) return word.slice(0, -1);
                return word;
            };

            const normalizeSizes = s => {
                return (s || '')
                    .replace(/n[°º]\s*(\d+)/gi, '$1')
                    .replace(/n(\d{2})\b/gi, '$1')
                    .replace(/(\d+)\s*cm\b/gi, '$1')
                    .replace(/(\d+)\s*mts?\b/gi, '$1m');
            };

            const normalizedClean = normalizeSizes(stripAccents(normalized));
            const tokens = normalizedClean.match(/[a-z0-9+,\.]{2,}/gi) || [];
            const keywords = tokens.filter(t => !stopWords.includes(t));
            const mainNoun = keywords.length > 0 ? toSingular(keywords[0]) : null;

            // Detección de litros / tamaños variables (desde 0.5L hasta 500L)
            const sizeMatch = normalized.match(/\b(0[\.,]5|1|2|3|4|5|6|8|10|20|25|40|50|60|100|120|200|500)\s*(?:lt|l|litros?)\b/i) || normalized.match(/\b(0[\.,]5|1|2|3|4|5|6|8|10|20|25|40|50|60|100|120|200|500)\b/);
            const reqSize = sizeMatch ? sizeMatch[1].replace(',', '.') : null;

            // Detección de packs / unidades (pack x3, x5, x10, x50, etc.)
            const packMatch = normalized.match(/\b(?:pack\s*x?\s*|x\s*|)(\d{1,3})\s*(?:u|unidades)?\b/i);
            const reqPack = packMatch ? packMatch[1] : null;

            if (keywords.length > 0) {
                let scored = [];
                PRODUCT_CATALOG_CACHE.forEach(p => {
                    const pNameRaw = (p.name || '');
                    const pName = normalizeSizes(stripAccents(pNameRaw));
                    let score = 0;

                    // Si el cliente especificó un sustantivo principal (ej: secador, trapo, jabon, bolsa, cera)
                    if (mainNoun && mainNoun.length > 3 && !/^\d+$/.test(mainNoun)) {
                        if (!pName.includes(mainNoun)) {
                            // Penalizar si no contiene el sustantivo principal consultado
                            score -= 35;
                        } else {
                            score += 40;
                        }
                    }

                    const matchedKw = keywords.filter(k => {
                        const singK = toSingular(k);
                        return pName.includes(k) || (singK.length > 3 && pName.includes(singK));
                    }).length;

                    if (matchedKw === 0 && score <= 0) return;
                    score += matchedKw * 14;

                    // Si el nombre del producto arranca con la palabra clave principal (ej: "CLORO...", "TRAPO...", "SECADOR...")
                    const firstKw = keywords[0];
                    const firstSing = toSingular(firstKw);
                    if (pName.startsWith(firstKw) || (firstSing.length > 3 && pName.startsWith(firstSing))) {
                        score += 25;
                    }

                    keywords.forEach(k => {
                        const singK = toSingular(k);
                        if (k.length > 4 && (pName.includes(k) || (singK.length > 3 && pName.includes(singK)))) score += 8;
                        if (/^\d+$/.test(k) && (pName.includes(k) || pName.includes(`n${k}`) || pName.includes(`n°${k}`))) {
                            score += 45; // Impulso para número/medida exacta (ej: 40, 50, 80x110)
                        }
                    });

                    if (reqSize) {
                        const sizeRegex = new RegExp(`\\b(?:desde\\s*)?${reqSize}\\s*(?:lt|l|litros?|kg)?\\b`, 'i');
                        if (sizeRegex.test(pName)) {
                            score += 60;
                        } else {
                            // Penalizar si el producto es de otra medida explícita cuando el cliente pidió una específica
                            const otherSizeMatch = pName.match(/\b(?:desde\\s*)?(\d{1,3})\s*lt\b/i);
                            if (otherSizeMatch && otherSizeMatch[1] !== reqSize) {
                                score -= 30;
                            }
                        }
                    }

                    if (reqPack) {
                        if (pName.includes(`pack x${reqPack}`) || pName.includes(`(${reqPack} unidades)`) || pName.includes(`(${reqPack}u)`) || pName.includes(`x${reqPack}`) || pName.includes(`x ${reqPack}`)) {
                            score += 30;
                        }
                    }

                    if (score > 10) scored.push({ score, prod: p });
                });

                scored.sort((a, b) => b.score - a.score);
                const matches = scored.slice(0, 5).map(s => s.prod);

                if (matches.length > 0) {
                    matches.forEach(prod => {
                        const rawPrice = parseFloat(prod.price || 0);
                        const stockText = prod.stock_status === 'instock' || !prod.stock_status ? 'Disponible ✅' : 'Consultar ⚠️';
                        const cleanName = prod.name.replace(/\(SKU:.*?\)/gi, '').trim();

                        if (rawPrice > 0) {
                            totalGeneralCotizacion += rawPrice;
                            itemsCotizadosCuenta++;
                            desgloses.push(`• ${cleanName}: $${rawPrice.toLocaleString('es-AR')} [Stock: ${stockText}]`);
                        }
                    });
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
                "\n2. MANEJO INTELIGENTE DE FRAGANCIAS Y PRESENTACIONES: Si el cliente pidió un producto general que tiene diferentes aromas o medidas, explicale la presentación de referencia y decile amablemente que si busca una fragancia o medida específica, puede ingresar a nuestro catálogo en quimicadec.com/catalogo y buscar directamente con la LUPITA DE BÚSQUEDA 🔍 por el nombre del producto." +
                "\n3. CALCULADORA MATEMÁTICA EXACTA: Usá ÚNICAMENTE los números exactos calculados arriba." +
                "\n4. MEDIOS DE PAGO: ÚNICAMENTE aceptamos pago en EFECTIVO o TRANSFERENCIA BANCARIA. Jamás menciones tarjetas ni cuotas.";
            }
        }


        const tieneMensajesAnteriores = (historialPrevio || []).length > 0;
        let directiveContinuidad = "";
        if (tieneMensajesAnteriores) {
            directiveContinuidad = `\n⚠️ INSTRUCCIÓN DE CONTINUIDAD Y CIERRE DE PEDIDO:\nEsta conversación YA ESTÁ EN CURSO y tiene historial previo. Recordá perfectamente lo que se habló antes en el historial.
- Si el cliente te brinda su nombre, teléfono, dirección o confirmación (ej: "javier aguirre y mi whats es..."): agradecé cordialmente, confirmale que todos sus datos y pedido quedaron registrados y agendados, y que un asesor comercial humano se pondrá en contacto por WhatsApp a la brevedad para coordinar el pago (Efectivo o Transferencia) y el despacho.
- ESTÁ ABSOLUTAMENTE PROHIBIDO volver a saludar como si recién empezara el chat ("¡Hola! Mi nombre es Dani..."), PROHIBIDO decir "¿En qué puedo ayudarte hoy?" o preguntar qué producto busca si ya se habló previamente.
- PROHIBIDO usar corchetes como "[Nombre]" o inventar nombres o datos bancarios.`;
        }

        const promptInstrucciones = `${SYSTEM_PROMPT_DANI}\n${directiveContinuidad}\n${cotizacionCalculada}`;


        const messagesPayload = [
            { role: "system", content: promptInstrucciones }
        ];

        historialPrevio.forEach(m => {
            if (m.role !== 'system' && m.content) {
                const prev = messagesPayload[messagesPayload.length - 1];
                if (prev && prev.role === m.role) {
                    prev.content += '\n' + m.content;
                } else {
                    messagesPayload.push({ role: m.role, content: m.content });
                }
            }
        });

        const lastMsgInPayload = messagesPayload[messagesPayload.length - 1];
        if (!lastMsgInPayload || lastMsgInPayload.role !== 'user') {
            messagesPayload.push({ role: "user", content: textoProcesado });
        } else {
            lastMsgInPayload.content = textoProcesado;
        }

        let respuestaIA = await generateDaniResponse(messagesPayload);
        
        // Filtro de seguridad post-procesamiento (elimina SKUs, asteriscos dobles, tarjetas, cuotas, CBU/cuentas inventadas, teléfonos falsos, corchetes, español neutro o modismos victimistas)
        respuestaIA = respuestaIA.replace(/\*\*(.*?)\*\*/g, '$1')
                                 .replace(/\b\(?SKU:\s*[\w-]+\)?\b/gi, '')
                                 .replace(/\[nombre\]/gi, '')
                                 .replace(/\[producto\]/gi, 'los productos que buscás')
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

// Crear Nuevo Cliente / Lead Directo (desde WhatsApp, Local o CRM)
app.post('/api/crm/clientes/crear', async (req, res) => {
    try {
        const { razon_social, whatsapp, dni_cuit, tipo_envio, direccion, localidad, provincia, notas, tipo_cliente, vendedor } = req.body;
        
        const cleanWhatsapp = whatsapp ? String(whatsapp).replace(/[^\d+]/g, '').trim().substring(0, 20) : '';
        const clientName = (razon_social && String(razon_social).trim()) || (cleanWhatsapp ? `Cliente (${cleanWhatsapp})` : 'Nuevo Cliente CRM');

        // 1. Si se ingresó WhatsApp, verificar si ya existe un cliente registrado
        if (cleanWhatsapp && !cleanWhatsapp.startsWith('Web_')) {
            const { data: existingClient } = await supabase
                .from('clientes')
                .select('id, razon_social, whatsapp, cuit, localidad, provincia, contacto_nombre')
                .eq('whatsapp', cleanWhatsapp)
                .maybeSingle();

            if (existingClient) {
                return res.json({
                    success: true,
                    already_exists: true,
                    cliente_id: existingClient.id,
                    mensaje: `El cliente con WhatsApp ${cleanWhatsapp} ya existe (${existingClient.razon_social}). Se abrió su perfil.`,
                    cliente: existingClient
                });
            }
        }

        let locStr = '';
        if (direccion) locStr += String(direccion).trim();
        if (localidad) locStr += (locStr ? `, ${String(localidad).trim()}` : String(localidad).trim());

        let contactoStr = '';
        if (dni_cuit) contactoStr += `DNI: ${dni_cuit}`;
        if (tipo_envio) contactoStr += (contactoStr ? ` | Envío: ${tipo_envio}` : `Envío: ${tipo_envio}`);
        if (notas) contactoStr += (contactoStr ? ` | ${notas}` : notas);

        const insertPayload = {
            razon_social: clientName,
            whatsapp: cleanWhatsapp || `cli_${Date.now().toString(36)}`,
            cuit: dni_cuit ? String(dni_cuit).trim().substring(0, 30) : null,
            provincia: provincia ? String(provincia).trim() : 'Entre Ríos',
            localidad: locStr || null,
            contacto_nombre: contactoStr ? contactoStr.substring(0, 150) : clientName,
            tipo_cliente: tipo_cliente || 'Mayorista',
            estado_lead: vendedor ? `Vendedor: ${vendedor}` : 'Cliente Directo'
        };

        const { data: newClient, error } = await supabase
            .from('clientes')
            .insert([insertPayload])
            .select()
            .single();

        if (error) throw error;

        // Crear mensaje inicial en el historial para que aparezca de inmediato en la columna de Chat en Vivo
        if (newClient && newClient.id) {
            const inicialText = notas ? `[Cliente Creado en CRM]: ${notas}` : `[Cliente Creado en CRM / WhatsApp Directo]`;
            try {
                await supabase.from('mensajes_chat').insert([{
                    cliente_id: newClient.id,
                    emisor: 'vendedor',
                    texto: inicialText
                }]);
            } catch(e) {}
        }

        res.json({
            success: true,
            cliente_id: newClient.id,
            mensaje: '✅ Cliente creado exitosamente en el CRM.',
            cliente: newClient
        });
    } catch (err) {
        console.error('[CLIENTES CREAR ERROR]:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Auto-Extraer Datos de Cliente con IA desde Texto de WhatsApp / Notas
app.post('/api/crm/clientes/extraer-datos-ia', async (req, res) => {
    try {
        const { texto } = req.body;
        if (!texto || typeof texto !== 'string') {
            return res.status(400).json({ error: 'Texto requerido' });
        }

        const raw = texto.trim();
        const extracted = {
            nombre: '',
            whatsapp: '',
            dni_cuit: '',
            direccion: '',
            localidad: '',
            provincia: 'Entre Ríos',
            tipo_envio: '',
            notas: ''
        };

        // 1. Extracción de WhatsApp / Teléfono
        const telMatch = raw.match(/(?:\+?54\s*9?)?\s*(?:3442|343|345|3446|3447|3444|11|221|341|351|\d{2,4})[\s.-]*\d{3,4}[\s.-]*\d{3,4}/) || raw.match(/\b(?:\+?54)?\d{9,13}\b/);
        if (telMatch) {
            let t = telMatch[0].replace(/[^\d+]/g, '');
            if (!t.startsWith('+54') && !t.startsWith('54') && t.length >= 10) {
                t = '+549' + t;
            } else if (!t.startsWith('+') && t.length >= 10) {
                t = '+' + t;
            }
            extracted.whatsapp = t;
        }

        // 2. Extracción de DNI / CUIT
        const dniMatch = raw.match(/\b(?:\d{2}\.?\d{3}\.?\d{3}|\d{2}-\d{8}-\d{1}|\d{11})\b/);
        if (dniMatch) {
            extracted.dni_cuit = dniMatch[0].replace(/[\.-]/g, '');
        }

        // 3. Extracción de Dirección
        const dirMatch = raw.match(/(?:calle|av\.?|avenida|bv\.?|bulevar|ruta|pje\.?|pasaje)?\s*([A-Za-zÀ-ÿ0-9\s]+?)\s+(?:n[°º]?\s*|\#\s*)?(\d{1,5})\b/i);
        if (dirMatch && !dirMatch[1].toLowerCase().includes('precio') && !dirMatch[1].toLowerCase().includes('litro') && !dirMatch[1].toLowerCase().includes('jabon')) {
            extracted.direccion = `${dirMatch[1].trim()} ${dirMatch[2]}`.trim();
        }

        // 4. Extracción de Localidad
        const locRegex = /(?:en|de|localidad|ciudad|cp)\s+([A-Za-zÀ-ÿ\s]{3,30})/i;
        const locMatch = raw.match(locRegex);
        if (locMatch) {
            const candidateLoc = locMatch[1].trim();
            if (!['jabon', 'cloro', 'detergente', 'precio', 'envio', 'whatsapp', 'telefono', 'presupuesto'].includes(candidateLoc.toLowerCase())) {
                extracted.localidad = candidateLoc;
            }
        }

        // 5. Extracción de Nombre
        const nomRegex = /(?:nombre|me llamo|soy|sr\.?|sra\.?|cliente|razon social)\s*:?\s*([A-Za-zÀ-ÿ\s]{3,35})/i;
        const nomMatch = raw.match(nomRegex);
        if (nomMatch) {
            extracted.nombre = nomMatch[1].trim().split('\n')[0].replace(/[,\.]/g, '');
        } else {
            // Intentar con primera línea corta si parece nombre
            const firstLine = raw.split('\n')[0].trim();
            if (firstLine.length >= 4 && firstLine.length <= 30 && !/\d/.test(firstLine) && !firstLine.includes('$') && !firstLine.toLowerCase().includes('hola')) {
                extracted.nombre = firstLine;
            }
        }

        // 6. Extracción de Tipo de Envío
        const low = raw.toLowerCase();
        if (low.includes('retiro') || low.includes('retira') || low.includes('local') || low.includes('paso a buscar')) {
            extracted.tipo_envio = 'Retira en Local';
        } else if (low.includes('mostto') || (low.includes('entre rios') && !low.includes('concepcion'))) {
            extracted.tipo_envio = 'Entre Ríos (Mostto +5%)';
        } else if (low.includes('andreani') || low.includes('via cargo') || low.includes('resto del pais') || low.includes('encomienda')) {
            extracted.tipo_envio = 'Resto del País (Andreani / Vía Cargo)';
        } else if (low.includes('concepcion') || low.includes('domicilio')) {
            extracted.tipo_envio = 'Reparto Local (C. del Uruguay)';
        }

        // 7. Notas (resumen del texto)
        extracted.notas = raw.substring(0, 300);

        res.json({
            success: true,
            datos: extracted
        });
    } catch(err) {
        console.error('[EXTRAER DATOS IA ERROR]:', err.message);
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

        const modelsToTry = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'groq/compound-mini', 'qwen/qwen3.6-27b'];
        let completion = null;
        for (const m of modelsToTry) {
            try {
                completion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: "system",
                            content: `Analiza la instrucción para definir umbrales mínimos de stock. Devuelve JSON: {"umbral_general": 30, "mensaje_confirmacion": "Se estableció el límite mínimo de alerta en 30 unidades."}`
                        },
                        { role: "user", content: instruccion_texto }
                    ],
                    model: m,
                    response_format: { type: "json_object" },
                    temperature: 0.1
                });
                if (completion?.choices?.[0]?.message?.content) break;
            } catch (e) {
                console.warn(`[UMBRALES GROQ ${m} ERROR]:`, e.message);
            }
        }

        const parsed = JSON.parse(completion?.choices?.[0]?.message?.content || '{}');
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


// Endpoint para editar / corregir pedidos existentes (agregar/quitar items, cambiar cantidades, precios, envío)
app.post('/api/crm/pedidos/editar-pedido', async (req, res) => {
    try {
        const { pedido_id, cliente_id, items, observaciones, origen, tipo_envio, monto_total_final } = req.body;
        if (!pedido_id) {
            return res.status(400).json({ error: 'Falta el ID del pedido a editar' });
        }

        const itemsList = Array.isArray(items) ? items : [];
        let calculatedTotal = 0;
        itemsList.forEach(it => {
            const cant = parseInt(it.cantidad || 1);
            const pu = parseFloat(it.precio_unitario || 0);
            calculatedTotal += (cant * pu);
        });

        const tipoEnvioStr = tipo_envio || '';
        let finalTotal = monto_total_final ? parseFloat(monto_total_final) : calculatedTotal;
        if (!monto_total_final && (tipoEnvioStr.includes('Entre Ríos') || tipoEnvioStr.includes('Mostto'))) {
            finalTotal = calculatedTotal * 1.05;
        }

        let origenFormatted = origen || 'CRM Directo';
        if (tipoEnvioStr && !origenFormatted.includes('Envío:')) origenFormatted += ` | Envío: ${tipoEnvioStr}`;
        if (observaciones && !origenFormatted.includes('Nota:')) origenFormatted += ` | Nota: ${observaciones}`;
        origenFormatted = String(origenFormatted).substring(0, 50);

        // 1. Actualizar tabla pedidos (monto, cliente, origen)
        const { data: updatedOrder, error: orderErr } = await supabase
            .from('pedidos')
            .update({
                cliente_id: cliente_id,
                origen: origenFormatted,
                monto_total: parseFloat(finalTotal.toFixed(2))
            })
            .eq('id', pedido_id)
            .select()
            .single();

        if (orderErr) throw orderErr;

        // 2. Reemplazar items_pedido: eliminar anteriores y reinsertar actualizados
        await supabase.from('items_pedido').delete().eq('pedido_id', pedido_id);

        if (itemsList.length > 0) {
            const itemsPayload = itemsList.map((it, idx) => {
                let varTam = it.variacion_tamano ? String(it.variacion_tamano) : null;
                if (idx === 0) {
                    let noteParts = [];
                    if (tipoEnvioStr) noteParts.push(`Envío: ${tipoEnvioStr}`);
                    if (observaciones) noteParts.push(`Nota: ${observaciones}`);
                    if (noteParts.length > 0) varTam = noteParts.join(' | ').substring(0, 250);
                }

                return {
                    pedido_id: pedido_id,
                    sku: it.sku ? String(it.sku).substring(0, 50) : null,
                    producto_nombre: String(it.producto_nombre || 'Producto sin nombre').substring(0, 150),
                    variacion_tamano: varTam,
                    cantidad: parseInt(it.cantidad || 1),
                    precio_unitario: parseFloat(it.precio_unitario || 0)
                };
            });

            const { error: itemsErr } = await supabase.from('items_pedido').insert(itemsPayload);
            if (itemsErr) console.error('Error reinsertando items_pedido:', itemsErr);
        }

        // Traer pedido completo con relaciones
        const { data: fullOrder } = await supabase
            .from('pedidos')
            .select('*, clientes(razon_social, whatsapp), items_pedido(*)')
            .eq('id', pedido_id)
            .single();

        res.json({
            success: true,
            mensaje: '✅ ¡Pedido corregido y actualizado con éxito!',
            pedido: fullOrder || updatedOrder
        });
    } catch (err) {
        console.error('[EDITAR PEDIDO ERROR]:', err.message);
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
        let digits = String(rawPhone).replace(/\D/g, '');
        let cleanPhone = '';

        if (digits.startsWith('54954')) digits = '549' + digits.substring(5);
        else if (digits.startsWith('5454')) digits = '549' + digits.substring(4);
        else if (digits.startsWith('549')) { cleanPhone = digits; }
        else if (digits.startsWith('54')) cleanPhone = '549' + digits.substring(2);
        else if (digits.startsWith('0')) cleanPhone = '549' + digits.substring(1);
        else if (digits.length >= 10) cleanPhone = '549' + digits;
        else cleanPhone = digits;

        if (!cleanPhone || cleanPhone.length < 6) {
            cleanPhone = `Web_${wcOrderId}`;
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

                // Verificar si la orden de WooCommerce ya existe para no duplicar pedidos
        const { data: existingOrder } = await supabase
            .from('pedidos')
            .select('id')
            .eq('woocommerce_order_id', String(wcOrderId))
            .limit(1);

        let finalOrderId = null;

        if (existingOrder && existingOrder.length > 0) {
            finalOrderId = existingOrder[0].id;
            console.log(`[WOOCOMMERCE WEBHOOK] Actualizando pedido existente #${wcOrderId} (ID: ${finalOrderId})`);
            await supabase.from('pedidos').update({
                cliente_id: clienteId,
                origen: `WooCommerce Web #${wcOrderId} | Envío: ${tipoEnvio}`.substring(0, 50),
                monto_total: montoTotal
            }).eq('id', finalOrderId);

            // Eliminar items anteriores para evitar duplicidad
            await supabase.from('items_pedido').delete().eq('pedido_id', finalOrderId);
        } else {
            console.log(`[WOOCOMMERCE WEBHOOK] Creando nuevo pedido #${wcOrderId}`);
            const { data: newOrder, error: orderErr } = await supabase
                .from('pedidos')
                .insert([{
                    cliente_id: clienteId,
                    woocommerce_order_id: String(wcOrderId),
                    origen: `WooCommerce Web #${wcOrderId} | Envío: ${tipoEnvio}`.substring(0, 50),
                    monto_total: montoTotal,
                    estado: 'Presupuesto'
                }])
                .select()
                .single();

            if (orderErr) throw orderErr;
            finalOrderId = newOrder.id;
        }

        // Insertar items del pedido
        const lineItems = payload.line_items || [];
        if (lineItems.length > 0) {
            const itemsPayload = lineItems.map((it, idx) => ({
                pedido_id: finalOrderId,
                sku: it.sku ? String(it.sku).substring(0, 50) : null,
                producto_nombre: String(it.name || it.producto_nombre || 'Producto Web').substring(0, 150),
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

        const modelsToTry = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'groq/compound-mini', 'qwen/qwen3.6-27b'];
        let completion = null;
        for (const m of modelsToTry) {
            try {
                completion = await groq.chat.completions.create({
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
                    model: m,
                    response_format: { type: "json_object" },
                    temperature: 0.05
                });
                if (completion?.choices?.[0]?.message?.content) break;
            } catch (e) {
                console.warn(`[PARSE PRESUPUESTO GROQ ${m} ERROR]:`, e.message);
            }
        }

        const result = JSON.parse(completion?.choices?.[0]?.message?.content || '{}');
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
        let query = supabase.from('pedidos').select('*, clientes(id, razon_social, whatsapp, cuit, contacto_nombre, localidad, provincia), items_pedido(*)').order('creado_el', { ascending: false }).limit(2000);
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
                const vRes = await fetch(`https://quimicadec.com/?qdec_api=search_product&secret_key=qdec_crm_sec_2026&q=${encodeURIComponent(sku)}`);
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
            if (!sbErr) {
                sbUpdated = true;
                refreshProductCatalog();
            }
        }

        const wcOk = wcData.success || verificado;
        res.json({
            success: true,
            mensaje: wcOk
                ? `🎉 Producto actualizado con éxito en WooCommerce y Supabase. Caché purgada automáticamente.`
                : `⚠️ Supabase actualizado, pero WooCommerce no confirmó el cambio. Asegurate de que el snippet WPCode esté activo.`,
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

        function parseArgentinePrice(val) {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            let s = String(val).replace(/[\$]/g, '').trim();
            if (s.includes('.') && s.includes(',')) {
                s = s.replace(/\./g, '').replace(',', '.');
            } else if (s.includes(',')) {
                s = s.replace(',', '.');
            }
            const n = parseFloat(s);
            return isNaN(n) ? 0 : n;
        }

        function normText(str) {
            return (str || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

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
                        price: parseArgentinePrice(parts[2])
                    });
                }
            });
        }

        if (itemsToProcess.length === 0) {
            return res.status(400).json({ success: false, error: 'No se enviaron filas válidas para procesar.' });
        }

        // 1. Obtener catálogo existente de dec_products para matching inteligente por SKU o Nombre
        const existingProducts = await fetchAllProductsFromSupabase();
        const existingBySku = new Map();
        const existingByName = new Map();

        existingProducts.forEach(p => {
            if (p.sku) existingBySku.set(p.sku.toLowerCase().trim(), p);
            if (p.name) existingByName.set(normText(p.name), p);
        });

        let updatedCount = 0;
        let insertedCount = 0;
        let skippedZeroCount = 0;
        const productsToSyncWC = [];

        function normalizeWooCategory(rawCat) {
            if (!rawCat) return 'General';
            const c = String(rawCat).trim();
            const clean = c.toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (clean.includes('esponja') || clean.includes('fibra')) return 'ESPONJAS';
            if (clean.includes('plastic') || clean.includes('bazar')) return 'PLASTICO';
            if (clean.includes('textil') || clean.includes('trapo') || clean.includes('rejilla') || clean.includes('repasador')) return 'TEXTILES';
            if (clean.includes('sahumerio') || clean.includes('aroma')) return 'SAHUMERIOS';
            if (clean.includes('pasta') || clean.includes('concentrad') || clean.includes('diluir')) return 'PASTAS Y CONCENTRADOS';
            if (clean.includes('liquido') || clean.includes('lavandina') || clean.includes('jabon liquid')) return 'PRODUCTOS LIQUIDOS';
            if (clean.includes('papel') || clean.includes('higienic') || clean.includes('rollo')) return 'PAPELES';
            if (clean.includes('kiosco') || clean.includes('vario')) return 'KIOSCO Y VARIOS';
            if (clean.includes('envase') || clean.includes('bidon') || clean.includes('pulverizador')) return 'ENVASES';
            if (clean.includes('bano') || clean.includes('sanitari') || clean.includes('inodoro')) return 'BAÑO';
            if (clean.includes('cocina') || clean.includes('desengrasan') || clean.includes('vajilla')) return 'COCINA';
            if (clean.includes('auto') || clean.includes('automotor') || clean.includes('lavadero')) return 'AUTOMOVIL';
            if (clean.includes('cabo') || clean.includes('mango')) return 'CABOS';
            if (clean.includes('jardin') || clean.includes('verde')) return 'JARDÍN';
            if (clean.includes('pilet') || clean.includes('cloro') || clean.includes('alguicida')) return 'PILETA';
            if (clean.includes('perfumeria') || clean.includes('difusor') || clean.includes('perfumina')) return 'PERFUMERIA';
            if (clean.includes('higiene personal') || clean.includes('toallit') || clean.includes('dental') || clean.includes('afeitar')) return 'HIGIENE PERSONAL';
            if (clean.includes('jabon tocador') || clean.includes('tocador')) return 'JABÓN DE TOCADOR';
            if (clean.includes('jabon en polvo') || clean.includes('jabon polvo')) return 'JABON EN POLVO';
            if (clean.includes('jabon en pan') || clean.includes('jabon pan')) return 'JABON EN PAN';
            if (clean.includes('escobillon') || clean.includes('escoba')) return 'ESCOBILLONES';
            if (clean.includes('cepillo')) return 'CEPILLOS';
            if (clean.includes('secador')) return 'SECADORES';
            if (clean.includes('insecticida') || clean.includes('espiral') || clean.includes('pum')) return 'INSECTICIDAS';
            if (clean.includes('repelente') || clean.includes('off')) return 'REPELENTES';
            if (clean.includes('burlete')) return 'BURLETES';
            if (clean.includes('aplicador') || clean.includes('gatillo')) return 'APLICADORES';
            if (clean.includes('oferta') || clean.includes('combo')) return 'OFERTAS SEMANALES';
            if (clean.includes('primera marca') || clean.includes('ala') || clean.includes('skip') || clean.includes('raid')) return 'PRIMERAS MARCAS';

            return c;
        }

        const productsToUpdateSupa = [];
        const productsToInsertSupa = [];

        for (const r of itemsToProcess) {
            const rawSku = (r.sku || r['SKU'] || r['Sku'] || r['ID'] || '').toString().trim();
            const rawName = (r.name || r['Nombre del Producto / Variación'] || r['Nombre del Producto / Variacin'] || r['Nombre'] || r['Producto'] || '').toString().trim();
            const price = parseArgentinePrice(r.price || r['Precio ($)'] || r['Precio'] || r['Precio Final (Mayorista)']);
            const rawCat = (r.cat || r.category || r['Categorías'] || r['Categoría'] || r['Categoría Sugerida'] || 'General').toString().trim();
            const cat = normalizeWooCategory(rawCat);
            const stockRaw = (r.stock || r.stock_status || r['Estado de Stock'] || r['Stock'] || 'instock').toString().toLowerCase();
            const stockStatus = (stockRaw.includes('agotado') || stockRaw.includes('out of stock') || stockRaw.includes('outofstock') || stockRaw === '0') ? 'outofstock' : 'instock';
            const statusRaw = (r.status || r['Estado'] || r['estado'] || 'ACTIVO').toString().toUpperCase();
            const status = (statusRaw.includes('INACTIVO') || statusRaw.includes('BORRADOR') || statusRaw.includes('DRAFT')) ? 'draft' : 'publish';

            if (!rawName) continue;

            if (price <= 0) {
                skippedZeroCount++;
                continue;
            }

            let matched = null;
            if (rawSku && rawSku.toUpperCase().startsWith('QD-') && existingBySku.has(rawSku.toLowerCase())) {
                matched = existingBySku.get(rawSku.toLowerCase());
            } else if (existingByName.has(normText(rawName))) {
                matched = existingByName.get(normText(rawName));
            }

            if (matched) {
                productsToUpdateSupa.push({
                    id: matched.id,
                    sku: matched.sku,
                    name: matched.name,
                    price: price,
                    category: (cat && cat !== 'General') ? cat : matched.category,
                    stock_status: stockStatus,
                    status: status,
                    updated_at: new Date().toISOString()
                });
                productsToSyncWC.push({
                    id: matched.id,
                    sku: matched.sku,
                    name: matched.name,
                    price: price,
                    category: (cat && cat !== 'General') ? cat : matched.category,
                    stock_status: stockStatus,
                    status: status
                });
            } else {
                const finalSku = (rawSku && rawSku.toUpperCase().startsWith('QD-')) ? rawSku.toUpperCase() : `QD-IMP-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
                productsToInsertSupa.push({
                    sku: finalSku,
                    name: rawName,
                    price: price,
                    category: cat,
                    stock_status: stockStatus,
                    status: status,
                    type: 'simple',
                    updated_at: new Date().toISOString()
                });
                productsToSyncWC.push({
                    sku: finalSku,
                    name: rawName,
                    price: price,
                    category: cat,
                    stock_status: stockStatus,
                    status: status
                });
            }
        }

        // 1. Actualización ultrarrápida en Supabase en chunks paralelos
        const supaChunkSize = 50;
        for (let i = 0; i < productsToUpdateSupa.length; i += supaChunkSize) {
            const chunk = productsToUpdateSupa.slice(i, i + supaChunkSize);
            await Promise.all(chunk.map(p => 
                supabase.from('dec_products')
                    .update({ price: p.price, category: p.category, stock_status: p.stock_status, status: p.status, updated_at: p.updated_at })
                    .eq('id', p.id)
            ));
            updatedCount += chunk.length;
        }

        // 2. Inserciones en Supabase
        if (productsToInsertSupa.length > 0) {
            const { error: insErr } = await supabase.from('dec_products').insert(productsToInsertSupa);
            if (!insErr) insertedCount += productsToInsertSupa.length;
        }

        // 3. Sincronización en lotes seguros con WooCommerce (chunks de 40 para evitar timeouts de PHP)
        let wcUpdatedCount = 0;
        const wcChunkSize = 40;
        for (let i = 0; i < productsToSyncWC.length; i += wcChunkSize) {
            const chunk = productsToSyncWC.slice(i, i + wcChunkSize);
            try {
                const wcRes = await fetch('https://quimicadec.com/?qdec_api=upsert_products_bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        secret_key: 'qdec_crm_sec_2026',
                        products: chunk
                    })
                });
                const wcData = await wcRes.json();
                if (wcData && wcData.success) {
                    wcUpdatedCount += (wcData.updated || 0) + (wcData.created || 0);
                }
            } catch (e) {
                console.error(`[WC BULK SYNC ERROR chunk ${i}]:`, e.message);
            }
        }

        // Purgar memoria caché de Dani
        lastCatalogFetch = 0;

        res.json({
            success: true,
            updated: updatedCount,
            inserted: insertedCount,
            wc_synced: wcUpdatedCount,
            skipped_zero: skippedZeroCount,
            processed: updatedCount + insertedCount,
            mensaje: `🎉 ¡Carga Masiva completada con éxito! Se actualizaron ${updatedCount} productos en Supabase y ${wcUpdatedCount} en la tienda WooCommerce en vivo. (${skippedZeroCount} items con precio $0 fueron protegidos).`
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
        const resp = await fetch('https://quimicadec.com/?qdec_api=get_combos&secret_key=qdec_crm_sec_2026');
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
        const resp = await fetch('https://quimicadec.com/?qdec_api=get_ofertas&secret_key=qdec_crm_sec_2026');
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


// =========================================================================
// GESTOR DE ACTUALIZACIÓN MASIVA DE PRECIOS (% Y MONTO FIJO)
// =========================================================================

// 1. Obtener lista completa de productos para la grilla de precios (3.500+ productos y 32 categorías)
app.get('/api/crm/catalogo-precios-lista', async (req, res) => {
    try {
        let data = [];
        if (PRODUCT_CATALOG_CACHE && PRODUCT_CATALOG_CACHE.length > 500) {
            data = PRODUCT_CATALOG_CACHE;
        } else {
            let page = 0;
            const pageSize = 1000;
            while (true) {
                const offset = page * pageSize;
                const { data: pageData, error: pageErr } = await supabase
                    .from('dec_products')
                    .select('id, sku, name, price, category, stock_status, status')
                    .gt('price', 0)
                    .order('name', { ascending: true })
                    .range(offset, offset + pageSize - 1);

                if (pageErr || !pageData || pageData.length === 0) break;
                data.push(...pageData);
                if (pageData.length < pageSize) break;
                page++;
            }
        }

        if (!data || data.length === 0) {
            console.warn('[PRECIOS] Fallback a caché local: sin datos');
            data = PRODUCT_CATALOG_CACHE.map((p, idx) => ({
                id: p.id || `cache_${idx}`,
                sku: p.sku || `QD-${idx}`,
                name: p.name,
                price: parseFloat(p.price || 0),
                category: p.category,
                stock_status: p.stock_status || 'instock',
                status: 'publish'
            }));
        }

        const CATEGORIAS_OFICIALES_32 = [
            "Ofertas Semanales",
            "Combos Emprendedores",
            "Productos Líquidos",
            "Productos para Diluir",
            "Primeras Marcas",
            "Pastas y Concentrados",
            "Aerosoles",
            "Jabón en Polvo",
            "Jabón en Pan",
            "Esponjas",
            "Escobillones",
            "Cepillos",
            "Secadores",
            "Cabos",
            "Burlete",
            "Bolsas",
            "Envases",
            "Baño",
            "Cocina",
            "Perfumería",
            "Sahumerios",
            "Textiles",
            "Papeles",
            "Repelentes",
            "Insecticidas",
            "Higiene Personal",
            "Jabón Tocador",
            "Jardín",
            "Pileta",
            "Automóvil",
            "Kiosco y Varios",
            "Plásticos"
        ];

        function inferirCategoriaPorNombre(name) {
            const n = (name || '').toUpperCase();
            if (n.includes('OFERTA')) return 'Ofertas Semanales';
            if (n.includes('COMBO')) return 'Combos Emprendedores';
            if (n.includes('SAHUMERIO') || n.includes('AMOGH') || (/\bCONOS?\b/.test(n)) || n.includes('AROMANZA') || n.includes('ILUMINARTE') || n.includes('SAGRADA MADRE') || n.includes('TUK TUK') || n.includes('PORTA SAHUMERIO')) return 'Sahumerios';
            if (n.includes('CLORO') || n.includes('BOYA') || n.includes('ALGUICIDA') || n.includes('CLARIFICANTE') || n.includes('PASTILLA PILETA') || n.includes('PILETA')) return 'Pileta';
            if (n.includes('CESTO') || n.includes('CANASTO') || n.includes('PLASTICO') || n.includes('PLÁSTICO') || n.includes('BROCHE') || n.includes('PALANGANA') || n.includes('BALDE') || n.includes('FUENTON') || n.includes('PALA')) return 'Plásticos';
            if (n.includes('DETERGENTE') || n.includes('DESENGRASANTE') || n.includes('LAVAVAJILLA') || n.includes('COCINA')) return 'Cocina';
            if (n.includes('BAÑO') || n.includes('INODORO') || n.includes('HARPIC') || n.includes('PATO PURIFIC')) return 'Baño';
            if (n.includes('AEROSOL') || n.includes('BLEM') || n.includes('GLADE') || n.includes('POETT AEROSOL')) return 'Aerosoles';
            if (n.includes('JABON EN POLVO') || n.includes('JABÓN EN POLVO') || n.includes('MATIC') || n.includes('GRANBY POLVO') || n.includes('ALA POLVO')) return 'Jabón en Polvo';
            if (n.includes('JABON EN PAN') || n.includes('JABÓN EN PAN') || n.includes('PAN DE LAVAR') || n.includes('JABON BLANCO')) return 'Jabón en Pan';
            if (n.includes('JABON TOCADOR') || n.includes('JABÓN TOCADOR') || n.includes('DOVE') || n.includes('REXONA') || n.includes('LUX') || n.includes('PLUSBELLE')) return 'Jabón Tocador';
            if (n.includes('DENTAL') || n.includes('COLGATE') || n.includes('ALGODON') || n.includes('ALGODÓN') || n.includes('SHAMPOO PLUS') || n.includes('ACONDICIONADOR')) return 'Higiene Personal';
            if (n.includes('CONCENTRADO') || n.includes('PASTA')) return 'Pastas y Concentrados';
            if (n.includes('DILUIR') || n.includes('1+9') || n.includes('1+20') || n.includes('1+50')) return 'Productos para Diluir';
            if (n.includes('AUTO') || n.includes('SILICONA') || n.includes('SHAMPOO AUTO') || n.includes('REVIVIDOR') || n.includes('PINITO')) return 'Automóvil';
            if (n.includes('PAPEL') || n.includes('HIGIENICO') || n.includes('HIGIÉNICO') || n.includes('MORITA') || n.includes('HIGHPEL') || n.includes('MAXISEC') || n.includes('ROLLO COCINA') || n.includes('SERVILLETA')) return 'Papeles';
            if (n.includes('BOLSA') || n.includes('RESIDUO') || n.includes('CONSORCIO') || n.includes('CAMISETA')) return 'Bolsas';
            if (n.includes('ESPONJA') || n.includes('FIBRA') || n.includes('VIRANA')) return 'Esponjas';
            if (n.includes('ESCOBILLON') || n.includes('ESCOBA')) return 'Escobillones';
            if (n.includes('CEPILLO')) return 'Cepillos';
            if (n.includes('SECADOR')) return 'Secadores';
            if (n.includes('CABO') || n.includes('MANGO')) return 'Cabos';
            if (n.includes('BURLETE')) return 'Burlete';
            if (n.includes('ENVAS') || n.includes('BIDON') || n.includes('PULVERIZADOR') || n.includes('GATILLO')) return 'Envases';
            if (n.includes('REPELENTE') || n.includes('OFF') || n.includes('FUYI REPELENTE')) return 'Repelentes';
            if (n.includes('INSECTICIDA') || n.includes('ESPIRAL') || n.includes('RAID') || n.includes('BAYGON')) return 'Insecticidas';
            if (n.includes('JARDIN') || n.includes('JARDÍN') || n.includes('TIERRA') || n.includes('MACETA')) return 'Jardín';
            if (n.includes('PERFUMERIA') || n.includes('PERFUMERÍA') || n.includes('DIFUSOR') || n.includes('AROMATIZADOR')) return 'Perfumería';
            if (n.includes('TRAPO') || n.includes('REJILLA') || n.includes('FRANELA') || n.includes('PERFUMINA') || n.includes('TEXTIL')) return 'Textiles';
            if (n.includes('JABON LIQUIDO') || n.includes('JABÓN LÍQUIDO') || n.includes('SUAVIZANTE') || n.includes('LAVANDINA') || n.includes('DESODORANTE') || n.includes('CERA')) return 'Productos Líquidos';
            return 'Kiosco y Varios';
        }

        const catMap = {
            'OFERTAS': 'Ofertas Semanales',
            'OFERTAS SEMANALES': 'Ofertas Semanales',
            'COMBOS': 'Combos Emprendedores',
            'COMBOS EMPRENDEDORES': 'Combos Emprendedores',
            'PRIMERAS MARCAS': 'Primeras Marcas',
            'AEROSOL': 'Aerosoles',
            'AEROSOLES': 'Aerosoles',
            'SAHUMERIOS': 'Sahumerios',
            'SAHUMERIOS - MINORISTA': 'Sahumerios',
            'SAHUMERIOS & AROMAS': 'Sahumerios',
            'APLICADORES': 'Envases',
            'APLICADORES & GATILLOS': 'Envases',
            'ENVASES': 'Envases',
            'ENVASES & BIDONES': 'Envases',
            'AUTOMOVIL': 'Automóvil',
            'AUTOMÓVIL': 'Automóvil',
            'AUTOMOTOR': 'Automóvil',
            'BAÑO': 'Baño',
            'BAÑO & SANITARIOS': 'Baño',
            'BOLSAS': 'Bolsas',
            'BOLSAS DE RESIDUO & CONSORCIO': 'Bolsas',
            'BURLETE': 'Burlete',
            'BURLETES': 'Burlete',
            'BURLETES & AISLANTES': 'Burlete',
            'CABOS': 'Cabos',
            'CABOS & MANGOS': 'Cabos',
            'CABOS METALICOS': 'Cabos',
            'CEPILLOS': 'Cepillos',
            'CEPILLOS & ESCOBAS': 'Cepillos',
            'ESCOBILLONES': 'Escobillones',
            'ESCOBAS': 'Escobillones',
            'ESCOBAS & CEPILLOS': 'Escobillones',
            'ESCOBILLONES, ESCOBAS & CEPILLOS': 'Escobillones',
            'COCINA': 'Cocina',
            'COCINA & DESENGRASANTES': 'Cocina',
            'CONCENTRADOS': 'Pastas y Concentrados',
            'PASTAS Y CONCENTRADOS': 'Pastas y Concentrados',
            'PASTAS & CONCENTRADOS': 'Pastas y Concentrados',
            'DIFUSORES': 'Perfumería',
            'DIFUSORES & AROMATIZADORES': 'Perfumería',
            'PERFUMERIA': 'Perfumería',
            'PERFUMERÍA': 'Perfumería',
            'PERFUMERÍA & FRAGANCIAS': 'Perfumería',
            'ESPONJAS': 'Esponjas',
            'ESPONJAS & FIBRAS': 'Esponjas',
            'FOCOS': 'Kiosco y Varios',
            'FOCOS & ELECTRICIDAD': 'Kiosco y Varios',
            'HIGIENE PERSONAL': 'Higiene Personal',
            'INSECTICIDAS': 'Insecticidas',
            'INSECTICIDAS & REPELENTES': 'Insecticidas',
            'REPELENTES': 'Repelentes',
            'JABON EN PAN': 'Jabón en Pan',
            'JABÓN EN PAN': 'Jabón en Pan',
            'JABON EN POLVO': 'Jabón en Polvo',
            'JABÓN EN POLVO': 'Jabón en Polvo',
            'JABON TOCADOR': 'Jabón Tocador',
            'JABÓN TOCADOR': 'Jabón Tocador',
            'JARDIN': 'Jardín',
            'JARDÍN': 'Jardín',
            'JARDIN & ESPACIOS VERDES': 'Jardín',
            'KIOSCO': 'Kiosco y Varios',
            'KIOSCO Y VARIOS': 'Kiosco y Varios',
            'KIOSCO & VARIOS': 'Kiosco y Varios',
            'LIQUIDOS': 'Productos Líquidos',
            'LIQUIDOS MINORISTA': 'Productos Líquidos',
            'PRODUCTOS LIQUIDOS': 'Productos Líquidos',
            'PRODUCTOS LÍQUIDOS': 'Productos Líquidos',
            'PRODUCTOS LÍQUIDOS (LIMPIEZA & ROPA)': 'Productos Líquidos',
            'PRODUCTOS PARA DILUIR': 'Productos para Diluir',
            'DILUIR': 'Productos para Diluir',
            'PAPELES': 'Papeles',
            'PAPELES & HIGIENE': 'Papeles',
            'PERFUMINAS': 'Textiles',
            'PERFUMINAS & TEXTILES': 'Textiles',
            'TEXTILES': 'Textiles',
            'PILETA': 'Pileta',
            'CLORO': 'Pileta',
            'CLORO & PILETAS': 'Pileta',
            'PLASTICO': 'Plásticos',
            'PLÁSTICO': 'Plásticos',
            'PLASTICOS': 'Plásticos',
            'PLÁSTICOS': 'Plásticos',
            'PLÁSTICOS & BAZAR': 'Plásticos',
            'SECADORES': 'Secadores',
            'SECADORES DE PISO': 'Secadores',
            'SUAVIZANTES': 'Productos Líquidos',
            'SUAVIZANTES PARA ROPA': 'Productos Líquidos',
            'TOALLITAS': 'Textiles',
            'TOALLITAS HÚMEDAS & PAÑOS': 'Textiles',
            'TOALLITAS HUMEDAS Y PAÑOS': 'Textiles',
            'TRAPO DE PISO': 'Textiles',
            'TRAPOS DE PISO & REJILLAS': 'Textiles',
            'CERA': 'Productos Líquidos',
            'CERAS & PISOS': 'Productos Líquidos',
            'CERAS & CUIDADO DE PISOS': 'Productos Líquidos'
        };

        const productosFormateados = (data || []).filter(p => p.name).map((p, idx) => {
            let cat = (p.category || '').trim();
            if (!cat || cat === 'General' || cat === 'Uncategorized' || cat.includes('SELECCIONA')) {
                cat = inferirCategoriaPorNombre(p.name);
            } else if (catMap[cat.toUpperCase()]) {
                cat = catMap[cat.toUpperCase()];
            } else {
                cat = inferirCategoriaPorNombre(p.name);
            }

            if (!CATEGORIAS_OFICIALES_32.includes(cat)) {
                cat = inferirCategoriaPorNombre(p.name);
            }

            return {
                id: p.id || `prod_${idx}`,
                sku: (p.sku || '').replace(/_ID\d+$/, ''),
                name: p.name,
                price: parseFloat(p.price || 0),
                regular_price: parseFloat(p.price || 0),
                category: cat,
                stock_status: p.stock_status || 'instock',
                status: p.status || 'publish'
            };
        });

        res.json({
            success: true,
            total: productosFormateados.length,
            categorias: CATEGORIAS_OFICIALES_32,
            productos: productosFormateados
        });
    } catch (err) {
        console.error('[CATALOGO PRECIOS ERROR]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Guardar actualización masiva de precios en Supabase y refrescar memoria RAM de Dani
app.post('/api/crm/productos/actualizar-precios-masivo', async (req, res) => {
    try {
        const { actualizaciones, operacion, metodo, valor, motivo, usuario } = req.body;

        if (!Array.isArray(actualizaciones) || actualizaciones.length === 0) {
            return res.status(400).json({ success: false, error: 'No se enviaron productos para actualizar.' });
        }

        let actualizadosCount = 0;
        const errores = [];

        for (const item of actualizaciones) {
            try {
                const nuevoPrecio = parseFloat(item.precio_nuevo);
                if (isNaN(nuevoPrecio) || nuevoPrecio < 0) continue;

                let updateQuery = supabase.from('dec_products').update({
                    price: nuevoPrecio,
                    updated_at: new Date().toISOString()
                });

                if (item.id && !String(item.id).startsWith('cache_')) {
                    updateQuery = updateQuery.eq('id', item.id);
                } else if (item.sku) {
                    updateQuery = updateQuery.eq('sku', item.sku);
                } else {
                    updateQuery = updateQuery.eq('name', item.name);
                }

                const { error: sbErr } = await updateQuery;
                if (!sbErr) {
                    actualizadosCount++;
                } else {
                    errores.push(`${item.name || item.sku}: ${sbErr.message}`);
                }
            } catch (e) {
                errores.push(`${item.name || item.sku}: ${e.message}`);
            }
        }

        // Refrescar memoria RAM inmediatamente para que Dani cotice con los nuevos precios en 0ms
        await refreshProductCatalog();

        const descAuditoria = `Actualización Masiva de Precios: ${actualizadosCount} productos actualizados (${operacion || 'Aumento'} ${valor || ''}${metodo === 'porcentaje' ? '%' : '$'}). Motivo: ${motivo || 'Actualización de lista'}. Por: ${usuario || 'Administrador'}`;
        try {
            await supabase.from('auditoria_eventos').insert([{
                tipo_evento: 'ACTUALIZACION_PRECIOS_MASIVA',
                descripcion: descAuditoria,
                usuario_email: usuario || 'admin@quimicadec.com',
                metadata: { total_actualizados: actualizadosCount, operacion, metodo, valor }
            }]);
        } catch (_) {}

        console.log(`[PRECIOS MASIVOS] ✅ ${descAuditoria}`);

        res.json({
            success: true,
            actualizados: actualizadosCount,
            mensaje: `🎉 ¡Actualización exitosa! Se actualizaron los precios de ${actualizadosCount} productos en Supabase y el catálogo de la IA Dani.`,
            errores: errores.slice(0, 5)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Química DEC CRM API escuchando en puerto ${PORT}`);
});

