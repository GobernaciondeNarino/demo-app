<?php
/**
 * Arranque común del backend (panel admin + API).
 *
 * Todo el backend es PHP sin dependencias externas para que funcione en Plesk
 * con solo descomprimir el repositorio. Requiere PHP 8.0+ con openssl y curl.
 * No usa base de datos: todo se guarda en archivos JSON (ver store.php).
 */
declare(strict_types=1);

if (PHP_VERSION_ID < 80000) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Se requiere PHP 8.0 o superior (versión actual: ' . PHP_VERSION . '). Cámbiela en Plesk > Configuración de PHP.';
    exit;
}

define('WJ_APP', true);
define('WJ_VERSION', '1.0.0');
define('WJ_ADMIN_DIR', __DIR__);
define('WJ_ROOT', dirname(__DIR__));
define('WJ_CONTENT_DIR', WJ_ROOT . '/wj-content');
define('WJ_DATA_DIR', WJ_CONTENT_DIR . '/data');
define('WJ_MEDIA_DIR', WJ_CONTENT_DIR . '/media');
define('WJ_TTS_CACHE_DIR', WJ_ADMIN_DIR . '/cache/tts');
define('WJ_SESSION_TTL', 8 * 3600);

ini_set('display_errors', '0');
if (function_exists('mb_internal_encoding')) {
    mb_internal_encoding('UTF-8');
}

require_once WJ_ADMIN_DIR . '/lib/util.php';
require_once WJ_ADMIN_DIR . '/store.php';
require_once WJ_ADMIN_DIR . '/auth.php';
require_once WJ_ADMIN_DIR . '/lib/config.php';

set_exception_handler(static function (Throwable $e): void {
    error_log('[wj] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        $msg = $e instanceof WjUserError ? $e->getMessage() : 'Error interno del servidor. Revise el registro de errores de PHP.';
        wj_json(['ok' => false, 'error' => $msg], $e instanceof WjUserError ? $e->status : 500);
    }
});
