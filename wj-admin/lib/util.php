<?php
/** Utilidades generales: JSON, entrada, .env, rutas. */
declare(strict_types=1);
defined('WJ_APP') || exit;

/** Error con mensaje seguro para mostrar al usuario. */
final class WjUserError extends RuntimeException
{
    public int $status;

    public function __construct(string $message, int $status = 400)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

function wj_fail(string $message, int $status = 400): void
{
    throw new WjUserError($message, $status);
}

function wj_json($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

/** Lee el cuerpo JSON de la petición (máx. 2 MB). */
function wj_input(): array
{
    static $data = null;
    if ($data !== null) {
        return $data;
    }
    $raw = file_get_contents('php://input', false, null, 0, 2 * 1024 * 1024 + 1);
    if ($raw === false || $raw === '') {
        return $data = [];
    }
    if (strlen($raw) > 2 * 1024 * 1024) {
        wj_fail('La petición es demasiado grande.', 413);
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        wj_fail('JSON inválido.', 400);
    }
    return $data = $decoded;
}

function wj_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function wj_strlen(string $s): int
{
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : (int) preg_match_all('/./us', $s);
}

function wj_substr(string $s, int $start, int $len): string
{
    return function_exists('mb_substr') ? mb_substr($s, $start, $len, 'UTF-8') : substr($s, $start, $len);
}

/** Texto limpio: sin caracteres de control, recortado a $max caracteres. */
function wj_clean_text($value, int $max = 500): string
{
    if (!is_scalar($value)) {
        return '';
    }
    $s = (string) $value;
    if (!preg_match('//u', $s)) {
        $s = function_exists('mb_convert_encoding') ? mb_convert_encoding($s, 'UTF-8', 'UTF-8') : '';
    }
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
    $s = trim($s);
    if (wj_strlen($s) > $max) {
        $s = wj_substr($s, 0, $max);
    }
    return $s;
}

function wj_is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    if (($_SERVER['SERVER_PORT'] ?? '') === '443') {
        return true;
    }
    return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

/** Ruta pública de la carpeta de la aplicación (p. ej. "/ponencia"), sin barra final. */
function wj_base_path(): string
{
    $script = (string) ($_SERVER['SCRIPT_NAME'] ?? '');
    $pos = strpos($script, '/wj-admin/');
    if ($pos === false) {
        return '';
    }
    return rtrim(substr($script, 0, $pos), '/');
}

function wj_client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 64);
}

/** Variables de entorno: getenv() y archivos .env (raíz de la app y carpeta de datos). */
function wj_env(string $key): ?string
{
    static $vars = null;
    if ($vars === null) {
        $vars = [];
        foreach ([WJ_ROOT . '/.env', WJ_DATA_DIR . '/.env'] as $file) {
            if (!is_file($file) || !is_readable($file)) {
                continue;
            }
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                    continue;
                }
                [$k, $v] = explode('=', $line, 2);
                $k = trim($k);
                $v = trim($v);
                // Quitar comentario al final si el valor no está entre comillas.
                if ($v !== '' && $v[0] !== '"' && $v[0] !== "'" && ($hash = strpos($v, ' #')) !== false) {
                    $v = rtrim(substr($v, 0, $hash));
                }
                if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && substr($v, -1) === $v[0]) {
                    $v = substr($v, 1, -1);
                }
                $vars[$k] = $v;
            }
        }
    }
    $real = getenv($key);
    if ($real !== false && $real !== '') {
        return $real;
    }
    return isset($vars[$key]) && $vars[$key] !== '' ? $vars[$key] : null;
}

/** Escribe un archivo de forma atómica (temporal + rename). */
function wj_write_atomic(string $path, string $content, int $mode = 0640): bool
{
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $content, LOCK_EX) === false) {
        return false;
    }
    @chmod($tmp, $mode);
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        return false;
    }
    return true;
}

function wj_now(): float
{
    return microtime(true);
}
