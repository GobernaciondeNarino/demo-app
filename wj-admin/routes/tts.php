<?php
/**
 * Voz con ElevenLabs + caché de audio (protegido).
 *   POST {text}                     Devuelve el mp3 (desde la caché o generado al momento).
 *   POST {text, mode:"ensure"}      Solo asegura que esté en caché; devuelve JSON (pregeneración).
 *   POST {text, mode:"ensure", force:true}  Regenera aunque exista.
 *   POST {action:"clear"}           Vacía la caché.
 *   GET  ?stats=1                   Número de audios y tamaño de la caché.
 *
 * La llave de ElevenLabs nunca sale del servidor.
 */
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';
require_once WJ_ADMIN_DIR . '/lib/providers.php';

wj_require_auth();

function wj_tts_cache_dir(): string
{
    if (!is_dir(WJ_TTS_CACHE_DIR) && !@mkdir(WJ_TTS_CACHE_DIR, 0755, true)) {
        wj_fail('No se pudo crear la carpeta wj-admin/cache/tts. Revise los permisos.', 500);
    }
    if (!is_file(dirname(WJ_TTS_CACHE_DIR) . '/.htaccess')) {
        wj_protect_dir(dirname(WJ_TTS_CACHE_DIR));
    }
    return WJ_TTS_CACHE_DIR;
}

if (wj_method() === 'GET') {
    $files = glob(wj_tts_cache_dir() . '/*.mp3') ?: [];
    $bytes = array_sum(array_map('filesize', $files));
    wj_json(['ok' => true, 'files' => count($files), 'bytes' => $bytes]);
}

$in = wj_input();

if (($in['action'] ?? '') === 'clear') {
    $n = 0;
    foreach (glob(wj_tts_cache_dir() . '/*.mp3') ?: [] as $f) {
        $n += @unlink($f) ? 1 : 0;
    }
    wj_json(['ok' => true, 'deleted' => $n]);
}

$text = wj_clean_text($in['text'] ?? '', 2000);
if ($text === '') {
    wj_fail('Falta el texto.');
}
$tts = wj_config_get()['tts'];
$hash = hash('sha256', json_encode([
    'v' => 1,
    'text' => $text,
    'voice' => $tts['voiceId'],
    'model' => $tts['modelId'],
    'lang' => $tts['languageCode'],
    'speed' => $tts['speed'],
    'stability' => $tts['stability'],
    'similarity' => $tts['similarity'],
    'style' => $tts['style'],
], JSON_UNESCAPED_UNICODE));
$path = wj_tts_cache_dir() . '/' . $hash . '.mp3';
$hit = is_file($path) && filesize($path) > 0 && empty($in['force']);

if (!$hit) {
    $audio = wj_eleven_tts($text, $tts);
    if (!wj_write_atomic($path, $audio, 0644)) {
        wj_fail('No se pudo guardar el audio en la caché.', 500);
    }
}

if (($in['mode'] ?? '') === 'ensure') {
    wj_json(['ok' => true, 'hash' => $hash, 'cached' => $hit, 'bytes' => filesize($path)]);
}

header('Content-Type: audio/mpeg');
header('Content-Length: ' . filesize($path));
header('Cache-Control: private, max-age=86400');
header('X-Content-Type-Options: nosniff');
header('X-TTS-Cache: ' . ($hit ? 'hit' : 'miss'));
readfile($path);
