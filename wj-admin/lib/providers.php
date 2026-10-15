<?php
/**
 * Proxies hacia servicios externos: ElevenLabs (voz), Claude y Gemini (texto).
 *
 * Las llaves se descifran solo aquí, en el servidor, y nunca se devuelven al
 * navegador. Se usa cURL directamente (sin Composer) para que el sistema
 * funcione en Plesk al descomprimir el repositorio.
 */
declare(strict_types=1);
defined('WJ_APP') || exit;

// Las URLs base se pueden redefinir antes de incluir este archivo (pruebas).
defined('WJ_ELEVENLABS_BASE') || define('WJ_ELEVENLABS_BASE', 'https://api.elevenlabs.io');
defined('WJ_ANTHROPIC_BASE') || define('WJ_ANTHROPIC_BASE', 'https://api.anthropic.com');
defined('WJ_GEMINI_BASE') || define('WJ_GEMINI_BASE', 'https://generativelanguage.googleapis.com');

/** Modelos de Claude que admiten el respaldo automático ante rechazos (fallbacks: "default"). */
const WJ_CLAUDE_FALLBACK_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];

/**
 * Petición HTTP con cURL.
 * @return array{status:int, body:string, error:string, ms:int}
 */
function wj_http(string $method, string $url, array $headers, ?string $body, int $timeoutMs): array
{
    if (!function_exists('curl_init')) {
        wj_fail('La extensión curl de PHP es obligatoria para conectarse a las APIs.', 500);
    }
    $start = microtime(true);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT_MS => $timeoutMs,
        CURLOPT_CONNECTTIMEOUT_MS => min($timeoutMs, 4000),
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_USERAGENT => 'wj-presentacion/' . WJ_VERSION,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
    $resp = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = $resp === false ? curl_error($ch) : '';
    curl_close($ch);
    return [
        'status' => $status,
        'body' => $resp === false ? '' : (string) $resp,
        'error' => $error,
        'ms' => (int) round((microtime(true) - $start) * 1000),
    ];
}

/** Mensaje de error legible sin exponer datos sensibles. */
function wj_provider_error(string $provider, array $res): string
{
    if ($res['error'] !== '') {
        return "$provider: sin conexión o tiempo agotado ({$res['ms']} ms).";
    }
    $msg = '';
    $json = json_decode($res['body'], true);
    if (is_array($json)) {
        $msg = (string) ($json['error']['message'] ?? $json['detail']['message'] ?? (is_string($json['detail'] ?? null) ? $json['detail'] : '') ?? '');
    }
    $msg = wj_clean_text(preg_replace('/(sk-|xi-|AIza)[A-Za-z0-9_\-]{6,}/', '[llave]', $msg) ?? '', 200);
    $hint = match (true) {
        $res['status'] === 401, $res['status'] === 403 => 'llave inválida o sin permisos',
        $res['status'] === 404 => 'recurso o modelo no encontrado',
        $res['status'] === 429 => 'límite de uso alcanzado',
        $res['status'] >= 500 => 'el servicio no está disponible',
        default => 'respuesta inesperada',
    };
    return "$provider: $hint (HTTP {$res['status']})" . ($msg !== '' ? " — $msg" : '');
}

function wj_require_secret(string $name, string $label): string
{
    $key = wj_secret_get($name);
    if (!$key) {
        wj_fail("Configure la llave de $label en el panel (sección APIs).", 409);
    }
    return $key;
}

/* ------------------------------------------------------------------ */
/* ElevenLabs                                                          */
/* ------------------------------------------------------------------ */

function wj_eleven_tts(string $text, array $tts): string
{
    $key = wj_require_secret('elevenlabs_api_key', 'ElevenLabs');
    if (($tts['voiceId'] ?? '') === '') {
        wj_fail('Elija una voz de ElevenLabs en el panel (sección APIs).', 409);
    }
    $payload = [
        'text' => $text,
        'model_id' => $tts['modelId'],
        'voice_settings' => [
            'stability' => (float) $tts['stability'],
            'similarity_boost' => (float) $tts['similarity'],
            'style' => (float) $tts['style'],
            'use_speaker_boost' => true,
            'speed' => (float) $tts['speed'],
        ],
    ];
    // language_code solo lo aceptan algunos modelos (Flash/Turbo v2.5 y posteriores).
    if (!str_starts_with((string) $tts['modelId'], 'eleven_multilingual_v2') && !str_starts_with((string) $tts['modelId'], 'eleven_monolingual')) {
        $payload['language_code'] = $tts['languageCode'];
    }
    $url = WJ_ELEVENLABS_BASE . '/v1/text-to-speech/' . rawurlencode((string) $tts['voiceId']) . '?output_format=mp3_44100_128';
    $res = wj_http('POST', $url, [
        'xi-api-key: ' . $key,
        'Content-Type: application/json',
        'Accept: audio/mpeg',
    ], json_encode($payload, JSON_UNESCAPED_UNICODE), 30000);
    if ($res['status'] !== 200 || $res['body'] === '') {
        wj_fail(wj_provider_error('ElevenLabs', $res), 502);
    }
    return $res['body'];
}

