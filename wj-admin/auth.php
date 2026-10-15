<?php
/**
 * Autenticación del panel.
 *
 * - Usuarios en users.json con contraseña bcrypt.
 * - Sesión en una cookie cifrada y autenticada (AES-256-GCM), httpOnly,
 *   SameSite=Strict y Secure en HTTPS. Expira a las 8 h. No se guarda nada en
 *   el servidor salvo la lista de sesiones cerradas (revoked.json), así las
 *   peticiones en paralelo de la presentación nunca se bloquean entre sí.
 * - Bloqueo de 15 min tras 5 intentos fallidos (por usuario o IP).
 * - Token CSRF obligatorio en toda petición que modifica datos.
 */
declare(strict_types=1);
defined('WJ_APP') || exit;

const WJ_MAX_FAILED_LOGINS = 5;
const WJ_LOCKOUT_SECONDS = 15 * 60;
const WJ_SESSION_COOKIE = 'WJSESS';

function wj_cookie_options(int $expires): array
{
    return [
        'expires' => $expires,
        'path' => wj_base_path() . '/',
        'secure' => wj_is_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ];
}

/* ------------------------------------------------------------------ */
/* Usuarios                                                            */
/* ------------------------------------------------------------------ */

function wj_users(): array
{
    $data = wj_store_read('users', ['users' => []]);
    return is_array($data['users'] ?? null) ? $data['users'] : [];
}

function wj_user_find(?int $id = null, ?string $username = null): ?array
{
    foreach (wj_users() as $u) {
        if (($id !== null && (int) $u['id'] === $id) || ($username !== null && hash_equals(strtolower((string) $u['username']), strtolower($username)))) {
            return $u;
        }
    }
    return null;
}

function wj_users_count(): int
{
    return count(wj_users());
}

function wj_validate_username(string $username): string
{
    $username = trim($username);
    if (!preg_match('/^[A-Za-z0-9._@-]{3,64}$/', $username)) {
        wj_fail('El usuario debe tener entre 3 y 64 caracteres (letras, números, punto, guion, @).');
    }
    return $username;
}

function wj_validate_password(string $password): string
{
    if (strlen($password) < 10) {
        wj_fail('La contraseña debe tener al menos 10 caracteres.');
    }
    if (strlen($password) > 200) {
        wj_fail('La contraseña es demasiado larga.');
    }
    return $password;
}

function wj_password_hash(string $password): string
{
    return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
}

function wj_create_user(string $username, string $password): void
{
    $username = wj_validate_username($username);
    $hash = wj_password_hash(wj_validate_password($password));
    wj_store_update('users', static function (array &$data) use ($username, $hash): void {
        $data['users'] = is_array($data['users'] ?? null) ? $data['users'] : [];
        foreach ($data['users'] as $u) {
            if (strtolower((string) $u['username']) === strtolower($username)) {
                wj_fail('Ese usuario ya existe.', 409);
            }
        }
        $ids = array_map(static fn ($u) => (int) $u['id'], $data['users']);
        $data['users'][] = [
            'id' => $ids ? max($ids) + 1 : 1,
            'username' => $username,
            'password_hash' => $hash,
            'epoch' => 1,
            'created' => gmdate('c'),
            'updated' => gmdate('c'),
        ];
    }, ['users' => []], true);
}

/** Cambia la contraseña e invalida todas las sesiones de ese usuario. */
function wj_change_password(int $userId, string $current, string $new): void
{
    $user = wj_user_find($userId);
    if (!$user || !password_verify($current, (string) $user['password_hash'])) {
        wj_fail('La contraseña actual no es correcta.', 403);
    }
    $hash = wj_password_hash(wj_validate_password($new));
    wj_store_update('users', static function (array &$data) use ($userId, $hash): void {
        foreach ($data['users'] as &$u) {
            if ((int) $u['id'] === $userId) {
                $u['password_hash'] = $hash;
                $u['epoch'] = (int) ($u['epoch'] ?? 1) + 1;
                $u['updated'] = gmdate('c');
            }
        }
    }, ['users' => []], true);
}

/**
 * Primera ejecución: si ADMIN_USER y ADMIN_PASSWORD están en .env y no hay
 * usuarios, se crea el administrador automáticamente.
 */
function wj_bootstrap_admin_from_env(): bool
{
    if (wj_users_count() > 0) {
        return false;
    }
    $user = wj_env('ADMIN_USER');
    $pass = wj_env('ADMIN_PASSWORD');
    if ($user === null || $pass === null) {
        return false;
    }
    wj_create_user($user, $pass);
    return true;
}

/* ------------------------------------------------------------------ */
/* Bloqueo por intentos fallidos                                       */
/* ------------------------------------------------------------------ */

