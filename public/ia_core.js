/**
 * ia_core.js - Asistente Virtual "Dani" para Química DEC
 * Motor: Google Gemini 2.5 Flash
 * Diseño: Glassmorphism, esquina inferior izquierda
 */

(function () {
    'use strict';

    // Guard de ejecución duplicada
    if (window.DANI_WIDGET_LOADED) return;
    window.DANI_WIDGET_LOADED = true;

    // ---------------------------------------------------------
    // 1. CONFIGURACION DE APIS (Endpoint CRM directo en Render)
    // ---------------------------------------------------------
    var CRM_API_URL = 'https://crm.quimicadec.com/api/whatsapp/incoming-ai';
    var KB_URL = 'https://crm.quimicadec.com/preguntas_frecuentes_ia.md';

    var systemPrompt = '';
    var history = [];

    // Cerebro de respaldo (si no se puede cargar el .md)
    var FALLBACK_BRAIN = 'Sos Dani, asistente virtual oficial de Quimica DEC. Uso el vos rioplatense. Tono: amable, profesional y orientado a ventas mayoristas.\\n\\nREGLAS DE ORO DE TRANSPARENCIA Y PRECIOS:\\n- Respondé SIEMPRE y PRIMERO los precios y la disponibilidad de los productos consultados de forma inmediata.\\n- NUNCA retengas precios ni pidas nombre o teléfono como condición para informar los valores.\\n- JABONES LÍQUIDOS PARA ROPA (SOMOS FABRICANTES DIRECTOS): NO vendemos Skip ni Ariel. Fabricamos nuestras propias líneas: Línea Premium (Violeta, Azul, Verde, Ropa Blanca, Rojo) y Línea Eco Plus (Azul, Verde). Si preguntan por Skip o Ariel, aclará que no trabajamos esas marcas comerciales y pasá de inmediato los precios de nuestras líneas disponibles.\\n- Catalogo y pedidos: [Nuestros Productos](https://quimicadec.com/nuestros-productos/)\\n- Compra minima inicial para activar tu cuenta mayorista: $80.000. Compras posteriores a partir de $2.500 por pedido (si retiras en el local) o a partir de $80.000 (para envios a domicilio locales o nacionales).\\n- Productos liquidos se venden SIN envases\\n- Envios en Entre Rios: Transporte MOSTTO (llega a domicilio)\\n- Resto del pais: Via Cargo y Correo Andreani\\n- Medios de pago: Efectivo y Transferencia bancaria (NO trabajamos con tarjeta de credito)\\n- Horarios: Lunes a viernes 08:30 a 12:45 hs y 16:30 a 19:00 hs. Sabados 09:00 a 12:40 hs\\n- Ubicacion: Avenida Frondizi 815, Concepcion del Uruguay, Entre Ríos\\n- WhatsApp: https://wa.me/5493442586974\\n- No realizamos llamadas ni videollamadas, pero pueden hablar con un representante por el boton de WhatsApp';

    // ---------------------------------------------------------
    // 2. CSS INYECTADO
    // ---------------------------------------------------------
    var CSS = [
        '#dani-widget-root{display:block!important;}', /* Reactivado */
        '#ai-chatbot-btn{',
            'position:fixed!important;',
            'bottom:24px;left:24px;',
            'background:linear-gradient(135deg,#1a3a6b,#0a1628);',
            'color:#f5c400;border-radius:50%;',
            'display:flex;align-items:center;justify-content:center;',
            'width:58px;height:58px;',
            'box-shadow:0 8px 32px rgba(10,22,40,.55);',
            'z-index:99999!important;cursor:pointer;',
            'border:2px solid rgba(245,196,0,.4);',
            'transition:all .3s cubic-bezier(.175,.885,.32,1.275);',
        '}',
        '#ai-chatbot-btn span{',
            'display:flex!important;align-items:center!important;justify-content:center!important;',
            'width:100%!important;height:100%!important;',
            'margin:0!important;padding:0!important;',
            'line-height:1!important;position:static!important;transform:none!important;',
        '}',
        '#ai-chatbot-btn:hover{',
            'transform:scale(1.15) rotate(-5deg);',
            'box-shadow:0 12px 40px rgba(245,196,0,.3);',
            'border-color:#f5c400;',
        '}',
        '#ai-chat-window{',
            'position:fixed;bottom:102px;left:24px;',
            'width:calc(100vw - 48px);max-width:360px;',
            'height:500px;max-height:calc(100vh - 120px);',
            'background:rgba(10,22,40,.9);',
            'backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);',
            'border:1px solid rgba(255,255,255,.1);border-radius:20px;',
            'box-shadow:0 15px 50px rgba(0,0,0,.5);',
            'z-index:99998;display:flex;flex-direction:column;overflow:hidden;',
            'transform:translateY(20px) scale(.95);opacity:0;pointer-events:none;',
            'transition:all .4s cubic-bezier(.16,1,.3,1);',
        '}',
        '#ai-chat-window.dani-active{transform:translateY(0) scale(1);opacity:1;pointer-events:all;}',
        '.dani-header{',
            'background:rgba(255,255,255,.04);',
            'border-bottom:1px solid rgba(255,255,255,.08);',
            'padding:14px 18px;display:flex;align-items:center;justify-content:space-between;',
            'flex-shrink:0;',
        '}',
        '.dani-avatar{',
            'width:38px;height:38px;background:rgba(245,196,0,.1);',
            'border-radius:50%;display:flex;align-items:center;justify-content:center;',
            'color:#f5c400;border:1px solid rgba(245,196,0,.3);flex-shrink:0;',
        '}',
        '.dani-avatar span{',
            'display:flex!important;align-items:center!important;justify-content:center!important;',
            'width:100%!important;height:100%!important;',
            'margin:0!important;padding:0!important;',
            'line-height:1!important;position:static!important;transform:none!important;',
        '}',
        '.dani-name{color:#fff;font-size:.95rem;font-weight:700;margin:0;line-height:1.2;}',
        '.dani-status{color:#4a9fd4;font-size:.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;}',
        '.dani-close{',
            'background:none;border:none;color:rgba(255,255,255,.45);',
            'cursor:pointer;padding:4px;display:flex;border-radius:6px;',
            'transition:color .2s,background .2s;',
        '}',
        '.dani-close:hover{color:#fff;background:rgba(255,255,255,.08);}',
        '.dani-msgs{',
            'flex:1;padding:16px;overflow-y:auto;',
            'display:flex;flex-direction:column;gap:12px;',
        '}',
        '.dani-msgs::-webkit-scrollbar{width:5px;}',
        '.dani-msgs::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:3px;}',
        '.dm{max-width:87%;padding:11px 15px;border-radius:16px;font-size:.88rem;line-height:1.45;word-break:break-word;text-align:left!important;}',
        '.dm-ai{align-self:flex-start;background:rgba(255,255,255,.05);color:#e2e8f0;text-align:left!important;}',
        '.dm-ai a{color:#f5c400;text-decoration:none!important;font-weight:600;transition:color .2s;}',
        '.dm-ai a:hover{color:#ffdb4d;text-decoration:none!important;}',
        '.dm-ai strong{color:#fff;}',
        '.dm-user{align-self:flex-end;background:rgba(74,159,212,.15);color:#fff;text-align:left!important;',
            'border:1px solid rgba(74,159,212,.3);border-bottom-right-radius:4px;}',
        '.dani-input-area{',
            'padding:13px;background:rgba(0,0,0,.2);',
            'border-top:1px solid rgba(255,255,255,.05);',
            'display:flex;gap:8px;align-items:flex-end;flex-shrink:0;',
        '}',
        '.dani-input{',
            'flex:1;background:rgba(255,255,255,.07)!important;',
            'border:1px solid rgba(255,255,255,.15)!important;color:#ffffff!important;',
            'padding:11px 14px;border-radius:12px;font-size:.88rem;',
            'resize:none;max-height:90px;min-height:42px;outline:none;',
            'font-family:inherit;transition:border-color .3s;',
        '}',
        '.dani-input:focus{border-color:rgba(245,196,0,.5)!important;background:rgba(255,255,255,.08)!important;}',
        '.dani-input::placeholder{color:rgba(255,255,255,.3)!important;}',
        '.dani-send{',
            'background:#f5c400;color:#0a1628;border:none;border-radius:12px;',
            'width:42px;height:42px;display:flex;align-items:center;justify-content:center;',
            'cursor:pointer;transition:all .2s;flex-shrink:0;',
        '}',
        '.dani-send:hover{background:#ffdb4d;transform:translateY(-2px);}',
        '.dani-send:disabled{background:rgba(255,255,255,.1);color:rgba(255,255,255,.3);cursor:not-allowed;transform:none;}',
        '.dani-typing{display:flex;gap:5px;padding:14px 16px;',
            'background:rgba(255,255,255,.03);border-radius:16px;align-self:flex-start;border-bottom-left-radius:4px;}',
        '.dani-dot{width:7px;height:7px;background:#4a9fd4;border-radius:50%;animation:daniBounce 1.4s infinite ease-in-out both;}',
        '.dani-dot:nth-child(1){animation-delay:-.32s;}',
        '.dani-dot:nth-child(2){animation-delay:-.16s;}',
        '@keyframes daniBounce{0%,80%,100%{transform:scale(0);opacity:.5;}40%{transform:scale(1);opacity:1;}}',
        '#ai-chatbot-btn .dani-pulse{',
            'position:absolute;top:-3px;right:-3px;width:14px;height:14px;',
            'background:#22c55e;border-radius:50%;border:2px solid #0a1628;',
            'animation:pulse 2s infinite;',
        '}',
        '@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.5;}}',
        '#dani-cta-bubble{',
            'position:fixed!important;bottom:90px;left:24px;',
            'background:rgba(10,22,40,0.96);backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);',
            'border:1px solid rgba(245,196,0,0.45);border-radius:16px;',
            'padding:12px 30px 12px 14px;color:#ffffff;font-size:0.85rem;line-height:1.45;',
            'box-shadow:0 8px 32px rgba(10,22,40,0.65);z-index:99997!important;max-width:280px;',
            'cursor:pointer;transform:translateY(15px);opacity:0;pointer-events:none;',
            'transition:all 0.4s cubic-bezier(0.16,1,0.3,1);font-family:inherit;',
        '}',
        '#dani-cta-bubble.dani-cta-visible{transform:translateY(0);opacity:1;pointer-events:all;}',
        '#dani-cta-bubble::after{',
            'content:"";position:absolute;bottom:-8px;left:20px;',
            'border-width:8px 8px 0;border-style:solid;border-color:rgba(10,22,40,0.96) transparent;',
            'display:block;width:0;',
        '}',
        '#dani-cta-bubble::before{',
            'content:"";position:absolute;bottom:-9px;left:20px;',
            'border-width:8px 8px 0;border-style:solid;border-color:rgba(245,196,0,0.45) transparent;',
            'display:block;width:0;z-index:-1;',
        '}',
        '.dani-cta-close{',
            'position:absolute;top:6px;right:6px;background:none;border:none;',
            'color:rgba(255,255,255,0.55);cursor:pointer;padding:2px;display:flex;',
            'align-items:center;justify-content:center;border-radius:4px;transition:all 0.2s;',
        '}',
        '.dani-cta-close:hover{color:#fff;background:rgba(255,255,255,0.15);}',
        '@media(min-width:768px){',
            '#ai-chatbot-btn{bottom:40px;left:40px;width:68px;height:68px;}',
            '#ai-chatbot-btn span{font-size:32px!important;}',
            '#ai-chat-window{bottom:122px;left:40px;width:390px;height:560px;}',
            '#dani-cta-bubble{bottom:120px;left:40px;max-width:310px;font-size:0.88rem;padding:14px 34px 14px 16px;}',
            '#dani-cta-bubble::after,#dani-cta-bubble::before{left:26px;}',
        '}',
        /* Forzar que el SVG del botón de WhatsApp preexistente sea blanco y visible y no se deforme */
        'a[href*="wa.me"] svg,a[href*="whatsapp.com"] svg{',
            'width:30px!important;height:30px!important;',
            'min-width:30px!important;min-height:30px!important;',
            'max-width:30px!important;max-height:30px!important;',
            'display:block!important;margin:0 auto!important;',
            'aspect-ratio:1/1!important;',
        '}',
        'a[href*="wa.me"] svg path,a[href*="wa.me"] path,',
        'a[href*="whatsapp.com"] svg path,a[href*="whatsapp.com"] path{',
            'fill:#ffffff!important;color:#ffffff!important;stroke:none!important;',
        '}',
        /* Ocultar por completo el widget de Kommo CRM (amoCRM) y su botón de chat */
        '#amo-button-holder,.amo-button-holder,#amo-button,.amo-button,',
        '[id*="amo-button"],[class*="amo-button"],',
        'iframe[src*="amocrm"],iframe[src*="kommo"],',
        'div[class*="crm-plugin"],div[id*="crm-plugin"]{',
            'display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;',
        '}',
        '.dani-history-toggle{',
            'background:rgba(255,255,255,0.06);',
            'border:1px solid rgba(255,255,255,0.12);',
            'color:#cbd5e1;',
            'padding:6px 12px;',
            'border-radius:10px;',
            'font-size:0.75rem;',
            'font-weight:600;',
            'cursor:pointer;',
            'transition:all 0.2s;',
            'margin:6px auto 10px auto;',
            'display:flex;',
            'align-items:center;',
            'gap:6px;',
            'align-self:center;',
        '}',
        '.dani-history-toggle:hover{',
            'background:rgba(245,196,0,0.15);',
            'border-color:rgba(245,196,0,0.4);',
            'color:#f5c400;',
        '}',
        '.dani-history-box{',
            'display:none;',
            'flex-direction:column;',
            'gap:10px;',
            'width:100%;',
            'padding-bottom:10px;',
            'border-bottom:1px dashed rgba(255,255,255,0.15);',
            'margin-bottom:10px;',
        '}',
        '.dani-history-box.dani-history-visible{',
            'display:flex;',
        '}',
        /* Auto-expandir subcategorías en el filtro para eliminar el doble clic */
        'div[class*="subcat"] ul, div[class*="subcat"] div, [class*="otras-subcat"] + div, details[class*="subcat"] > div {',
            'display:block!important;visibility:visible!important;opacity:1!important;',
        '}'
    ].join('');

    // ---------------------------------------------------------
    // 3. HTML DEL WIDGET
    // ---------------------------------------------------------
    var HTML = '<div id="ai-chatbot-btn" title="Hablar con Dani, asistente de Química DEC" style="position:relative">'
             +   '<span class="material-symbols-outlined" style="font-size:28px">smart_toy</span>'
             +   '<div class="dani-pulse"></div>'
             + '</div>'
             + '<div id="ai-chat-window">'
             +   '<div class="dani-header">'
             +     '<div style="display:flex;align-items:center;gap:10px">'
             +       '<div class="dani-avatar"><span class="material-symbols-outlined" style="font-size:20px">smart_toy</span></div>'
             +       '<div>'
             +         '<p class="dani-name">Dani</p>'
             +         '<p class="dani-status">Asistente de Química DEC</p>'
             +       '</div>'
             +     '</div>'
             +     '<button class="dani-close" id="dani-close-btn"><span class="material-symbols-outlined" style="font-size:20px">close</span></button>'
             +   '</div>'
             +   '<div class="dani-msgs" id="dani-msgs">'
             +     '<div class="dm dm-ai">¡Hola! 👋 Soy <strong>Dani</strong>, asistente de Química DEC. ¿En qué te puedo ayudar hoy?</div>'
             +   '</div>'
             +   '<div class="dani-input-area">'
             +     '<textarea id="dani-input" class="dani-input" placeholder="Escribí tu consulta..." rows="1"></textarea>'
             +     '<button id="dani-send" class="dani-send"><span class="material-symbols-outlined" style="font-size:18px">send</span></button>'
             +   '</div>'
             + '</div>'
             + '<div id="dani-cta-bubble">'
             +   '¡Preguntame a mí que te respondo al toque! ⚡ Es súper rápido y, si no sé, ¡te paso con un asesor humano! 😊'
             +   '<button class="dani-cta-close" id="dani-cta-close-btn" title="Cerrar aviso">'
             +     '<span class="material-symbols-outlined" style="font-size:14px;font-weight:bold;">close</span>'
             +   '</button>'
             + '</div>';

    // ---------------------------------------------------------
    // 4. INICIALIZACION
    // ---------------------------------------------------------
    function initDani() {
        // Inyectar estilos
        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        // Inyectar HTML
        var wrap = document.createElement('div');
        wrap.id = 'dani-widget-root';
        wrap.innerHTML = HTML;
        document.body.appendChild(wrap);

        // Corregir botón preexistente de WhatsApp (reemplazar icono genérico por el logo oficial en SVG)
        fixHardcodedWhatsAppButton();
        setTimeout(fixHardcodedWhatsAppButton, 500);
        setTimeout(fixHardcodedWhatsAppButton, 2000);

        var btn   = document.getElementById('ai-chatbot-btn');
        var win   = document.getElementById('ai-chat-window');
        var close = document.getElementById('dani-close-btn');
        var send  = document.getElementById('dani-send');
        var input = document.getElementById('dani-input');
        var msgs  = document.getElementById('dani-msgs');
        var cta   = document.getElementById('dani-cta-bubble');
        var ctaClose = document.getElementById('dani-cta-close-btn');

        if (!btn || !win || !close || !send || !input || !msgs) {
            console.error('Dani: No se encontraron elementos del DOM');
            return;
        }

        // NUNCA auto-abrir la ventana del chat en recargas ni pestañas (siempre empieza cerrada y limpia)
        win.classList.remove('dani-active');

        // Mostrar CTA discreto solo si no fue descartado
        var ctaTimeout = null;
        if (cta && sessionStorage.getItem('dani_cta_dismissed') !== 'true') {
            ctaTimeout = setTimeout(function () {
                if (!win.classList.contains('dani-active')) {
                    cta.classList.add('dani-cta-visible');
                }
            }, 4000);
        }

        // Restaurar historial activo directamente en la ventana de chat para que no se pierda al cambiar de pestaña o navegar
        var savedHistory = localStorage.getItem('dani_chat_history') || sessionStorage.getItem('dani_chat_history');
        if (savedHistory) {
            try {
                var parsed = JSON.parse(savedHistory);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    history = parsed;
                    // Limpiar mensaje por defecto y renderizar toda la conversación previa en vivo
                    msgs.innerHTML = '<div class="dm dm-ai">¡Hola! 👋 Soy <strong>Dani</strong>, asistente de Química DEC. ¿En qué te puedo ayudar hoy?</div>';
                    for (var h = 0; h < parsed.length; h++) {
                        var item = parsed[h];
                        var sender = (item.role === 'model' || item.role === 'assistant') ? 'ai' : 'user';
                        var textContent = (item.parts && item.parts[0] && item.parts[0].text) ? item.parts[0].text : (item.content || '');
                        if (textContent) {
                            var d = document.createElement('div');
                            d.className = 'dm dm-' + sender;
                            d.innerHTML = formatMsgText(textContent);
                            msgs.appendChild(d);
                        }
                    }
                    setTimeout(function() { msgs.scrollTop = msgs.scrollHeight; }, 100);
                }
            } catch (e) {
                history = [];
            }
        }

        // Si el usuario tenía el chat abierto en la pestaña previa, mantenerlo abierto
        if (localStorage.getItem('dani_chat_open') === 'true') {
            win.classList.add('dani-active');
            if (cta) cta.classList.remove('dani-cta-visible');
        } else {
            win.classList.remove('dani-active');
        }

        // Función global para abrir/conmutar el chat desde cualquier parte del sitio
        function openDaniChat(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            var isOpen = win.classList.contains('dani-active');
            if (isOpen) {
                win.classList.remove('dani-active');
                localStorage.setItem('dani_chat_open', 'false');
                sessionStorage.setItem('dani_chat_open', 'false');
            } else {
                win.classList.add('dani-active');
                localStorage.setItem('dani_chat_open', 'true');
                sessionStorage.setItem('dani_chat_open', 'true');
                if (cta) cta.classList.remove('dani-cta-visible');
                if (ctaTimeout) clearTimeout(ctaTimeout);
                setTimeout(function() { input.focus(); }, 100);
            }
        }
        window.openDaniChat = openDaniChat;
        window.toggleDaniChat = openDaniChat;

        // Listeners ultra responsivos para el botón flotante de Dani (click, touch y captura global)
        btn.addEventListener('click', openDaniChat);
        btn.addEventListener('touchend', function(e) {
            openDaniChat(e);
        });
        document.addEventListener('click', function (e) {
            var targetBtn = e.target.closest('#ai-chatbot-btn');
            if (targetBtn) {
                openDaniChat(e);
            }
        }, true);

        close.addEventListener('click', function () {
            win.classList.remove('dani-active');
            localStorage.setItem('dani_chat_open', 'false');
            sessionStorage.setItem('dani_chat_open', 'false');
        });

        // Eventos del CTA Bubble
        if (cta) {
            cta.addEventListener('click', function (e) {
                if (e.target.closest('#dani-cta-close-btn')) return;
                win.classList.add('dani-active');
                sessionStorage.setItem('dani_chat_open', 'true');
                cta.classList.remove('dani-cta-visible');
                if (ctaTimeout) clearTimeout(ctaTimeout);
                setTimeout(function() { input.focus(); }, 100);
            });
        }
        if (ctaClose) {
            ctaClose.addEventListener('click', function (e) {
                e.stopPropagation();
                if (cta) cta.classList.remove('dani-cta-visible');
                if (ctaTimeout) clearTimeout(ctaTimeout);
                sessionStorage.setItem('dani_cta_dismissed', 'true');
            });
        }

        // Auto-resize textarea
        input.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 90) + 'px';
        });

        // Enviar con Enter (sin Shift)
        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                doSend();
            }
        });
        send.addEventListener('click', doSend);

        // Cargar el cerebro (con fallback garantizado)
        loadBrain();
    }

    // ---------------------------------------------------------
    // 5. CARGAR KNOWLEDGE BASE
    // ---------------------------------------------------------
    function loadBrain() {
        fetch(KB_URL)
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            })
            .then(function (txt) {
                systemPrompt = txt;
            })
            .catch(function () {
                systemPrompt = FALLBACK_BRAIN;
            });
    }

    // ---------------------------------------------------------
    // 6. DETECCION DINAMICA DE NOMBRE Y COMERCIO
    // ---------------------------------------------------------
    function extractUserInfo(text) {
        if (!text) return;
        var nameRegexes = [
            /me llamo\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ]{3,}(?:\s+[a-zA-ZáéíóúñÁÉÍÓÚÑ]{3,})*)/i,
            /mi nombre es\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ]{3,}(?:\s+[a-zA-ZáéíóúñÁÉÍÓÚÑ]{3,})*)/i,
            /soy\s+([a-zA-ZáéíóúñÁÉÍÓÚÑ]{3,}(?:\s+[a-zA-ZáéíóúñÁÉÍÓÚÑ]{3,})*)/i
        ];
        
        var storeRegexes = [
            /mi comercio es\s+([a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]{3,})/i,
            /mi comercio se llama\s+([a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]{3,})/i,
            /mi empresa se llama\s+([a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]{3,})/i,
            /mi empresa es\s+([a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]{3,})/i
        ];

        // Intento extraer el nombre
        var nameMatch = null;
        for (var i = 0; i < nameRegexes.length; i++) {
            var m = text.match(nameRegexes[i]);
            if (m && m[1]) {
                nameMatch = m[1].trim();
                break;
            }
        }
        if (nameMatch) {
            // Limpieza por si captura texto extra como "de wil comercio..."
            nameMatch = nameMatch.replace(/\s+de\s+wil\s+comercio.*/i, '');
            nameMatch = nameMatch.replace(/\s+comercio.*/i, '');
            localStorage.setItem('qdec_user_name', nameMatch);
        }

        // Intento extraer el comercio
        // Caso específico para la captura: "wil comercio es el nombre d mi emrpesa"
        var specStoreMatch = text.match(/([a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]{2,})\s+comercio\s+es\s+el\s+nombre\s+d(?:e)?\s+mi\s+em(?:r)?presa/i);
        if (specStoreMatch && specStoreMatch[1]) {
            localStorage.setItem('qdec_store_name', specStoreMatch[1].trim());
        } else {
            for (var j = 0; j < storeRegexes.length; j++) {
                var sm = text.match(storeRegexes[j]);
                if (sm && sm[1]) {
                    localStorage.setItem('qdec_store_name', sm[1].trim());
                    break;
                }
            }
        }
    }

    // ---------------------------------------------------------
    // 7. ENVIO DE MENSAJES
    // ---------------------------------------------------------
    function doSend() {
        var send  = document.getElementById('dani-send');
        var input = document.getElementById('dani-input');
        var text  = input.value.trim();
        if (!text || send.disabled) return;

        // Extraer info de contacto si existe
        extractUserInfo(text);

        appendMsg(text, 'user');
        input.value = '';
        input.style.height = 'auto';
        send.disabled = true;

        var typingId = showTyping();

        callGroq(text)
            .then(function (reply) {
                hideTyping(typingId);
                if (reply) {
                    appendMsg(reply, 'ai');
                }
            })
            .catch(function (err) {
                console.error('Dani principal/Groq error:', err);
                hideTyping(typingId);
                appendMsg('Tuve un problema técnico momentáneo. Podés escribirnos directamente por WhatsApp: https://wa.me/5493442586974', 'ai');
            })
            .finally(function () {
                send.disabled = false;
                input.focus();
            });
    }

    // ---------------------------------------------------------
    // Helper para guardar historial en memoria y persistencia
    // ---------------------------------------------------------
    function pushToHistory(role, text) {
        history.push({ role: role, parts: [{ text: text }] });
        try {
            localStorage.setItem('dani_chat_history', JSON.stringify(history));
            sessionStorage.setItem('dani_chat_history', JSON.stringify(history));
        } catch (e) {
            console.error('Dani: Error al guardar historial en storage', e);
        }
    }

    // ---------------------------------------------------------
    // 8. LLAMADA PRINCIPAL A GROQ API
    // ---------------------------------------------------------
    function callGroq(userMsg) {
        pushToHistory('user', userMsg);

        var brain = systemPrompt || FALLBACK_BRAIN;
        
        // Inyección dinámica de memoria (Nombre del Cliente / Comercio)
        var storedName = localStorage.getItem('qdec_user_name');
        var storedStore = localStorage.getItem('qdec_store_name');
        var memoryPrompt = '';
        if (storedName) {
            memoryPrompt += ' El nombre de tu interlocutor es: ' + storedName + '.';
        }
        if (storedStore) {
            memoryPrompt += ' Su comercio/empresa se llama: ' + storedStore + '.';
        }
        if (memoryPrompt) {
            brain = 'MEMORIA LOCAL:\n' + memoryPrompt + ' Dirigite a él por su nombre de forma fluida y personalizada en cada respuesta.\n\n' + brain;
        }

        // Groq usa formato de mensajes de OpenAI (messages: [{role, content}])
        var messages = [];
        messages.push({ role: 'system', content: brain });

        // Mapear historial al formato OpenAI
        for (var i = 0; i < history.length; i++) {
            var item = history[i];
            var role = (item.role === 'model' || item.role === 'assistant') ? 'assistant' : 'user';
            var txt = (item.parts && item.parts[0] && item.parts[0].text) ? item.parts[0].text : (item.content || '');
            if (txt) {
                messages.push({ role: role, content: txt });
            }
        }

        // Obtener o generar un ID único de sesión persistente para la conversación web
        var sessionId = localStorage.getItem('dani_session_id');
        if (!sessionId) {
            sessionId = 'Web_' + Math.random().toString(36).substring(2, 7) + '_' + Date.now().toString().slice(-6);
            localStorage.setItem('dani_session_id', sessionId);
        }

        var clientUuid = localStorage.getItem('dani_client_uuid') || null;

        var payload = {
            model: 'openai/gpt-oss-120b',
            session_id: sessionId,
            cliente_id: clientUuid,
            messages: messages,
            temperature: 0.4,
            max_tokens: 1000
        };

        return fetch(CRM_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(function (r) {
            if (!r.ok) throw new Error('CRM API HTTP ' + r.status);
            return r.json();
        })
        .then(function (data) {
            if (data.cliente_id) {
                localStorage.setItem('dani_client_uuid', data.cliente_id);
            }
            // Si el bot está pausado, no mostrar mensaje automático
            if (data.bot_pausado) {
                return null;
            }
            // El CRM responde con { choices: [{message:{content:...}}], respuesta_sugerida_ia: ... }
            var reply = '';
            if (data.choices && data.choices.length > 0) {
                reply = data.choices[0].message.content;
            } else if (data.respuesta_sugerida_ia) {
                reply = data.respuesta_sugerida_ia;
            } else {
                throw new Error('CRM: respuesta vacía');
            }
            pushToHistory('model', reply);
            return reply;
        })
        .catch(function (err) {
            console.warn('CRM/Groq error. Reintentando con formato Gemini...', err);
            return callGeminiDirect(userMsg, brain);
        });
    }

    // ---------------------------------------------------------
    // 9. LLAMADA DE RESPALDO (Reintento via CRM con formato Gemini)
    // ---------------------------------------------------------
    function callGeminiDirect(userMsg, brain) {
        var sessionId = localStorage.getItem('dani_session_id');
        if (!sessionId) {
            sessionId = 'Web_' + Math.random().toString(36).substring(2, 7) + '_' + Date.now().toString().slice(-6);
            localStorage.setItem('dani_session_id', sessionId);
        }

        var clientUuid = localStorage.getItem('dani_client_uuid') || null;

        // Enviar en formato contents (Gemini style) al mismo CRM
        var payload = {
            session_id: sessionId,
            cliente_id: clientUuid,
            system_instruction: { parts: [{ text: brain }] },
            contents: history,
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 1000
            }
        };

        return fetch(CRM_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(function (r) {
            if (!r.ok) throw new Error('CRM Fallback HTTP ' + r.status);
            return r.json();
        })
        .then(function (data) {
            if (data.cliente_id) {
                localStorage.setItem('dani_client_uuid', data.cliente_id);
            }
            var reply = '';
            if (data.choices && data.choices.length > 0) {
                reply = data.choices[0].message.content;
            } else if (data.respuesta_sugerida_ia) {
                reply = data.respuesta_sugerida_ia;
            } else if (data.candidates && data.candidates[0]) {
                reply = data.candidates[0].content.parts[0].text;
            } else {
                throw new Error('CRM Fallback: respuesta vacía');
            }
            pushToHistory('model', reply);
            return reply;
        });
    }

    // ---------------------------------------------------------
    // 8. HELPERS DE UI
    // ---------------------------------------------------------
    function appendMsg(text, sender) {
        var msgs = document.getElementById('dani-msgs');
        if (!msgs) return false;
        var d = document.createElement('div');
        d.className = 'dm dm-' + sender;

        var mdLinks = [];
        var rawLinks = [];

        // 0. Auto-completar https:// para enlaces escritos como quimicadec.com/... o www...
        var processedText = text.replace(/(^|[\s>(])((?:www\.|quimicadec\.com)[^\s<)]+)/gi, '$1https://$2');

        // 1. Extraer enlaces Markdown [Label](URL) y reemplazarlos por placeholders
        var tempHtml = processedText.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function(match, label, url) {
            mdLinks.push({ label: label, url: url });
            return '___MDLINK_' + (mdLinks.length - 1) + '___';
        });

        // 2. Extraer URLs crudas y reemplazarlas por placeholders (evitando capturar comillas/paréntesis al final)
        tempHtml = tempHtml.replace(/(https?:\/\/[^\s<)]+)/g, function(match, url) {
            rawLinks.push(url);
            return '___RAWLINK_' + (rawLinks.length - 1) + '___';
        });

        // 3. Parsear negritas (**texto**)
        tempHtml = tempHtml.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // 4. Convertir saltos de línea a <br>
        tempHtml = tempHtml.replace(/\n/g, '<br>');

        // Función para verificar si una URL es la del catálogo de productos
        function isCatalogUrl(url) {
            return /quimicadec\.com\/(nuestros-productos|catalogo)\/?$/i.test(url.trim());
        }

        // Función para verificar si una URL es local (del mismo dominio o relativa)
        function isLocalUrl(url) {
            var clean = url.trim();
            return clean.indexOf('quimicadec.com') !== -1 || clean.startsWith('/') || clean.startsWith('.');
        }

        // 5. Reinsertar enlaces Markdown con el formato adecuado
        tempHtml = tempHtml.replace(/___MDLINK_(\d+)___/g, function(match, index) {
            var link = mdLinks[parseInt(index, 10)];
            var label = link.label;
            var url = link.url;
            if (isCatalogUrl(url)) {
                label = 'Catálogo de Productos';
                url = 'https://quimicadec.com/nuestros-productos/';
            }
            var target = isLocalUrl(url) ? '_self' : '_blank';
            var rel = target === '_blank' ? ' rel="noopener"' : '';
            return '<a href="' + url + '" target="' + target + '"' + rel + '>' + label + '</a>';
        });

        // 6. Reinsertar enlaces crudos
        tempHtml = tempHtml.replace(/___RAWLINK_(\d+)___/g, function(match, index) {
            var url = rawLinks[parseInt(index, 10)];
            var label = url;
            if (isCatalogUrl(url)) {
                label = 'Catálogo de Productos';
                url = 'https://quimicadec.com/nuestros-productos/';
            }
            var target = isLocalUrl(url) ? '_self' : '_blank';
            var rel = target === '_blank' ? ' rel="noopener"' : '';
            return '<a href="' + url + '" target="' + target + '"' + rel + '>' + label + '</a>';
        });

        d.innerHTML = tempHtml;
        msgs.appendChild(d);
        msgs.scrollTop = msgs.scrollHeight;
        return true;
    }

    function showTyping() {
        var msgs = document.getElementById('dani-msgs');
        if (!msgs) return null;
        var d = document.createElement('div');
        var id = 'dani-typing-' + Date.now();
        d.id = id;
        d.className = 'dani-typing';
        d.innerHTML = '<div class="dani-dot"></div><div class="dani-dot"></div><div class="dani-dot"></div>';
        msgs.appendChild(d);
        msgs.scrollTop = msgs.scrollHeight;
        return id;
    }

    function hideTyping(id) {
        if (!id) return;
        var el = document.getElementById(id);
        if (el && el.parentNode) {
            el.parentNode.removeChild(el);
        }
    }

    function fixHardcodedWhatsAppButton() {
        var waLinks = document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp.com"]');
        waLinks.forEach(function(link) {
            var iconSpan = link.querySelector('.material-symbols-outlined');
            if (iconSpan && iconSpan.textContent.trim() === 'chat') {
                link.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30" fill="#ffffff" style="display:block;margin:0 auto;color:#ffffff!important;">'
                               +   '<path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.747 1.451 5.436 0 9.86-4.42 9.864-9.864.002-2.637-1.03-5.118-2.905-6.993-1.876-1.875-4.357-2.904-6.996-2.906-5.442 0-9.869 4.42-9.873 9.865-.001 1.848.482 3.655 1.396 5.228l-.993 3.627 3.765-.987zm11.724-6.666c-.303-.152-1.797-.887-2.075-.988-.278-.102-.48-.152-.683.152-.202.304-.785.988-.962 1.19-.177.203-.355.228-.658.076-1.219-.61-2.111-1.074-2.954-2.518-.225-.387.225-.359.643-1.196.08-.163.04-.304-.02-.455-.06-.152-.48-1.156-.658-1.58-.174-.42-.365-.363-.5-.371-.132-.007-.284-.008-.436-.008-.152 0-.4-.057-.608.175-.208.23-1.21 1.183-1.21 2.887 0 1.704 1.239 3.345 1.41 3.573.172.228 2.44 3.725 5.912 5.228.825.357 1.47.57 1.97.728.828.263 1.58.226 2.176.137.665-.099 1.797-.735 2.05-1.448.254-.713.254-1.325.178-1.448-.076-.123-.278-.203-.581-.355z"/>'
                               + '</svg>';
                link.style.display = 'flex';
                link.style.alignItems = 'center';
                link.style.justifyContent = 'center';
                link.style.color = '#ffffff';
                link.classList.remove('text-transparent');
                link.classList.add('text-white');
            }
        });
    }

    // ---------------------------------------------------------
    // Sincronización en Tiempo Real de Mensajes del Vendedor Humano
    // ---------------------------------------------------------
    var knownVendorMsgTexts = {};
    var daniBootTimestamp = Date.now();
    var firstPollDone = false;

    function pollVendorMessages() {
        try {
            var sessionId = localStorage.getItem('dani_session_id');
            if (!sessionId) return;

            var msgsContainer = document.getElementById('dani-msgs');
            if (!msgsContainer) return;

            var pollUrl = 'https://crm.quimicadec.com/api/crm/chat/mensajes/' + encodeURIComponent(sessionId);

            fetch(pollUrl)
                .then(function (r) {
                    if (!r.ok) return null;
                    return r.json();
                })
                .then(function (data) {
                    if (!data) return;
                    if (data && data.success && Array.isArray(data.mensajes)) {
                        data.mensajes.forEach(function(m) {
                            if (m.emisor === 'vendedor') {
                                var msgTime = m.creado_el ? new Date(m.creado_el).getTime() : 0;
                                // Si es el primer chequeo y el mensaje es viejo, marcarlo como conocido para no duplicar en pantalla
                                if (!firstPollDone && msgTime > 0 && msgTime < (daniBootTimestamp - 15000)) {
                                    knownVendorMsgTexts[m.id] = true;
                                    return;
                                }

                                var cleanTxt = (m.texto || '').replace(/\n?\[BOT PAUSADO\]/g, '').replace(/\n?\[BOT REANUDADO\]/g, '').trim();
                                // Parsear nombre del vendedor si existe tag [VENDEDOR:nombre]
                                var vendorName = 'Asesor Comercial';
                                var nameMatch = cleanTxt.match(/^\[VENDEDOR:([^\]]+)\]/);
                                if (nameMatch) {
                                    vendorName = nameMatch[1].trim();
                                    cleanTxt = cleanTxt.replace(/^\[VENDEDOR:[^\]]+\]/, '').trim();
                                }
                                if (cleanTxt && cleanTxt !== '[CAMBIO DE ESTADO BOT]' && !knownVendorMsgTexts[m.id]) {
                                    var ok = appendMsg('👤 **' + vendorName + ':**\n' + cleanTxt, 'ai');
                                    if (ok) {
                                        knownVendorMsgTexts[m.id] = true;
                                        var win = document.getElementById('ai-chat-window');
                                        if (win && !win.classList.contains('dani-active')) {
                                            win.classList.add('dani-active');
                                        }
                                        pushToHistory('model', '👤 **' + vendorName + ':**\n' + cleanTxt);
                                    }
                                }
                            }
                        });
                        firstPollDone = true;
                    }
                })
                .catch(function (err) {
                    console.error('[Dani Poll] Error:', err.message || err);
                });
        } catch (e) {
            console.error('[Dani Poll] Crash:', e.message);
        }
    }

    // ---------------------------------------------------------
    // 9. ARRANQUE
    // ---------------------------------------------------------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initDani();
            pollVendorMessages();
            setInterval(pollVendorMessages, 3000);
        });
    } else {
        initDani();
        pollVendorMessages();
        setInterval(pollVendorMessages, 3000);
    }

})();