function wj_eleven_test(): array
{
    $key = wj_require_secret('elevenlabs_api_key', 'ElevenLabs');
    $res = wj_http('GET', WJ_ELEVENLABS_BASE . '/v1/voices', ['xi-api-key: ' . $key, 'Accept: application/json'], null, 15000);
    if ($res['status'] !== 200) {
        return ['ok' => false, 'message' => wj_provider_error('ElevenLabs', $res)];
    }
    $json = json_decode($res['body'], true);
    $voices = [];
    foreach (($json['voices'] ?? []) as $v) {
        $labels = is_array($v['labels'] ?? null) ? $v['labels'] : [];
        $voices[] = [
            'id' => (string) ($v['voice_id'] ?? ''),
            'name' => wj_clean_text($v['name'] ?? '', 120),
            'gender' => wj_clean_text($labels['gender'] ?? '', 30),
            'accent' => wj_clean_text($labels['accent'] ?? '', 40),
            'category' => wj_clean_text($v['category'] ?? '', 30),
        ];
    }
    return ['ok' => true, 'message' => 'Conexión correcta: ' . count($voices) . ' voces disponibles.', 'voices' => $voices, 'ms' => $res['ms']];
}

/* ------------------------------------------------------------------ */
/* Claude (Messages API)                                               */
/* ------------------------------------------------------------------ */

function wj_claude_headers(string $key, bool $fallback): array
{
    $h = [
        'x-api-key: ' . $key,
        'anthropic-version: 2023-06-01',
        'content-type: application/json',
    ];
    if ($fallback) {
        $h[] = 'anthropic-beta: server-side-fallback-2026-07-01';
    }
    return $h;
}

/**
 * Pide a Claude una respuesta JSON que cumpla $schema (salida estructurada).
 * @return array{data:array, ms:int, model:string}
 */
function wj_claude_json(string $system, string $user, array $schema, int $timeoutMs): array
{
    $cfg = wj_config_get()['ai'];
    $key = wj_require_secret('claude_api_key', 'Claude');
    $model = $cfg['claudeModel'];
    $fallback = in_array($model, WJ_CLAUDE_FALLBACK_MODELS, true);
    $payload = [
        'model' => $model,
        'max_tokens' => 2048,
        'system' => $system,
        'messages' => [['role' => 'user', 'content' => $user]],
        'output_config' => [
            'effort' => $cfg['claudeEffort'],
            'format' => ['type' => 'json_schema', 'schema' => $schema],
        ],
    ];
    if ($fallback) {
        $payload['fallbacks'] = 'default';
    }
    $res = wj_http('POST', WJ_ANTHROPIC_BASE . '/v1/messages', wj_claude_headers($key, $fallback), json_encode($payload, JSON_UNESCAPED_UNICODE), $timeoutMs);
    if ($res['status'] !== 200) {
        wj_fail(wj_provider_error('Claude', $res), 502);
    }
    $json = json_decode($res['body'], true);
    $stop = $json['stop_reason'] ?? '';
    if ($stop === 'refusal') {
        wj_fail('Claude declinó responder esta solicitud.', 502);
    }
    if ($stop === 'max_tokens') {
        wj_fail('Claude no terminó la respuesta (límite de tokens).', 502);
    }
    $text = '';
    foreach (($json['content'] ?? []) as $block) {
        if (($block['type'] ?? '') === 'text') {
            $text .= (string) $block['text'];
        }
    }
    $data = json_decode($text, true);
    if (!is_array($data)) {
        wj_fail('Claude devolvió una respuesta no válida.', 502);
    }
    return ['data' => $data, 'ms' => $res['ms'], 'model' => (string) ($json['model'] ?? $model)];
}

