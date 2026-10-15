<?php
/**
 * Botón «Probar conexión» del panel (protegido).
 *   POST {provider: "elevenlabs" | "claude" | "gemini"}
 */
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';
require_once WJ_ADMIN_DIR . '/lib/providers.php';

wj_require_auth();
$provider = (string) (wj_input()['provider'] ?? '');
$result = match ($provider) {
    'elevenlabs' => wj_eleven_test(),
    'claude' => wj_claude_test(),
    'gemini' => wj_gemini_test(),
    default => null,
};
if ($result === null) {
    wj_fail('Proveedor desconocido.');
}
wj_json($result);
