<?php
/**
 * Almacenamiento en archivos JSON (sin base de datos SQL) + cifrado AES-256-GCM.
 *
 * Estructura en wj-content/data/ (carpeta privada, bloqueada con .htaccess,
 * web.config e index.php):
 *
 *   keys.php                 Llave maestra de cifrado y código de instalación.
 *                            Es .php para que, si se pide por web, se ejecute y no se descargue.
 *   store-<aleatorio>/       Carpeta con nombre impredecible que contiene los JSON:
 *     config.json            Configuración de la presentación (+ versión).
 *     users.json             Administradores (contraseñas con bcrypt).
 *     secrets.json           Llaves API, cada una cifrada con AES-256-GCM.
 *     login-attempts.json    Intentos de acceso (bloqueo tras 5 fallos).
 *     revoked.json           Sesiones cerradas antes de expirar.
 *     events.json            Cola corta de eventos en vivo (comandos y registro).
 *     state.json             Último estado publicado por la presentación.
 *     rehearsals/*.json      Resúmenes de ensayos (transcripción cifrada si se guarda).
 *
 * Toda escritura es atómica (archivo temporal + rename) y las operaciones
 * leer-modificar-escribir se serializan con flock() para soportar peticiones
 * simultáneas de la presentación, el panel y la vista de presentador.
 */
declare(strict_types=1);
defined('WJ_APP') || exit;

/** Llave maestra, carpeta de datos y código de instalación (se generan en la primera ejecución). */
function wj_private_config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $file = WJ_DATA_DIR . '/keys.php';
    if (is_file($file)) {
        $loaded = include $file;
        if (is_array($loaded) && !empty($loaded['encryption_key']) && !empty($loaded['store_dir'])) {
            return $cfg = $loaded;
        }
    }
    if (!is_dir(WJ_DATA_DIR) && !@mkdir(WJ_DATA_DIR, 0750, true)) {
        wj_fail('No se pudo crear la carpeta de datos wj-content/data. Revise los permisos en Plesk.', 500);
    }
    if (!is_writable(WJ_DATA_DIR)) {
        wj_fail('La carpeta wj-content/data no tiene permisos de escritura para PHP. Ajústelos en Plesk (Administrador de archivos > Permisos).', 500);
    }
    wj_protect_dir(WJ_DATA_DIR);
    $code = strtoupper(implode('-', str_split(bin2hex(random_bytes(6)), 4)));
    $cfg = [
        'encryption_key' => base64_encode(random_bytes(32)),
        'store_dir' => 'store-' . bin2hex(random_bytes(12)),
        'setup_code' => $code,
        'created' => gmdate('c'),
    ];
    $php = "<?php\n"
        . "// Archivo generado automáticamente. NO lo comparta ni lo suba al repositorio.\n"
        . "// Si lo borra, las llaves API guardadas dejarán de poder leerse.\n"
        . "// Código de instalación (solo para crear el primer administrador): {$code}\n"
        . "defined('WJ_APP') || exit;\n"
        . 'return ' . var_export($cfg, true) . ";\n";
    if (!wj_write_atomic($file, $php, 0640)) {
        wj_fail('No se pudo escribir wj-content/data/keys.php. Revise los permisos de la carpeta.', 500);
    }
    return $cfg;
}

/** Archivos que impiden servir una carpeta por web (Apache, IIS y acceso directo). */
function wj_protect_dir(string $dir): void
{
    $files = [
        '.htaccess' => "# Carpeta privada: nunca se sirve por web.\nOptions -Indexes\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n",
        'index.php' => "<?php\nhttp_response_code(403);\n",
        'web.config' => "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<configuration>\n  <system.webServer>\n    <authorization>\n      <deny users=\"*\" />\n    </authorization>\n  </system.webServer>\n</configuration>\n",
    ];
    foreach ($files as $name => $content) {
        if (!is_file($dir . '/' . $name)) {
            @file_put_contents($dir . '/' . $name, $content);
        }
    }
}

