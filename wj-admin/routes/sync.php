<?php
/**
 * Sincronización en vivo entre presentación, panel y vista de presentador.
 *
 * En hosting compartido (Plesk + PHP) no se pueden mantener WebSockets, así
 * que cada cliente consulta este endpoint cada ~1 s. Un único POST sirve para
 * publicar (estado y registro de la presentación) y recibir (comandos remotos,
 * cambios de configuración, estado para el monitor).
 *
 *   POST {role, since, configVersion, state?, logs?}
 *   POST {action:"command", command:{action, arg}}   Comando remoto hacia la presentación.
 */
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';

$user = wj_require_auth();
$in = wj_input();

const WJ_REMOTE_ACTIONS = ['NEXT', 'PREV', 'REPEAT', 'PAUSE', 'RESUME', 'TOGGLE_PAUSE', 'FORCE_NEXT', 'NARRATE', 'BLACK', 'MUTE_VOICE', 'TOGGLE_HUD', 'GOTO', 'TIMER_START', 'TIMER_RESET', 'END_SESSION', 'FACT_COVERED', 'RELOAD_AUDIO'];

if (($in['action'] ?? '') === 'command') {
    $cmd = is_array($in['command'] ?? null) ? $in['command'] : [];
    $action = (string) ($cmd['action'] ?? '');
    if (!in_array($action, WJ_REMOTE_ACTIONS, true)) {
        wj_fail('Comando no permitido.');
    }
    $arg = $cmd['arg'] ?? null;
    $arg = is_int($arg) || (is_string($arg) && preg_match('/^[A-Za-z0-9_-]{1,40}$/', $arg)) ? $arg : null;
    $source = in_array($cmd['source'] ?? '', ['admin', 'presenter'], true) ? $cmd['source'] : 'admin';
    $id = wj_events_add('cmd', [[
        'action' => $action,
        'arg' => $arg,
        'source' => $source,
        'cid' => preg_match('/^[a-z0-9]{6,40}$/', (string) ($cmd['cid'] ?? '')) ? $cmd['cid'] : bin2hex(random_bytes(8)),
        'by' => $user['username'],
    ]]);
    wj_json(['ok' => true, 'id' => $id]);
}

$role = in_array($in['role'] ?? '', ['presentation', 'admin', 'presenter'], true) ? $in['role'] : 'admin';
$since = (int) ($in['since'] ?? -1);
$clientVersion = (int) ($in['configVersion'] ?? 0);

if ($role === 'presentation') {
    if (is_array($in['state'] ?? null)) {
        $json = json_encode($in['state'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($json !== false && strlen($json) <= 128 * 1024) {
            wj_store_write('state', ['ts' => wj_now(), 'clientId' => substr((string) ($in['clientId'] ?? ''), 0, 40), 'state' => $in['state']]);
        }
    }
    if (is_array($in['logs'] ?? null) && $in['logs']) {
        $logs = [];
        foreach (array_slice($in['logs'], 0, 50) as $log) {
            $json = is_array($log) ? json_encode($log, JSON_UNESCAPED_UNICODE) : false;
            if ($json !== false && strlen($json) <= 4096) {
                $logs[] = $log;
            }
        }
        wj_events_add('log', $logs);
    }
}

$channels = match ($role) {
    'presentation' => ['cmd'],
    'admin' => ['log', 'cmd', 'notice'],
    default => ['cmd', 'notice'],
};
$lastId = wj_events_last_id();
$events = $since < 0 ? [] : wj_events_since($since, $channels);
$out = [
    'ok' => true,
    'now' => wj_now(),
    'lastId' => $events ? max($lastId, (int) end($events)['id']) : $lastId,
    'events' => $events,
    'configVersion' => wj_config_version(),
    'sessionExpires' => $user['expires'],
];
if ($out['configVersion'] !== $clientVersion) {
    $out['config'] = wj_config_get();
}
if ($role !== 'presentation') {
    $state = wj_store_read('state');
    $out['state'] = $state['state'] ?? null;
    $out['stateAge'] = isset($state['ts']) ? round(wj_now() - (float) $state['ts'], 1) : null;
}
wj_json($out);
