<?php
/**
 * QUÍMICA DEC — API WPCode v3.4-creator (Auto-Link por SKUs + Banners + Ofertas + Creador y Categorías Oficiales)
 * ====================================================================================================
 * INSTRUCCIONES:
 * 1. WPCode > Editar Snippet de API > PHP Script
 * 2. Borrar todo y Pegar TODO este código v3.4-creator
 * 3. Ubicación: Run Everywhere
 * 4. Activar (ON)
 *
 * ENDPOINTS:
 * - GET  ?qdec_api=ping                         → Test (devuelve version 3.4-creator)
 * - GET  ?qdec_api=search_product&q=...          → Buscar productos
 * - POST ?qdec_api=update_product_details        → Cambiar nombre, precio regular/oferta, pausar/activar, crear nuevo y asignar categoría
 * - POST ?qdec_api=update_homepage_content       → Sincronizar grilla del catálogo web
 * - POST ?qdec_api=upload_image                  → Subir portada o galería
 * - GET  ?qdec_api=get_combos                    → Obtener los 6 combos en vivo
 * - POST ?qdec_api=delete_gallery_image          → Borrar foto individual de combo
 * - POST ?qdec_api=auto_link_combo_gallery       → Vincular fotos existentes de productos por SKUs/Excel
 * - POST ?qdec_api=upload_category_banner        → Subir banner 4:3 para secciones de la Home
 * - POST ?qdec_api=upload_hero_video             → Subir video principal
 * - GET  ?qdec_api=get_ofertas                   → Obtener productos en oferta semanal
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

/* ─── PURGA DE CACHÉ UNIVERSAL ─── */
if ( ! function_exists( 'qdec_purge_caches' ) ) {
    function qdec_purge_caches( $pid = 0 ) {
        // WordPress core
        if ( $pid ) { clean_post_cache( $pid ); }
        if ( function_exists( 'wc_delete_product_transients' ) ) { wc_delete_product_transients( $pid ); }
        delete_transient( 'wc_products_onsale' );
        delete_transient( 'wc_featured_products' );
        delete_transient( 'wc_term_counts' );
        wp_cache_flush();

        // LiteSpeed (todas las versiones — usa Throwable para capturar Error + Exception)
        if ( ! headers_sent() ) { header( 'X-LiteSpeed-Purge: *' ); }
        try {
            if ( class_exists( '\LiteSpeed\Purge' ) ) {
                \LiteSpeed\Purge::purge_all();
            }
        } catch ( \Throwable $e ) {}
        try {
            if ( $pid && class_exists( '\LiteSpeed\Purge' ) ) {
                \LiteSpeed\Purge::purge_post( $pid );
            }
        } catch ( \Throwable $e ) {}
        try {
            if ( class_exists( 'LiteSpeed_Cache_API' ) ) { LiteSpeed_Cache_API::purge_all(); }
        } catch ( \Throwable $e ) {}
        if ( function_exists( 'litespeed_purge_all' ) ) { litespeed_purge_all(); }
        do_action( 'litespeed_purge_all' );
        if ( $pid ) { do_action( 'litespeed_purge_post', $pid ); }

        // Elementor
        if ( class_exists( '\Elementor\Plugin' ) ) {
            try { \Elementor\Plugin::$instance->files_manager->clear_stack(); } catch ( \Throwable $e ) {}
        }
        // Autoptimize
        if ( class_exists( 'autoptimizeCache' ) ) { try { autoptimizeCache::clearall(); } catch ( \Throwable $e ) {} }
        // SiteGround
        if ( function_exists( 'sg_cachepress_purge_cache' ) ) { sg_cachepress_purge_cache(); }
        // WP Super Cache
        if ( function_exists( 'wp_cache_clear_cache' ) ) { wp_cache_clear_cache(); }
        // W3 Total Cache
        if ( function_exists( 'w3tc_flush_all' ) ) { w3tc_flush_all(); }

        // Purga HTTP directa a LiteSpeed (trigger nativo del plugin)
        $purge_headers = array( 'X-LiteSpeed-Purge' => '*' );
        $purge_opts = array( 'timeout' => 3, 'sslverify' => false, 'headers' => $purge_headers );
        
        // Purgar la URL del producto
        if ( $pid ) {
            $url = get_permalink( $pid );
            if ( $url ) { wp_remote_get( $url, $purge_opts ); }
        }
        // Purgar páginas principales
        wp_remote_get( home_url( '/' ), $purge_opts );
        wp_remote_get( home_url( '/catalogo/' ), $purge_opts );
        wp_remote_get( home_url( '/tienda/' ), $purge_opts );
        
        // Marcar todas las URLs del sitio como stale (fuerza re-generación)
        if ( function_exists( 'litespeed_purge_url' ) && $pid ) {
            $url = get_permalink( $pid );
            if ( $url ) { litespeed_purge_url( $url ); }
        }
    }
}

/* ─── HELPERS ─── */
if ( ! function_exists( 'qdec_json_exit' ) ) {
    function qdec_json_exit( $data ) {
        // Limpiar cualquier output previo (HTML de tema/plugins)
        while ( ob_get_level() > 0 ) { ob_end_clean(); }
        if ( ! headers_sent() ) {
            header( 'Content-Type: application/json; charset=utf-8' );
            header( 'Access-Control-Allow-Origin: *' );
            header( 'Access-Control-Allow-Methods: GET, POST, OPTIONS' );
            header( 'Access-Control-Allow-Headers: Content-Type, Authorization' );
        }
        echo wp_json_encode( $data );
        exit;
    }
}

