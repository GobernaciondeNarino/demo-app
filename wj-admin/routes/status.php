<?php
/** Diagnóstico del servidor para el panel (protegido). */
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';

wj_require_auth();
$exts = [];
foreach (['openssl', 'curl', 'json', 'mbstring'] as $ext) {
    $exts[$ext] = extension_loaded($ext);
}
$ttsFiles = glob(WJ_TTS_CACHE_DIR . '/*.mp3') ?: [];
wj_json([
    'ok' => true,
    'php' => PHP_VERSION,
    'phpOk' => PHP_VERSION_ID >= 80000,
    'extensions' => $exts,
    'https' => wj_is_https(),
    'basePath' => wj_base_path() . '/',
    'server' => substr((string) ($_SERVER['SERVER_SOFTWARE'] ?? ''), 0, 80),
    'dataWritable' => is_writable(wj_store_dir()),
    'cacheWritable' => is_dir(WJ_TTS_CACHE_DIR) ? is_writable(WJ_TTS_CACHE_DIR) : is_writable(dirname(WJ_TTS_CACHE_DIR)),
    'ttsCache' => ['files' => count($ttsFiles), 'bytes' => array_sum(array_map('filesize', $ttsFiles))],
    'envAdminPassword' => wj_env('ADMIN_PASSWORD') !== null,
    'version' => WJ_VERSION,
]);
