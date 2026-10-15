<?php
/**
 * Configuración de la presentación (protegido).
 *   GET                                  Configuración + estado enmascarado de las llaves API.
 *   POST {action:"save", config}         Valida, guarda y avisa en vivo a la presentación.
 *   POST {action:"reset"}                Restaura los valores por defecto.
 *   POST {action:"secret", name, value}  Guarda una llave API cifrada (value null = borrar).
 */
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';

wj_require_auth();

if (wj_method() === 'GET') {
    wj_json([
        'ok' => true,
        'config' => wj_config_get(),
        'version' => wj_config_version(),
        'secrets' => wj_secrets_public(),
        'defaults' => wj_default_config(),
    ]);
}

$in = wj_input();
switch ((string) ($in['action'] ?? '')) {
    case 'save':
    case 'reset':
        $source = ($in['action'] === 'reset') ? wj_default_config() : ($in['config'] ?? null);
        if (!is_array($source)) {
            wj_fail('Falta la configuración.');
        }
        $version = wj_config_save($source);
        wj_events_add('notice', [['type' => 'config', 'version' => $version]]);
        wj_json(['ok' => true, 'version' => $version, 'config' => wj_sanitize_config($source)]);

    case 'secret':
        $name = (string) ($in['name'] ?? '');
        $value = $in['value'] ?? null;
        if ($value !== null && !is_string($value)) {
            wj_fail('Valor inválido.');
        }
        $value = $value === null ? null : trim($value);
        if ($value !== null && ($value === '' || strlen($value) > 400 || preg_match('/\s/', $value))) {
            wj_fail('La llave no tiene un formato válido.');
        }
        wj_secret_set($name, $value);
        wj_json(['ok' => true, 'secrets' => wj_secrets_public()]);

    default:
        wj_fail('Acción desconocida.');
}