if ( ! function_exists( 'qdec_get_param' ) ) {
    function qdec_get_param( $key, $default = '' ) {
        // Lee de GET, POST y JSON body
        if ( isset( $_GET[$key] ) ) return sanitize_text_field( $_GET[$key] );
        if ( isset( $_POST[$key] ) ) return sanitize_text_field( $_POST[$key] );
        // JSON body (cached)
        static $json_body = null;
        if ( $json_body === null ) {
            $raw = file_get_contents( 'php://input' );
            $json_body = $raw ? json_decode( $raw, true ) : array();
            if ( ! is_array( $json_body ) ) $json_body = array();
        }
        if ( ! isset( $json_body[$key] ) ) return $default;
        // IMPORTANTE: NO sanitizar campos binarios como image_base64 o html_content
        // sanitize_text_field() corrompe Base64 y HTML al eliminar/alterar caracteres
        $no_sanitize = array( 'image_base64', 'html_content' );
        if ( in_array( $key, $no_sanitize, true ) ) {
            return $json_body[$key]; // raw, sin sanitizar
        }
        return sanitize_text_field( $json_body[$key] );
    }
}

/* ─── MAIN ROUTER ─── */
if ( ! function_exists( 'qdec_api_router_v3' ) ) {
    add_action( 'wp_loaded', 'qdec_api_router_v3' );

    function qdec_api_router_v3() {
        if ( ! isset( $_GET['qdec_api'] ) ) return;

        $action = sanitize_text_field( $_GET['qdec_api'] );

        // CORS preflight
        if ( $_SERVER['REQUEST_METHOD'] === 'OPTIONS' ) {
            header( 'Access-Control-Allow-Origin: *' );
            header( 'Access-Control-Allow-Methods: GET, POST, OPTIONS' );
            header( 'Access-Control-Allow-Headers: Content-Type, Authorization' );
            status_header( 200 );
            exit;
        }

        // Buffer output para evitar que temas/plugins contaminen la respuesta JSON
        ob_start();

        switch ( $action ) {

            case 'ping':
                qdec_json_exit( array( 'success' => true, 'version' => '3.4-creator', 'time' => current_time( 'mysql' ) ) );
                break;

            case 'update_product_details':
                qdec_handle_update_product();
                break;

            case 'search_product':
                qdec_handle_search_product();
                break;

            case 'update_homepage_content':
                qdec_handle_update_homepage_content();
                break;

            case 'upload_image':
                qdec_handle_upload_image();
                break;

            case 'get_combos':
                qdec_handle_get_combos();
                break;

            case 'delete_gallery_image':
                qdec_handle_delete_gallery_image();
                break;

            case 'auto_link_combo_gallery':
                qdec_handle_auto_link_combo_gallery();
                break;

            case 'upload_category_banner':
                qdec_handle_upload_category_banner();
                break;

            case 'upload_hero_video':
                qdec_handle_upload_hero_video();
                break;

            case 'get_ofertas':
                qdec_handle_get_ofertas();
                break;

            default:
                return;
        }
    }
}