/** Carpeta real de los JSON (nombre aleatorio dentro de wj-content/data). */
function wj_store_dir(): string
{
    static $dir = null;
    if ($dir !== null) {
        return $dir;
    }
    $name = basename((string) wj_private_config()['store_dir']);
    $dir = WJ_DATA_DIR . '/' . $name;
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0750, true)) {
            wj_fail('No se pudo crear la carpeta de datos. Revise los permisos de wj-content/data.', 500);
        }
        wj_protect_dir($dir);
        // Archivo testigo: el panel comprueba que NO se pueda descargar por web.
        @file_put_contents(WJ_DATA_DIR . '/canary.json', json_encode(['aviso' => 'Si puede leer esto desde el navegador, la carpeta de datos está expuesta.']));
    }
    return $dir;
}

function wj_store_path(string $name): string
{
    if (!preg_match('#^[a-z0-9-]+(/[a-z0-9-]+)?$#', $name)) {
        wj_fail('Nombre de almacenamiento inválido.', 500);
    }
    return wj_store_dir() . '/' . $name . '.json';
}

/** Lee un JSON del almacenamiento; si no existe o está dañado devuelve $default. */
function wj_store_read(string $name, array $default = []): array
{
    $path = wj_store_path($name);
    if (!is_file($path)) {
        return $default;
    }
    $raw = @file_get_contents($path);
    $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data)) {
        error_log("[wj] JSON dañado o ilegible: $name");
        return $default;
    }
    return $data;
}

function wj_store_write(string $name, array $data, bool $pretty = false): void
{
    $path = wj_store_path($name);
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
        wj_fail('No se pudo crear la carpeta de datos.', 500);
    }
    $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | ($pretty ? JSON_PRETTY_PRINT : 0);
    $json = json_encode($data, $flags);
    if ($json === false || !wj_write_atomic($path, $json . "\n", 0640)) {
        wj_fail('No se pudo guardar la información (revise permisos y espacio en disco).', 500);
    }
}

/**
 * Leer-modificar-escribir con bloqueo exclusivo. $fn recibe el arreglo por
 * referencia y su valor de retorno se devuelve tal cual.
 */
