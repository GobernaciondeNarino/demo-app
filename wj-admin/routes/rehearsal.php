<?php
/**
 * Resúmenes de ensayos: tiempo real por bloque vs. planeado (protegido).
 *   GET                                   Lista (más recientes primero).
 *   GET  ?id=...                          Detalle (incluye transcripción descifrada si se guardó).
 *   POST {action:"save", summary, transcript?}
 *   POST {action:"delete", id}
 *
 * Cada ensayo es un archivo JSON en rehearsals/. La transcripción, si se decide
 * guardarla, se cifra con AES-256-GCM.
 */
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';

wj_require_auth();

function wj_rehearsal_dir(): string
{
    $dir = wj_store_dir() . '/rehearsals';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    return $dir;
}

if (wj_method() === 'GET') {
    $id = (string) ($_GET['id'] ?? '');
    if ($id !== '') {
        if (!preg_match('/^[a-z0-9-]{10,60}$/', $id)) {
            wj_fail('Identificador inválido.');
        }
        $data = wj_store_read('rehearsals/' . $id, []);
        if (!$data) {
            wj_fail('No existe ese ensayo.', 404);
        }
        $data['transcript'] = isset($data['transcript']) ? json_decode((string) wj_decrypt((string) $data['transcript'], 'rehearsal:' . $id), true) : null;
        wj_json(['ok' => true, 'rehearsal' => $data]);
    }
    $items = [];
    foreach (glob(wj_rehearsal_dir() . '/*.json') ?: [] as $file) {
        $data = json_decode((string) file_get_contents($file), true);
        if (is_array($data)) {
            $items[] = ['id' => $data['id'], 'created' => $data['created'], 'summary' => $data['summary'], 'hasTranscript' => isset($data['transcript'])];
        }
    }
    usort($items, static fn ($a, $b) => strcmp((string) $b['created'], (string) $a['created']));
    wj_json(['ok' => true, 'items' => array_slice($items, 0, 100)]);
}

$in = wj_input();
switch ((string) ($in['action'] ?? '')) {
    case 'save':
        $summary = is_array($in['summary'] ?? null) ? $in['summary'] : null;
        $json = $summary ? json_encode($summary, JSON_UNESCAPED_UNICODE) : false;
        if ($json === false || strlen($json) > 64 * 1024) {
            wj_fail('Resumen inválido.');
        }
        wj_rehearsal_dir();
        $id = gmdate('Ymd-His') . '-' . bin2hex(random_bytes(3));
        $record = ['id' => $id, 'created' => gmdate('c'), 'summary' => $summary];
        if (is_array($in['transcript'] ?? null) && wj_config_get()['reminders']['saveTranscripts']) {
            $t = json_encode($in['transcript'], JSON_UNESCAPED_UNICODE);
            if ($t !== false && strlen($t) <= 512 * 1024) {
                $record['transcript'] = wj_encrypt($t, 'rehearsal:' . $id);
            }
        }
        wj_store_write('rehearsals/' . $id, $record, true);
        wj_json(['ok' => true, 'id' => $id]);

    case 'delete':
        $id = (string) ($in['id'] ?? '');
        if (!preg_match('/^[a-z0-9-]{10,60}$/', $id)) {
            wj_fail('Identificador inválido.');
        }
        @unlink(wj_store_path('rehearsals/' . $id));
        wj_json(['ok' => true]);

    default:
        wj_fail('Acción desconocida.');
}
