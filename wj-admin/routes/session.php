<?php
/**
 * Sesión del panel.
 *   GET                         Estado: ¿falta instalar?, ¿sesión activa?, token CSRF.
 *   POST {action:"login"}       Inicia sesión (usuario + contraseña).
 *   POST {action:"logout"}      Cierra la sesión actual.
 *   POST {action:"setup"}       Crea el primer administrador (requiere el código de instalación).
 *   POST {action:"password"}    Cambia la contraseña (cierra las demás sesiones).
 */
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';

wj_bootstrap_admin_from_env();

if (wj_method() === 'GET') {
    $user = wj_current_user();
    wj_json([
        'ok' => true,
        'needsSetup' => wj_users_count() === 0,
        'authenticated' => $user !== null,
        'user' => $user ? ['username' => $user['username']] : null,
        'csrf' => $user['csrf'] ?? null,
        'expires' => $user['expires'] ?? null,
        'https' => wj_is_https(),
        'version' => WJ_VERSION,
    ]);
}

$in = wj_input();
$action = (string) ($in['action'] ?? '');

switch ($action) {
    case 'login':
        $result = wj_login((string) ($in['username'] ?? ''), (string) ($in['password'] ?? ''));
        wj_json(['ok' => true] + $result);

    case 'setup':
        if (wj_users_count() > 0) {
            wj_fail('El administrador ya fue creado. Inicie sesión.', 409);
        }
        if (wj_lockout_remaining('setup') > 0) {
            wj_fail('Demasiados intentos. Espere 15 minutos.', 429);
        }
        $expected = (string) (wj_private_config()['setup_code'] ?? '');
        $given = strtoupper(trim((string) ($in['code'] ?? '')));
        if ($expected === '' || !hash_equals($expected, $given)) {
            wj_record_attempt('setup', false);
            wj_fail('Código de instalación incorrecto. Lo encuentra en wj-content/data/keys.php (Administrador de archivos de Plesk).', 403);
        }
        wj_create_user((string) ($in['username'] ?? ''), (string) ($in['password'] ?? ''));
        $result = wj_login((string) $in['username'], (string) $in['password']);
        wj_json(['ok' => true] + $result);

    case 'logout':
        wj_require_auth();
        wj_logout();
        wj_json(['ok' => true]);

    case 'password':
        $user = wj_require_auth();
        wj_change_password($user['id'], (string) ($in['current'] ?? ''), (string) ($in['new'] ?? ''));
        $result = wj_login($user['username'], (string) $in['new']);
        wj_json(['ok' => true] + $result);

    default:
        wj_fail('Acción desconocida.');
}