function wj_claude_test(): array
{
    $key = wj_require_secret('claude_api_key', 'Claude');
    $res = wj_http('GET', WJ_ANTHROPIC_BASE . '/v1/models?limit=100', wj_claude_headers($key, false), null, 15000);
    if ($res['status'] !== 200) {
        return ['ok' => false, 'message' => wj_provider_error('Claude', $res)];
    }
    $json = json_decode($res['body'], true);
    $models = [];
    foreach (($json['data'] ?? []) as $m) {
        $models[] = ['id' => (string) ($m['id'] ?? ''), 'name' => wj_clean_text($m['display_name'] ?? '', 80)];
    }
    $current = wj_config_get()['ai']['claudeModel'];
    $found = in_array($current, array_column($models, 'id'), true);
    return [
        'ok' => true,
        'message' => 'Conexión correcta.' . ($found ? " Modelo «{$current}» disponible." : " Atención: el modelo «{$current}» no aparece en la lista."),
        'models' => $models,
        'ms' => $res['ms'],
    ];
}

/* ------------------------------------------------------------------ */
/* Gemini                                                              */
/* ------------------------------------------------------------------ */

function wj_gemini_json(string $system, string $user, int $timeoutMs): array
{
    $cfg = wj_config_get()['ai'];
    $key = wj_require_secret('gemini_api_key', 'Gemini');
    $payload = [
        'systemInstruction' => ['parts' => [['text' => $system]]],
        'contents' => [['role' => 'user', 'parts' => [['text' => $user]]]],
        'generationConfig' => [
            'responseMimeType' => 'application/json',
            'maxOutputTokens' => 1024,
        ],
    ];
    $url = WJ_GEMINI_BASE . '/v1beta/models/' . rawurlencode($cfg['geminiModel']) . ':generateContent';
    $res = wj_http('POST', $url, ['x-goog-api-key: ' . $key, 'Content-Type: application/json'], json_encode($payload, JSON_UNESCAPED_UNICODE), $timeoutMs);
    if ($res['status'] !== 200) {
        wj_fail(wj_provider_error('Gemini', $res), 502);
    }
    $json = json_decode($res['body'], true);
    $text = '';
    foreach (($json['candidates'][0]['content']['parts'] ?? []) as $part) {
        if (isset($part['text']) && empty($part['thought'])) {
            $text .= (string) $part['text'];
        }
    }
    $text = trim(preg_replace('/^```(?:json)?\s*|\s*```$/', '', trim($text)) ?? '');
    $data = json_decode($text, true);
    if (!is_array($data)) {
        wj_fail('Gemini devolvió una respuesta no válida.', 502);
    }
    return ['data' => $data, 'ms' => $res['ms'], 'model' => $cfg['geminiModel']];
}

function wj_gemini_test(): array
{
    $key = wj_require_secret('gemini_api_key', 'Gemini');
    $res = wj_http('GET', WJ_GEMINI_BASE . '/v1beta/models?pageSize=200', ['x-goog-api-key: ' . $key], null, 15000);
    if ($res['status'] !== 200) {
        return ['ok' => false, 'message' => wj_provider_error('Gemini', $res)];
    }
    $json = json_decode($res['body'], true);
    $models = [];
    foreach (($json['models'] ?? []) as $m) {
        if (!in_array('generateContent', $m['supportedGenerationMethods'] ?? [], true)) {
            continue;
        }
        $models[] = ['id' => preg_replace('#^models/#', '', (string) ($m['name'] ?? '')), 'name' => wj_clean_text($m['displayName'] ?? '', 80)];
    }
    $current = wj_config_get()['ai']['geminiModel'];
    $found = in_array($current, array_column($models, 'id'), true);
    return [
        'ok' => true,
        'message' => 'Conexión correcta.' . ($found ? " Modelo «{$current}» disponible." : " Atención: el modelo «{$current}» no aparece en la lista."),
        'models' => $models,
        'ms' => $res['ms'],
    ];
}

/** Respuesta JSON de Claude o Gemini según el proveedor elegido. */
function wj_llm_json(string $provider, string $system, string $user, array $schema, int $timeoutMs): array
{
    if ($provider === 'gemini') {
        $schemaHint = "\n\nResponde únicamente con JSON que cumpla este esquema:\n" . json_encode($schema, JSON_UNESCAPED_UNICODE);
        return wj_gemini_json($system . $schemaHint, $user, $timeoutMs);
    }
    return wj_claude_json($system, $user, $schema, $timeoutMs);
}