function wj_store_update(string $name, callable $fn, array $default = [], bool $pretty = false)
{
    $lock = fopen(wj_store_path($name) . '.lock', 'c');
    if ($lock === false) {
        wj_fail('No se pudo bloquear el archivo de datos.', 500);
    }
    try {
        flock($lock, LOCK_EX);
        $data = wj_store_read($name, $default);
        $result = $fn($data);
        wj_store_write($name, $data, $pretty);
        return $result;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

/* ------------------------------------------------------------------ */
/* Cifrado                                                             */
/* ------------------------------------------------------------------ */

/** Llave de 32 bytes: ENCRYPTION_KEY del .env (si existe) o la generada en keys.php. */
function wj_encryption_key(): string
{
    static $key = null;
    if ($key !== null) {
        return $key;
    }
    $env = wj_env('ENCRYPTION_KEY');
    if ($env !== null) {
        if (preg_match('/^[0-9a-fA-F]{64}$/', $env)) {
            return $key = (string) hex2bin($env);
        }
        $b64 = base64_decode($env, true);
        if ($b64 !== false && strlen($b64) === 32) {
            return $key = $b64;
        }
        return $key = hash('sha256', $env, true);
    }
    $raw = base64_decode((string) wj_private_config()['encryption_key'], true);
    if ($raw === false || strlen($raw) !== 32) {
        wj_fail('La llave de cifrado en wj-content/data/keys.php es inválida.', 500);
    }
    return $key = $raw;
}

/** AES-256-GCM. $aad liga el texto cifrado a su uso (no se puede mover a otro campo). */
function wj_encrypt(string $plain, string $aad): string
{
    if (!function_exists('openssl_encrypt')) {
        wj_fail('La extensión openssl de PHP es obligatoria para cifrar la información.', 500);
    }
    $iv = random_bytes(12);
    $tag = '';
    $ct = openssl_encrypt($plain, 'aes-256-gcm', wj_encryption_key(), OPENSSL_RAW_DATA, $iv, $tag, $aad, 16);
    if ($ct === false) {
        wj_fail('No se pudo cifrar el valor.', 500);
    }
    return 'v1:' . rtrim(strtr(base64_encode($iv . $tag . $ct), '+/', '-_'), '=');
}

function wj_decrypt(string $stored, string $aad): ?string
{
    if (!str_starts_with($stored, 'v1:') || !function_exists('openssl_decrypt')) {
        return null;
    }
    $bin = base64_decode(strtr(substr($stored, 3), '-_', '+/'), true);
    if ($bin === false || strlen($bin) < 29) {
        return null;
    }
    $plain = openssl_decrypt(substr($bin, 28), 'aes-256-gcm', wj_encryption_key(), OPENSSL_RAW_DATA, substr($bin, 0, 12), substr($bin, 12, 16), $aad);
    return $plain === false ? null : $plain;
}

/* ------------------------------------------------------------------ */
/* Llaves API cifradas                                                 */
/* ------------------------------------------------------------------ */

const WJ_SECRET_NAMES = ['elevenlabs_api_key', 'claude_api_key', 'gemini_api_key'];

function wj_secret_get(string $name): ?string
{
    $all = wj_store_read('secrets');
    $stored = $all[$name]['value'] ?? null;
    return is_string($stored) ? wj_decrypt($stored, 'secret:' . $name) : null;
}

function wj_secret_set(string $name, ?string $value): void
{
    if (!in_array($name, WJ_SECRET_NAMES, true)) {
        wj_fail('Nombre de llave desconocido.');
    }
    wj_store_update('secrets', static function (array &$all) use ($name, $value): void {
        if ($value === null || $value === '') {
            unset($all[$name]);
        } else {
            $all[$name] = ['value' => wj_encrypt($value, 'secret:' . $name), 'updated' => wj_now()];
        }
    }, [], true);
}

/** Estado de las llaves para el panel: nunca devuelve el valor real. */
function wj_secrets_public(): array
{
    $all = wj_store_read('secrets');
    $out = [];
    foreach (WJ_SECRET_NAMES as $name) {
        $stored = $all[$name]['value'] ?? null;
        $value = is_string($stored) ? wj_decrypt($stored, 'secret:' . $name) : null;
        $out[$name] = [
            'set' => $value !== null && $value !== '',
            'masked' => $value ? wj_mask_secret($value) : '',
            'updated' => $all[$name]['updated'] ?? null,
            'unreadable' => is_string($stored) && $value === null,
        ];
    }
    return $out;
}

function wj_mask_secret(string $value): string
{
    if (strlen($value) <= 12) {
        return str_repeat('•', 8);
    }
    return substr($value, 0, 4) . '••••••••' . substr($value, -4);
}

/* ------------------------------------------------------------------ */
/* Eventos en vivo (sincronización por HTTP)                           */
/* ------------------------------------------------------------------ */

const WJ_EVENTS_MAX = 400;
const WJ_EVENTS_TTL = 1800;

/** Agrega eventos a la cola y devuelve el último id. */
function wj_events_add(string $channel, array $payloads): int
{
    if (!$payloads) {
        return wj_events_last_id();
    }
    return (int) wj_store_update('events', static function (array &$q) use ($channel, $payloads): int {
        $q['lastId'] = (int) ($q['lastId'] ?? 0);
        $q['items'] = is_array($q['items'] ?? null) ? $q['items'] : [];
        $now = wj_now();
        foreach ($payloads as $payload) {
            $q['lastId']++;
            $q['items'][] = ['id' => $q['lastId'], 'ts' => $now, 'channel' => $channel, 'payload' => $payload];
        }
        $cut = $now - WJ_EVENTS_TTL;
        $q['items'] = array_values(array_filter($q['items'], static fn ($e) => ($e['ts'] ?? 0) >= $cut));
        if (count($q['items']) > WJ_EVENTS_MAX) {
            $q['items'] = array_slice($q['items'], -WJ_EVENTS_MAX);
        }
        return $q['lastId'];
    });
}

function wj_events_since(int $since, array $channels, int $limit = 200): array
{
    $q = wj_store_read('events');
    $out = [];
    foreach (($q['items'] ?? []) as $e) {
        if (($e['id'] ?? 0) > $since && in_array($e['channel'] ?? '', $channels, true)) {
            $out[] = $e;
            if (count($out) >= $limit) {
                break;
            }
        }
    }
    return $out;
}

function wj_events_last_id(): int
{
    return (int) (wj_store_read('events')['lastId'] ?? 0);
}