function wj_lockout_remaining(string $username): int
{
    $data = wj_store_read('login-attempts', ['items' => []]);
    $since = wj_now() - WJ_LOCKOUT_SECONDS;
    $ip = wj_client_ip();
    $user = strtolower($username);
    $count = 0;
    $last = 0.0;
    foreach (($data['items'] ?? []) as $a) {
        if (!$a['ok'] && $a['ts'] > $since && ($a['u'] === $user || $a['ip'] === $ip)) {
            $count++;
            $last = max($last, (float) $a['ts']);
        }
    }
    return $count >= WJ_MAX_FAILED_LOGINS ? (int) max(1, ceil($last + WJ_LOCKOUT_SECONDS - wj_now())) : 0;
}

function wj_record_attempt(string $username, bool $success): void
{
    $user = strtolower(substr($username, 0, 64));
    $ip = wj_client_ip();
    wj_store_update('login-attempts', static function (array &$data) use ($user, $ip, $success): void {
        $cut = wj_now() - WJ_LOCKOUT_SECONDS;
        $items = array_filter($data['items'] ?? [], static fn ($a) => $a['ts'] > $cut);
        if ($success) {
            $items = array_filter($items, static fn ($a) => $a['ok'] || ($a['u'] !== $user && $a['ip'] !== $ip));
        } else {
            $items[] = ['u' => $user, 'ip' => $ip, 'ts' => wj_now(), 'ok' => false];
        }
        $data['items'] = array_slice(array_values($items), -500);
    }, ['items' => []]);
}

/* ------------------------------------------------------------------ */
/* Sesión (cookie cifrada)                                             */
/* ------------------------------------------------------------------ */

/** Usuario de la sesión actual o null. */
function wj_current_user(): ?array
{
    static $cached = false;
    if ($cached !== false) {
        return $cached;
    }
    $cached = null;
    $cookie = (string) ($_COOKIE[WJ_SESSION_COOKIE] ?? '');
    if ($cookie === '' || strlen($cookie) > 2000) {
        return null;
    }
    $plain = wj_decrypt($cookie, 'session');
    $s = $plain === null ? null : json_decode($plain, true);
    if (!is_array($s) || (float) ($s['exp'] ?? 0) < wj_now()) {
        return null;
    }
    $user = wj_user_find((int) ($s['uid'] ?? 0));
    if (!$user || (int) ($user['epoch'] ?? 1) !== (int) ($s['epoch'] ?? 0)) {
        return null;
    }
    $revoked = wj_store_read('revoked', ['items' => []])['items'] ?? [];
    if (isset($revoked[(string) ($s['sid'] ?? '')])) {
        return null;
    }
    return $cached = [
        'id' => (int) $user['id'],
        'username' => (string) $user['username'],
        'csrf' => (string) $s['csrf'],
        'sid' => (string) $s['sid'],
        'expires' => (float) $s['exp'],
    ];
}

/** Exige sesión válida; en peticiones que modifican datos exige además el token CSRF. */
function wj_require_auth(): array
{
    $user = wj_current_user();
    if (!$user) {
        wj_fail('Sesión no iniciada o expirada.', 401);
    }
    if (wj_method() !== 'GET') {
        $token = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
        if (!hash_equals($user['csrf'], $token)) {
            wj_fail('Token de seguridad inválido. Recargue la página.', 403);
        }
    }
    return $user;
}

function wj_login(string $username, string $password): array
{
    $username = trim($username);
    $wait = wj_lockout_remaining($username);
    if ($wait > 0) {
        wj_fail('Demasiados intentos fallidos. Intente de nuevo en ' . (int) ceil($wait / 60) . ' min.', 429);
    }
    $user = $username !== '' ? wj_user_find(null, $username) : null;
    // Se verifica siempre contra un hash para no revelar si el usuario existe.
    $hash = $user ? (string) $user['password_hash'] : '$2y$12$HNl5cJfywCbLkbg/W2Z3le1MlITHBDszqu4UcnBg.1bU1y9XKTaDS';
    $ok = password_verify($password, $hash) && $user !== null;
    wj_record_attempt($username, $ok);
    if (!$ok) {
        wj_fail('Usuario o contraseña incorrectos.', 401);
    }
    $session = [
        'uid' => (int) $user['id'],
        'epoch' => (int) ($user['epoch'] ?? 1),
        'sid' => bin2hex(random_bytes(12)),
        'csrf' => bin2hex(random_bytes(24)),
        'iat' => wj_now(),
        'exp' => wj_now() + WJ_SESSION_TTL,
    ];
    setcookie(WJ_SESSION_COOKIE, wj_encrypt(json_encode($session), 'session'), wj_cookie_options(0));
    return ['username' => (string) $user['username'], 'csrf' => $session['csrf'], 'expires' => $session['exp']];
}

function wj_logout(): void
{
    $user = wj_current_user();
    if ($user) {
        $sid = $user['sid'];
        $exp = $user['expires'];
        wj_store_update('revoked', static function (array &$data) use ($sid, $exp): void {
            $now = wj_now();
            $items = array_filter($data['items'] ?? [], static fn ($e) => $e > $now);
            $items[$sid] = $exp;
            $data['items'] = $items;
        }, ['items' => []]);
    }
    setcookie(WJ_SESSION_COOKIE, '', wj_cookie_options(time() - 3600));
}
