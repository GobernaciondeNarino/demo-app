<?php
/**
 * Servidor simulado de ElevenLabs, Claude (Messages API) y Gemini para las
 * pruebas. Valida la forma de cada petición (cabeceras y cuerpo) y registra
 * todo en tests/output/mock-requests.jsonl.
 */
declare(strict_types=1);

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$logDir = getenv('WJ_MOCK_LOG') ?: __DIR__ . '/../output';
@mkdir($logDir, 0777, true);
file_put_contents($logDir . '/mock-requests.jsonl', json_encode(['method' => $method, 'path' => $path, 'headers' => $headers, 'body' => $body]) . "\n", FILE_APPEND);

function out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $status = 400): void
{
    out(['error' => ['message' => $msg]], $status);
}

/** WAV de 0,3 s en silencio (el navegador lo decodifica igual que un mp3). */
function wav(): string
{
    $rate = 16000;
    $n = (int) ($rate * 0.3);
    $data = str_repeat("\0\0", $n);
    return 'RIFF' . pack('V', 36 + strlen($data)) . 'WAVEfmt ' . pack('VvvVVvv', 16, 1, 1, $rate, $rate * 2, 2, 16) . 'data' . pack('V', strlen($data)) . $data;
}

// ---------------- ElevenLabs ----------------
if (preg_match('#^/v1/text-to-speech/([A-Za-z0-9]+)$#', $path, $m) && $method === 'POST') {
    if (($headers['xi-api-key'] ?? '') !== 'test-eleven-key') fail('invalid api key', 401);
    if (!is_string($body['text'] ?? null) || $body['text'] === '') fail('text required', 422);
    if (!isset($body['model_id'], $body['voice_settings']['stability'], $body['voice_settings']['speed'])) fail('bad voice settings', 422);
    if (($_GET['output_format'] ?? '') !== 'mp3_44100_128') fail('bad output_format', 422);
    header('Content-Type: audio/mpeg');
    echo wav();
    exit;
}
if ($path === '/v1/voices') {
    if (($headers['xi-api-key'] ?? '') !== 'test-eleven-key') fail('invalid api key', 401);
    out(['voices' => [
        ['voice_id' => 'VozFem123', 'name' => 'Lucía', 'category' => 'premade', 'labels' => ['gender' => 'female', 'accent' => 'latin american']],
        ['voice_id' => 'VozMasc456', 'name' => 'Mateo', 'category' => 'premade', 'labels' => ['gender' => 'male', 'accent' => 'colombian']],
    ]]);
}

// ---------------- Claude ----------------
if ($path === '/v1/models' && $method === 'GET') {
    if (($headers['x-api-key'] ?? '') !== 'test-claude-key') fail('invalid x-api-key', 401);
    out(['data' => [['id' => 'claude-opus-5-5', 'display_name' => 'Claude Opus 5.5'], ['id' => 'claude-haiku-5-5', 'display_name' => 'Claude Haiku 5.5']]]);
}
if ($path === '/v1/messages' && $method === 'POST') {
    if (($headers['x-api-key'] ?? '') !== 'test-claude-key') fail('invalid x-api-key', 401);
    if (($headers['anthropic-version'] ?? '') !== '2023-06-01') fail('anthropic-version required');
    $fallbackModels = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];
    if (in_array($body['model'] ?? '', $fallbackModels, true)) {
        if (($headers['anthropic-beta'] ?? '') !== 'server-side-fallback-2026-07-01' || ($body['fallbacks'] ?? null) !== 'default') fail('fallbacks/default requires matching beta header');
    }
    if (isset($body['thinking']) || isset($body['temperature'])) fail('thinking/temperature not allowed for this model');
    if (($body['output_config']['format']['type'] ?? '') !== 'json_schema') fail('expected output_config.format json_schema');
    if (!in_array($body['output_config']['effort'] ?? '', ['low', 'medium', 'high'], true)) fail('bad effort');
    $answer = llm_answer((string) $body['system'], (string) $body['messages'][0]['content']);
    out(['id' => 'msg_test', 'type' => 'message', 'role' => 'assistant', 'model' => $body['model'], 'stop_reason' => 'end_turn',
        'content' => [['type' => 'text', 'text' => json_encode($answer, JSON_UNESCAPED_UNICODE)]], 'usage' => ['input_tokens' => 10, 'output_tokens' => 5]]);
}

// ---------------- Gemini ----------------
if ($path === '/v1beta/models' && $method === 'GET') {
    if (($headers['x-goog-api-key'] ?? '') !== 'test-gemini-key') fail('API key not valid', 403);
    out(['models' => [['name' => 'models/gemini-3.6-flash', 'displayName' => 'Gemini 3.6 Flash', 'supportedGenerationMethods' => ['generateContent']]]]);
}
if (preg_match('#^/v1beta/models/([a-z0-9.\-]+):generateContent$#', $path) && $method === 'POST') {
    if (($headers['x-goog-api-key'] ?? '') !== 'test-gemini-key') fail('API key not valid', 403);
    if (($body['generationConfig']['responseMimeType'] ?? '') !== 'application/json') fail('expected JSON response mime type');
    $answer = llm_answer((string) $body['systemInstruction']['parts'][0]['text'], (string) $body['contents'][0]['parts'][0]['text']);
    out(['candidates' => [['content' => ['parts' => [['text' => json_encode($answer, JSON_UNESCAPED_UNICODE)]]]]]]);
}

/** Respuesta determinista para intención y cobertura. */
function llm_answer(string $system, string $user): array
{
    if (str_contains($system, 'Controlas una presentación')) {
        preg_match('#<frase>(.*)</frase>#s', $user, $m);
        $frase = mb_strtolower($m[1] ?? '');
        if (str_contains($frase, 'lo que viene')) return ['action' => 'NEXT', 'scene' => 0];
        if (str_contains($frase, 'la tercera')) return ['action' => 'GOTO', 'scene' => 3];
        return ['action' => 'NONE', 'scene' => 0];
    }
    preg_match_all('#- \[([A-Za-z0-9_-]+)\]#', $user, $ids);
    preg_match('#<transcripcion>(.*)</transcripcion>#s', $user, $t);
    $covered = str_contains(mb_strtolower($t[1] ?? ''), 'otras palabras') ? $ids[1] : [];
    return ['covered' => $covered];
}

fail("mock: ruta no encontrada $method $path", 404);