/* ─── ENDPOINT: UPDATE PRODUCT DETAILS (ACTUALIZAR / CREAR Y CATEGORIZAR) ─── */
if ( ! function_exists( 'qdec_handle_update_product' ) ) {
    function qdec_handle_update_product() {
        $secret = qdec_get_param( 'secret_key' );
        if ( $secret !== 'qdec_crm_sec_2026' ) {
            status_header( 403 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Clave de seguridad inválida.' ) );
        }

        $sku  = qdec_get_param( 'sku' );
        $sku  = trim( preg_replace( '/^sku:\s*/i', '', $sku ) );
        $name = qdec_get_param( 'name' );
        $regular_price = qdec_get_param( 'regular_price' );
        $sale_price    = qdec_get_param( 'sale_price' );
        $category      = qdec_get_param( 'category' );
        $status        = qdec_get_param( 'status' );
        $stock_status  = qdec_get_param( 'stock_status' );
        $changes       = array();

        if ( ! $sku ) {
            qdec_json_exit( array( 'success' => false, 'error' => 'SKU es requerido.' ) );
        }

        $pid = wc_get_product_id_by_sku( $sku );
        
        // Fallback: si no se encontró por SKU exacto, buscar por ID en metadata o post_name
        if ( ! $pid && preg_match( '/_ID(\d+)$/i', $sku, $m ) ) {
            $pid = intval( $m[1] );
        }

        if ( ! $pid ) {
            // Intentar buscar producto padre si el SKU tiene sufijo de variación
            $parts = explode( '-', $sku );
            if ( count( $parts ) > 3 ) {
                $possible_parent_sku = implode( '-', array_slice( $parts, 0, count( $parts ) - 1 ) );
                $pid = wc_get_product_id_by_sku( $possible_parent_sku );
            }
        }

        // AUTO-CREACIÓN DE PRODUCTO SIMPLE EN WOOCOMMERCE SI NO EXISTE
        if ( ! $pid ) {
            $new_post_id = wp_insert_post( array(
                'post_title'   => $name ?: "Producto {$sku}",
                'post_name'    => sanitize_title( $name ?: "producto-{$sku}" ),
                'post_status'  => $status && in_array( $status, array('publish', 'draft') ) ? $status : 'publish',
                'post_type'    => 'product'
            ) );

            if ( $new_post_id && ! is_wp_error( $new_post_id ) ) {
                $pid = $new_post_id;
                wp_set_object_terms( $pid, 'simple', 'product_type' );
                update_post_meta( $pid, '_sku', $sku );
                update_post_meta( $pid, '_visibility', 'visible' );
                update_post_meta( $pid, '_stock_status', $stock_status ?: 'instock' );
                $changes[] = "nuevo producto creado (ID: {$pid})";
            } else {
                qdec_json_exit( array( 'success' => false, 'error' => "Producto con SKU {$sku} no encontrado en WooCommerce y no se pudo auto-crear." ) );
            }
        }

        $product = wc_get_product( $pid );
        if ( ! $product ) {
            qdec_json_exit( array( 'success' => false, 'error' => "Producto ID {$pid} encontrado pero WooCommerce no pudo cargarlo." ) );
        }

        if ( $name ) {
            $product->set_name( $name );
            $changes[] = "nombre → {$name}";
            wp_update_post( array(
                'ID'         => $pid,
                'post_title' => $name,
                'post_name'  => sanitize_title( $name )
            ) );
            update_post_meta( $pid, '_qdec_last_name_update', $name );
        }

        // Asignación de Categoría Oficial (si fue provista)
        if ( $category ) {
            $cat_term = get_term_by( 'name', $category, 'product_cat' );
            if ( ! $cat_term ) {
                $cat_term = get_term_by( 'slug', sanitize_title( $category ), 'product_cat' );
            }
            if ( $cat_term ) {
                wp_set_object_terms( $pid, array( (int) $cat_term->term_id ), 'product_cat' );
                $changes[] = "categoría → {$cat_term->name}";
            }
        }

        if ( $status && in_array( $status, array( 'publish', 'draft', 'private' ) ) ) {
            $product->set_status( $status );
            $changes[] = "estado → {$status}";
        }
        if ( $stock_status && in_array( $stock_status, array( 'instock', 'outofstock' ) ) ) {
            $product->set_stock_status( $stock_status );
            $changes[] = "visibilidad stock → {$stock_status}";
        }

        // 1. SI ES UN PRODUCTO VARIABLE (PADRE CON VARIACIONES): Actualizar todas sus variaciones hijas
        if ( $product->is_type( 'variable' ) ) {
            $children = $product->get_children();
            $updated_children = 0;
            foreach ( $children as $child_id ) {
                $child = wc_get_product( $child_id );
                if ( $child ) {
                    if ( $regular_price !== '' ) {
                        $child->set_regular_price( $regular_price );
                        $child->set_price( $sale_price !== '' ? $sale_price : $regular_price );
                        update_post_meta( $child_id, '_regular_price', $regular_price );
                        update_post_meta( $child_id, '_price', $sale_price !== '' ? $sale_price : $regular_price );
                    }
                    if ( $sale_price !== '' ) {
                        $child->set_sale_price( $sale_price );
                        update_post_meta( $child_id, '_sale_price', $sale_price );
                    }
                    if ( $stock_status ) {
                        $child->set_stock_status( $stock_status );
                    }
                    $child->save();
                    clean_post_cache( $child_id );
                    $updated_children++;
                }
            }
            if ( $regular_price !== '' ) $changes[] = "precio regular ({$updated_children} variaciones) → {$regular_price}";
            if ( $sale_price !== '' )    $changes[] = "precio oferta ({$updated_children} variaciones) → {$sale_price}";
            
            $product->save();
            WC_Product_Variable::sync( $pid );
            wc_delete_product_transients( $pid );
            qdec_purge_caches( $pid );
        }
        // 2. SI ES UNA VARIACIÓN INDIVIDUAL
        else if ( $product->is_type( 'variation' ) ) {
            if ( $regular_price !== '' ) {
                $product->set_regular_price( $regular_price );
                $product->set_price( $sale_price !== '' ? $sale_price : $regular_price );
                update_post_meta( $pid, '_regular_price', $regular_price );
                update_post_meta( $pid, '_price', $sale_price !== '' ? $sale_price : $regular_price );
                $changes[] = "precio regular → {$regular_price}";
            }
            if ( $sale_price !== '' ) {
                $product->set_sale_price( $sale_price );
                update_post_meta( $pid, '_sale_price', $sale_price );
                $changes[] = "precio oferta → {$sale_price}";
            }
            $product->save();
            clean_post_cache( $pid );

            $parent_id = $product->get_parent_id();
            if ( $parent_id ) {
                // Sincronizar también si hay variaciones duplicadas o hermanas con mismo atributo
                $parent_obj = wc_get_product( $parent_id );
                if ( $parent_obj && $parent_obj->is_type( 'variable' ) ) {
                    $attr_vals = $product->get_attributes();
                    $siblings = $parent_obj->get_children();
                    foreach ( $siblings as $sib_id ) {
                        if ( $sib_id != $pid ) {
                            $sib = wc_get_product( $sib_id );
                            if ( $sib && $sib->get_attributes() == $attr_vals ) {
                                if ( $regular_price !== '' ) {
                                    $sib->set_regular_price( $regular_price );
                                    $sib->set_price( $sale_price !== '' ? $sale_price : $regular_price );
                                    update_post_meta( $sib_id, '_regular_price', $regular_price );
                                    update_post_meta( $sib_id, '_price', $sale_price !== '' ? $sale_price : $regular_price );
                                }
                                $sib->save();
                                clean_post_cache( $sib_id );
                            }
                        }
                    }
                    WC_Product_Variable::sync( $parent_id );
                    wc_delete_product_transients( $parent_id );
                    qdec_purge_caches( $parent_id );
                }
            }
            qdec_purge_caches( $pid );
        }
        // 3. PRODUCTO SIMPLE ESTÁNDAR
        else {
            if ( $regular_price !== '' ) {
                $product->set_regular_price( $regular_price );
                $product->set_price( $sale_price !== '' ? $sale_price : $regular_price );
                update_post_meta( $pid, '_regular_price', $regular_price );
                update_post_meta( $pid, '_price', $sale_price !== '' ? $sale_price : $regular_price );
                $changes[] = "precio regular → {$regular_price}";
            }
            if ( $sale_price !== '' ) {
                $product->set_sale_price( $sale_price );
                update_post_meta( $pid, '_sale_price', $sale_price );
                $changes[] = "precio oferta → {$sale_price}";
            }
            $product->save();
            qdec_purge_caches( $pid );
        }

        qdec_json_exit( array(
            'success' => true,
            'message' => "Producto {$sku} (ID: {$pid}) actualizado: " . implode( ', ', $changes ),
            'pid'     => $pid,
            'name'    => $name ?: $product->get_name(),
            'type'    => $product->get_type(),
            'cache_purged' => true
        ) );
    }
}

/* ─── NORMALIZADOR DE BÚSQUEDA WOOCOMMERCE ─── */
if ( ! function_exists( 'qdec_normalizar_termino_busqueda' ) ) {
    function qdec_normalizar_termino_busqueda( $term ) {
        if ( ! $term ) return $term;
        $term = preg_replace( '/\blitros?\b/i', 'LT', $term );
        $term = preg_replace( '/\blts?\b/i',    'LT', $term );
        return trim( $term );
    }
}

if ( ! is_admin() ) {
    add_action( 'pre_get_posts', function( $query ) {
        if ( ! is_admin() && $query->is_main_query() && $query->is_search() ) {
            $s = $query->get( 's' );
            if ( $s ) {
                $norm = qdec_normalizar_termino_busqueda( $s );
                if ( $norm !== $s ) {
                    $query->set( 's', $norm );
                }
            }
        }
    } );

    // ─── OCULTAR PANEL DE CATEGORÍAS EN TODO EL SITIO Y FIX RESPONSIVE MÓVIL ───
    add_action( 'wp_head', function() {
        echo '<style>
/* Ajuste de desbordamiento horizontal en móvil */
html, body {
    max-width: 100vw !important;
    overflow-x: hidden !important;
}

/* Ocultar el acordeón "MARCAS Y SUBCATEGORÍAS DISPONIBLES" no deseado */
.woocommerce-widget-layered-nav,
.widget_layered_nav,
.wc-block-product-filter,
.wc-block-attribute-filter,
.widget.wc-block-attribute-filter-widget,
ul.wc-layered-nav-list,
.woocommerce-widget-layered-nav-list,
.widget_product_categories,
.qdec-search-filter-accordion,
[class*="marcas-subcat"],
[class*="subcategorias-disponibles"],
[class*="filter-widget"],
details.wc-block-attribute-filter {
    display: none !important;
}

/* Legibilidad en el formulario de valoraciones / reseñas sobre fondo oscuro */
#reviews,
#review_form,
.comment-respond,
.comment-reply-title,
.comment-form label,
.comment-form-comment label,
.comment-form-author label,
.comment-form-email label,
.stars a,
p.stars span a,
.woocommerce-review-link {
    color: #ffffff !important;
}

.comment-form input[type="text"],
.comment-form input[type="email"],
.comment-form textarea {
    background-color: rgba(255, 255, 255, 0.08) !important;
    color: #ffffff !important;
    border: 1px solid rgba(255, 255, 255, 0.25) !important;
    border-radius: 8px !important;
}

/* Ajuste de imágenes de producto en móvil */
.woocommerce-product-gallery,
.woocommerce-product-gallery img {
    max-width: 100% !important;
    height: auto !important;
}
</style>';
    } );
}


/* ─── PASO 2: CORRECCIÓN DE CATEGORÍA PAÑO MICROFIBRA (ID 1327) ─── */
add_action( 'init', function() {
    if ( is_admin() || wp_doing_ajax() ) return;
    static $fixed = false;
    if ( $fixed ) return;
    $fixed = true;

    $terms = wp_get_post_terms( 1327, 'product_cat', array( 'fields' => 'names' ) );
    if ( is_array( $terms ) && ( empty( $terms ) || in_array( 'Uncategorized', $terms, true ) || in_array( 'Sin categoría', $terms, true ) ) ) {
        $term = get_term_by( 'name', 'TEXTILES', 'product_cat' );
        if ( ! $term ) {
            $term = get_term_by( 'name', 'PAPELES', 'product_cat' );
        }
        if ( $term ) {
            wp_set_object_terms( 1327, array( (int) $term->term_id ), 'product_cat' );
        }
    }
} );

/* ─── PASO 3: ORDENAMIENTO DE VARIACIONES DE MENOR A MAYOR (1 LT -> 200 LT) ─── */
add_filter( 'woocommerce_get_available_variations', function( $variations ) {
    if ( ! is_array( $variations ) || empty( $variations ) ) return $variations;

    usort( $variations, function( $a, $b ) {
        $get_volume = function( $var_obj ) {
            $attrs = isset( $var_obj['attributes'] ) && is_array( $var_obj['attributes'] ) ? implode( ' ', $var_obj['attributes'] ) : '';
            $desc  = isset( $var_obj['variation_description'] ) ? $var_obj['variation_description'] : '';
            $full  = $attrs . ' ' . $desc;

            if ( preg_match( '/(\d+(?:\.\d+)?)\s*(?:LT|L|LITROS?|KG|GR|G|ML)\b/i', $full, $m ) ) {
                $num = floatval( $m[1] );
                if ( preg_match( '/(ML|GR|G)\b/i', $full ) ) {
                    $num = $num / 1000;
                }
                return $num;
            }
            return 999999;
        };

        $va = $get_volume( $a );
        $vb = $get_volume( $b );

        if ( $va == $vb ) return 0;
        return ( $va < $vb ) ? -1 : 1;
    } );

    return $variations;
} );

/* ─── ENDPOINT: SEARCH PRODUCT ─── */
if ( ! function_exists( 'qdec_handle_search_product' ) ) {
    function qdec_handle_search_product() {
        $q = qdec_get_param( 'q' );
        $q = preg_replace( '/^sku:\s*/i', '', $q );
        $q = qdec_normalizar_termino_busqueda( $q );

        if ( ! $q || strlen( $q ) < 2 ) {
            qdec_json_exit( array( 'success' => true, 'count' => 0, 'products' => array() ) );
        }

        $prods = array();

        // Buscar por SKU primero
        $pid = wc_get_product_id_by_sku( $q );
        if ( $pid ) {
            $p = wc_get_product( $pid );
            if ( $p ) {
                $img_id  = $p->get_image_id();
                $img_url = $img_id ? wp_get_attachment_url( $img_id ) : '';
                $prods[] = array(
                    'id'            => $p->get_id(),
                    'name'          => $p->get_name(),
                    'sku'           => $p->get_sku(),
                    'regular_price' => $p->get_regular_price(),
                    'image_url'     => $img_url
                );
            }
        }

        // Búsqueda por título
        if ( count( $prods ) < 10 ) {
            $args = array(
                'post_type'      => array( 'product', 'product_variation' ),
                'post_status'    => 'publish',
                'posts_per_page' => 15,
                's'              => $q
            );
            $query = new WP_Query( $args );
            if ( $query->have_posts() ) {
                while ( $query->have_posts() ) {
                    $query->the_post();
                    $p_id = get_the_ID();
                    if ( $pid && $p_id === $pid ) continue;
                    $p = wc_get_product( $p_id );
                    if ( $p ) {
                        // Excluir Magistral Azul obsoleto
                        $sku_up  = strtoupper( $p->get_sku() ?: '' );
                        $name_up = strtoupper( $p->get_name() ?: '' );
                        $price_v = floatval( $p->get_regular_price() ?: 0 );
                        if ( strpos( $sku_up, 'QD-DTRG-1320' ) !== false || ( strpos( $name_up, 'MAGISTRAL AZUL' ) !== false && $price_v < 1000 ) ) {
                            continue;
                        }

                        $img_id  = $p->get_image_id();
                        $img_url = $img_id ? wp_get_attachment_url( $img_id ) : '';
                        $prods[] = array(
                            'id'            => $p->get_id(),
                            'name'          => $p->get_name(),
                            'sku'           => $p->get_sku() ?: 'QD-ID-' . $p->get_id(),
                            'regular_price' => $p->get_regular_price(),
                            'image_url'     => $img_url
                        );
                    }
                }
                wp_reset_postdata();
            }
        }

        qdec_json_exit( array( 'success' => true, 'count' => count( $prods ), 'products' => $prods ) );
    }
}

/* ─── ENDPOINT: UPDATE HOMEPAGE CONTENT ─── */
if ( ! function_exists( 'qdec_handle_update_homepage_content' ) ) {
    function qdec_handle_update_homepage_content() {
        if ( $_SERVER['REQUEST_METHOD'] !== 'POST' ) {
            status_header( 405 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Método no permitido. Usar POST.' ) );
        }

        $secret = qdec_get_param( 'secret_key' );
        if ( $secret !== 'qdec_crm_sec_2026' ) {
            status_header( 403 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Clave de seguridad inválida.' ) );
        }

        $raw = file_get_contents( 'php://input' );
        $json = json_decode( $raw, true );
        $content = isset( $json['html_content'] ) ? $json['html_content'] : '';

        if ( ! $content ) {
            status_header( 400 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Se requiere el parámetro html_content.' ) );
        }

        $front_page_id = isset( $json['page_id'] ) ? intval( $json['page_id'] ) : 0;
        if ( ! $front_page_id && ! empty( $json['slug'] ) ) {
            $p = get_page_by_path( trim( $json['slug'] ) );
            if ( $p ) { $front_page_id = $p->ID; }
        }
        if ( ! $front_page_id ) {
            $front_page_id = 2271;
        }

        // Desactivar filtros de sanitización para preservar HTML y scripts intactos
        remove_filter( 'content_save_pre', 'wp_filter_post_kses' );
        remove_filter( 'content_filtered_save_pre', 'wp_filter_post_kses' );

        global $wpdb;
        $updated = $wpdb->update(
            $wpdb->posts,
            array( 'post_content' => $content ),
            array( 'ID' => $front_page_id ),
            array( '%s' ),
            array( '%d' )
        );

        if ( false !== $updated ) {
            delete_transient( 'wc_products_onsale' );
            qdec_purge_caches( $front_page_id );
            qdec_json_exit( array(
                'success' => true,
                'message' => "Página 'Nuestros Productos' (ID {$front_page_id}) actualizada con éxito en WordPress.",
                'page_id' => $front_page_id
            ) );
        } else {
            status_header( 500 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Error al actualizar la base de datos de WordPress.' ) );
        }
    }
}

/* ─── ENDPOINT: UPLOAD IMAGE ─── */
if ( ! function_exists( 'qdec_handle_upload_image' ) ) {
    function qdec_handle_upload_image() {
        if ( $_SERVER['REQUEST_METHOD'] !== 'POST' ) {
            status_header( 405 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Método no permitido. Usar POST.' ) );
        }

        $secret = qdec_get_param( 'secret_key' );
        if ( $secret !== 'qdec_crm_sec_2026' ) {
            status_header( 403 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Clave de seguridad inválida.' ) );
        }

        $sku          = qdec_get_param( 'sku' );
        $sku          = trim( preg_replace( '/^sku:\s*/i', '', $sku ) );
        $product_id   = intval( qdec_get_param( 'product_id', '0' ) );
        $image_base64 = qdec_get_param( 'image_base64' );
        $image_url    = qdec_get_param( 'image_url' );
        $filename     = qdec_get_param( 'filename', 'producto_qdec_' . time() . '.jpg' );
        $filename     = sanitize_file_name( $filename );

        if ( ! $product_id && $sku ) {
            $product_id = wc_get_product_id_by_sku( $sku );
        }
        if ( ! $product_id ) {
            status_header( 444 );
            qdec_json_exit( array( 'success' => false, 'error' => "No se encontró producto con SKU '{$sku}'." ) );
        }

        require_once( ABSPATH . 'wp-admin/includes/image.php' );
        require_once( ABSPATH . 'wp-admin/includes/file.php' );
        require_once( ABSPATH . 'wp-admin/includes/media.php' );

        $attach_id = 0;
        $final_url = '';

        if ( $image_base64 ) {
            $type = 'jpg';
            if ( preg_match( '/^data:image\/(\w+);base64,/', $image_base64, $m ) ) {
                $image_base64 = substr( $image_base64, strpos( $image_base64, ',' ) + 1 );
                $type = strtolower( $m[1] );
                if ( ! in_array( $type, array( 'jpg', 'jpeg', 'gif', 'png', 'webp' ) ) ) $type = 'jpg';
            }

            $decoded = base64_decode( $image_base64 );
            if ( $decoded === false ) {
                status_header( 400 );
                qdec_json_exit( array( 'success' => false, 'error' => 'Base64 inválido.' ) );
            }

            if ( pathinfo( $filename, PATHINFO_EXTENSION ) === '' ) $filename .= '.' . $type;

            $upload = wp_upload_bits( $filename, null, $decoded );
            if ( $upload['error'] ) {
                status_header( 500 );
                qdec_json_exit( array( 'success' => false, 'error' => 'Error al guardar: ' . $upload['error'] ) );
            }

            $file_path = $upload['file'];
            $final_url = $upload['url'];
            $file_type = wp_check_filetype( $filename, null );

            $attach_id = wp_insert_attachment( array(
                'post_mime_type' => $file_type['type'],
                'post_title'     => sanitize_file_name( $filename ),
                'post_content'   => '',
                'post_status'    => 'inherit'
            ), $file_path, $product_id );

            wp_update_attachment_metadata( $attach_id, wp_generate_attachment_metadata( $attach_id, $file_path ) );

        } elseif ( $image_url ) {
            $tmp = download_url( $image_url );
            if ( is_wp_error( $tmp ) ) {
                status_header( 400 );
                qdec_json_exit( array( 'success' => false, 'error' => 'No se pudo descargar la imagen.' ) );
            }

            $attach_id = media_handle_sideload( array( 'name' => basename( $image_url ), 'tmp_name' => $tmp ), $product_id );
            if ( is_wp_error( $attach_id ) ) {
                @unlink( $tmp );
                status_header( 500 );
                qdec_json_exit( array( 'success' => false, 'error' => $attach_id->get_error_message() ) );
            }
            $final_url = wp_get_attachment_url( $attach_id );
        } else {
            status_header( 400 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Se requiere image_base64 o image_url.' ) );
        }

        $mode = qdec_get_param( 'mode', 'auto' ); // 'auto', 'featured', 'gallery', 'replace', 'clear_gallery'
        
        if ( $mode === 'clear_gallery' || $mode === 'replace_gallery' ) {
            update_post_meta( $product_id, '_product_image_gallery', '' );
        }

        $existing_thumb = get_post_thumbnail_id( $product_id );

        if ( $mode === 'featured' || $mode === 'replace' || ( $mode === 'auto' && ! $existing_thumb ) ) {
            set_post_thumbnail( $product_id, $attach_id );
        } else {
            // Agregar explícitamente a la galería de WooCommerce
            $gallery_ids = get_post_meta( $product_id, '_product_image_gallery', true );
            $gallery_arr = $gallery_ids ? array_filter( explode( ',', $gallery_ids ) ) : array();
            if ( ! in_array( $attach_id, $gallery_arr ) ) {
                $gallery_arr[] = $attach_id;
                update_post_meta( $product_id, '_product_image_gallery', implode( ',', $gallery_arr ) );
            }
        }

        // Asegurar que el objeto WC guarde los cambios de la galería
        $wc_prod = wc_get_product( $product_id );
        if ( $wc_prod ) {
            $wc_prod->save();
        }

        qdec_purge_caches( $product_id );

        qdec_json_exit( array(
            'success'       => true,
            'message'       => $existing_thumb ? 'Imagen agregada a la galería del producto con éxito.' : 'Imagen principal asignada con éxito.',
            'product_id'    => $product_id,
            'sku'           => $sku,
            'attachment_id' => $attach_id,
            'image_url'     => $final_url,
            'is_gallery'    => (bool)$existing_thumb,
            'cache_purged'  => true
        ) );
    }
}

/* ─── ENDPOINT: GET COMBOS DETAILS ─── */
if ( ! function_exists( 'qdec_handle_get_combos' ) ) {
    function qdec_handle_get_combos() {
        $combo_skus = array(
            'QD-CMB-PST-001',
            'QD-CMB-PST-002',
            'QD-CMB-EMP-001',
            'QD-CMB-EMP-002',
            'QD-CMB-EMP-003',
            'QD-CMB-EMP-004'
        );

        $combos = array();
        foreach ( $combo_skus as $sku ) {
            $pid = wc_get_product_id_by_sku( $sku );
            if ( ! $pid ) continue;
            $p = wc_get_product( $pid );
            if ( ! $p ) continue;

            $feat_id  = $p->get_image_id();
            $feat_url = $feat_id ? wp_get_attachment_url( $feat_id ) : '';

            $gallery_ids  = $p->get_gallery_image_ids();
            $gallery_urls = array();
            $gallery_items = array();

            if ( $feat_id && $feat_url ) {
                $gallery_items[] = array(
                    'id'       => $feat_id,
                    'url'      => $feat_url,
                    'type'     => 'featured',
                    'type_lbl' => 'Portada Principal'
                );
            }

            if ( is_array( $gallery_ids ) ) {
                foreach ( $gallery_ids as $g_id ) {
                    $url = wp_get_attachment_url( $g_id );
                    if ( $url ) {
                        $gallery_urls[] = $url;
                        $gallery_items[] = array(
                            'id'       => intval( $g_id ),
                            'url'      => $url,
                            'type'     => 'gallery',
                            'type_lbl' => 'Galería'
                        );
                    }
                }
            }

            $combos[] = array(
                'id'            => $p->get_id(),
                'sku'           => $p->get_sku(),
                'name'          => $p->get_name(),
                'regular_price' => $p->get_regular_price(),
                'sale_price'    => $p->get_sale_price(),
                'status'        => $p->get_status(),
                'stock_status'  => $p->get_stock_status(),
                'featured_url'  => $feat_url,
                'gallery_urls'  => $gallery_urls,
                'gallery_items' => $gallery_items,
                'total_images'  => count( $gallery_items ),
                'permalink'     => $p->get_permalink()
            );
        }

        qdec_json_exit( array( 'success' => true, 'count' => count( $combos ), 'combos' => $combos ) );
    }
}

/* ─── ENDPOINT: DELETE SINGLE GALLERY IMAGE ─── */
if ( ! function_exists( 'qdec_handle_delete_gallery_image' ) ) {
    function qdec_handle_delete_gallery_image() {
        if ( $_SERVER['REQUEST_METHOD'] !== 'POST' ) {
            status_header( 405 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Usar POST.' ) );
        }

        $secret = qdec_get_param( 'secret_key' );
        if ( $secret !== 'qdec_crm_sec_2026' ) {
            status_header( 403 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Clave inválida.' ) );
        }

        $sku       = qdec_get_param( 'sku' );
        $sku       = trim( preg_replace( '/^sku:\s*/i', '', $sku ) );
        $attach_id = intval( qdec_get_param( 'attachment_id', '0' ) );
        $image_url = qdec_get_param( 'image_url' );

        $product_id = wc_get_product_id_by_sku( $sku );
        if ( ! $product_id ) {
            status_header( 404 );
            qdec_json_exit( array( 'success' => false, 'error' => "Producto {$sku} no encontrado." ) );
        }

        $p = wc_get_product( $product_id );

        if ( ! $attach_id && $image_url ) {
            $attach_id = attachment_url_to_postid( $image_url );
        }

        if ( ! $attach_id ) {
            status_header( 400 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Se requiere attachment_id o image_url válido.' ) );
        }

        $deleted_type = '';

        // 1. Foto de Portada
        if ( get_post_thumbnail_id( $product_id ) == $attach_id ) {
            delete_post_thumbnail( $product_id );
            $deleted_type = 'Portada';
        }

        // 2. Foto de Galería
        $gallery_ids = get_post_meta( $product_id, '_product_image_gallery', true );
        if ( $gallery_ids ) {
            $g_arr = array_filter( explode( ',', $gallery_ids ) );
            $new_g = array();
            foreach ( $g_arr as $g_id ) {
                if ( intval( $g_id ) !== $attach_id ) {
                    $new_g[] = intval( $g_id );
                }
            }
            update_post_meta( $product_id, '_product_image_gallery', implode( ',', $new_g ) );
            if ( ! $deleted_type ) $deleted_type = 'Galería';
        }

        $p->save();
        qdec_purge_caches( $product_id );

        qdec_json_exit( array(
            'success'      => true,
            'message'      => "Foto de {$deleted_type} eliminada con éxito del combo {$sku}.",
            'product_id'   => $product_id,
            'deleted_id'   => $attach_id
        ) );
    }
}

/* ─── ENDPOINT: VINCULAR FOTOS DE PRODUCTOS A GALERÍA DE COMBO POR SKUS ─── */
if ( ! function_exists( 'qdec_handle_auto_link_combo_gallery' ) ) {
    function qdec_handle_auto_link_combo_gallery() {
        if ( $_SERVER['REQUEST_METHOD'] !== 'POST' ) {
            status_header( 405 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Usar POST.' ) );
        }

        $secret = qdec_get_param( 'secret_key' );
        if ( $secret !== 'qdec_crm_sec_2026' ) {
            status_header( 403 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Clave inválida.' ) );
        }

        $combo_sku    = qdec_get_param( 'combo_sku' );
        $combo_sku    = trim( preg_replace( '/^sku:\s*/i', '', $combo_sku ) );
        $product_skus = qdec_get_param( 'product_skus' );
        $clear_first  = (bool) qdec_get_param( 'clear_first', false );

        if ( is_string( $product_skus ) ) {
            $product_skus = array_filter( array_map( 'trim', explode( ',', $product_skus ) ) );
        }

        if ( ! $combo_sku || empty( $product_skus ) ) {
            status_header( 400 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Se requiere combo_sku y lista de product_skus.' ) );
        }

        $combo_id = wc_get_product_id_by_sku( $combo_sku );
        if ( ! $combo_id ) {
            status_header( 404 );
            qdec_json_exit( array( 'success' => false, 'error' => "Combo con SKU '{$combo_sku}' no encontrado." ) );
        }

        $existing_gallery = get_post_meta( $combo_id, '_product_image_gallery', true );
        $gallery_ids      = ( $clear_first || ! $existing_gallery ) ? array() : array_filter( explode( ',', $existing_gallery ) );

        $linked_details = array();
        $not_found_skus = array();

        foreach ( $product_skus as $p_sku ) {
            $clean_sku = trim( preg_replace( '/^sku:\s*/i', '', $p_sku ) );
            if ( ! $clean_sku ) continue;

            $p_id = wc_get_product_id_by_sku( $clean_sku );
            if ( ! $p_id ) {
                $not_found_skus[] = $clean_sku;
                continue;
            }

            $prod = wc_get_product( $p_id );
            if ( ! $prod ) continue;

            $thumb_id = $prod->get_image_id();
            if ( $thumb_id ) {
                if ( ! in_array( $thumb_id, $gallery_ids ) ) {
                    $gallery_ids[] = intval( $thumb_id );
                }
                $linked_details[] = array(
                    'sku'           => $clean_sku,
                    'name'          => $prod->get_name(),
                    'attachment_id' => $thumb_id,
                    'image_url'     => wp_get_attachment_url( $thumb_id )
                );
            } else {
                $not_found_skus[] = "{$clean_sku} (sin foto principal)";
            }
        }

        update_post_meta( $combo_id, '_product_image_gallery', implode( ',', $gallery_ids ) );

        $combo_prod = wc_get_product( $combo_id );
        if ( $combo_prod ) $combo_prod->save();
        qdec_purge_caches( $combo_id );

        qdec_json_exit( array(
            'success'        => true,
            'message'        => "Vinculadas " . count( $linked_details ) . " imágenes al combo {$combo_sku} sin duplicar archivos.",
            'combo_sku'      => $combo_sku,
            'linked_count'   => count( $linked_details ),
            'linked_details' => $linked_details,
            'not_found_skus' => $not_found_skus,
            'total_gallery'  => count( $gallery_ids )
        ) );
    }
}

/* ─── ENDPOINT: UPLOAD CATEGORY BANNER ─── */
if ( ! function_exists( 'qdec_handle_upload_category_banner' ) ) {
    function qdec_handle_upload_category_banner() {
        if ( $_SERVER['REQUEST_METHOD'] !== 'POST' ) {
            status_header( 405 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Usar POST.' ) );
        }

        $secret = qdec_get_param( 'secret_key' );
        if ( $secret !== 'qdec_crm_sec_2026' ) {
            status_header( 403 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Clave inválida.' ) );
        }

        $cat_key      = qdec_get_param( 'category_key' );
        $image_base64 = qdec_get_param( 'image_base64' );
        $image_url    = qdec_get_param( 'image_url' );
        $filename     = qdec_get_param( 'filename', 'banner_' . $cat_key . '_' . time() . '.jpg' );

        if ( ! $image_base64 && ! $image_url ) {
            status_header( 400 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Se requiere imagen en Base64 o URL.' ) );
        }

        require_once( ABSPATH . 'wp-admin/includes/image.php' );
        require_once( ABSPATH . 'wp-admin/includes/file.php' );
        require_once( ABSPATH . 'wp-admin/includes/media.php' );

        $attach_id = 0;
        $final_url = '';

        if ( $image_base64 ) {
            $type = 'jpg';
            if ( preg_match( '/^data:image\/(\w+);base64,/', $image_base64, $m ) ) {
                $image_base64 = substr( $image_base64, strpos( $image_base64, ',' ) + 1 );
                $type = strtolower( $m[1] );
                if ( ! in_array( $type, array( 'jpg', 'jpeg', 'png', 'webp' ) ) ) $type = 'jpg';
            }

            $decoded = base64_decode( $image_base64 );
            if ( pathinfo( $filename, PATHINFO_EXTENSION ) === '' ) $filename .= '.' . $type;

            $upload = wp_upload_bits( $filename, null, $decoded );
            if ( $upload['error'] ) {
                status_header( 500 );
                qdec_json_exit( array( 'success' => false, 'error' => 'Error al guardar: ' . $upload['error'] ) );
            }

            $file_path = $upload['file'];
            $final_url = $upload['url'];
            $file_type = wp_check_filetype( $filename, null );

            $attach_id = wp_insert_attachment( array(
                'post_mime_type' => $file_type['type'],
                'post_title'     => sanitize_file_name( $filename ),
                'post_content'   => '',
                'post_status'    => 'inherit'
            ), $file_path );

            wp_update_attachment_metadata( $attach_id, wp_generate_attachment_metadata( $attach_id, $file_path ) );
        } elseif ( $image_url ) {
            $tmp = download_url( $image_url );
            if ( ! is_wp_error( $tmp ) ) {
                $attach_id = media_handle_sideload( array( 'name' => basename( $image_url ), 'tmp_name' => $tmp ), 0 );
                if ( ! is_wp_error( $attach_id ) ) {
                    $final_url = wp_get_attachment_url( $attach_id );
                }
            }
        }

        $final_url = str_replace( 'http://', 'https://', $final_url );

        qdec_json_exit( array(
            'success'       => true,
            'message'       => "Banner subido con éxito para la categoría {$cat_key}.",
            'category_key'  => $cat_key,
            'attachment_id' => $attach_id,
            'image_url'     => $final_url
        ) );
    }
}

/* ─── ENDPOINT: GET OFERTAS SEMANALES ─── */
if ( ! function_exists( 'qdec_handle_get_ofertas' ) ) {
    function qdec_handle_get_ofertas() {
        $args = array(
            'post_type'      => 'product',
            'post_status'    => array( 'publish', 'draft' ),
            'posts_per_page' => 30,
            'meta_query'     => array(
                'relation' => 'OR',
                array(
                    'key'     => '_sale_price',
                    'value'   => 0,
                    'compare' => '>'
                )
            )
        );

        $query = new WP_Query( $args );
        $ofertas = array();

        if ( $query->have_posts() ) {
            while ( $query->have_posts() ) {
                $query->the_post();
                $p = wc_get_product( get_the_ID() );
                if ( ! $p ) continue;

                $feat_id  = $p->get_image_id();
                $feat_url = $feat_id ? wp_get_attachment_url( $feat_id ) : '';

                $gallery_ids   = $p->get_gallery_image_ids();
                $gallery_items = array();
                if ( $feat_id && $feat_url ) {
                    $gallery_items[] = array( 'id' => $feat_id, 'url' => $feat_url, 'type' => 'featured', 'type_lbl' => 'Portada' );
                }
                if ( is_array( $gallery_ids ) ) {
                    foreach ( $gallery_ids as $g_id ) {
                        $url = wp_get_attachment_url( $g_id );
                        if ( $url ) $gallery_items[] = array( 'id' => intval( $g_id ), 'url' => $url, 'type' => 'gallery', 'type_lbl' => 'Galería' );
                    }
                }

                $ofertas[] = array(
                    'id'            => $p->get_id(),
                    'sku'           => $p->get_sku() ?: 'QD-ID-' . $p->get_id(),
                    'name'          => $p->get_name(),
                    'regular_price' => $p->get_regular_price(),
                    'sale_price'    => $p->get_sale_price(),
                    'status'        => $p->get_status(),
                    'stock_status'  => $p->get_stock_status(),
                    'featured_url'  => $feat_url,
                    'gallery_items' => $gallery_items,
                    'total_images'  => count( $gallery_items ),
                    'permalink'     => $p->get_permalink()
                );
            }
            wp_reset_postdata();
        }

        qdec_json_exit( array( 'success' => true, 'count' => count( $ofertas ), 'ofertas' => $ofertas ) );
    }
}

/* ─── ENDPOINT: UPLOAD HERO VIDEO ─── */
if ( ! function_exists( 'qdec_handle_upload_hero_video' ) ) {
    function qdec_handle_upload_hero_video() {
        if ( $_SERVER['REQUEST_METHOD'] !== 'POST' ) {
            status_header( 405 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Usar POST.' ) );
        }

        $secret = qdec_get_param( 'secret_key' );
        if ( $secret !== 'qdec_crm_sec_2026' ) {
            status_header( 403 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Clave inválida.' ) );
        }

        $raw = file_get_contents( 'php://input' );
        if ( empty( $raw ) ) {
            status_header( 400 );
            qdec_json_exit( array( 'success' => false, 'error' => 'No se enviaron datos.' ) );
        }

        $upload = wp_upload_bits( 'hero_video.mp4', null, $raw );
        if ( $upload['error'] ) {
            status_header( 500 );
            qdec_json_exit( array( 'success' => false, 'error' => 'Error al guardar video: ' . $upload['error'] ) );
        }

        qdec_purge_caches();
        qdec_json_exit( array( 'success' => true, 'video_url' => $upload['url'], 'bytes' => strlen( $raw ) ) );
    }
}
