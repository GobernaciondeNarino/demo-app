<?php
/**
 * Configuración de la presentación: valores por defecto y validación.
 *
 * El navegador nunca define la forma de los datos: todo lo que llega del panel
 * se filtra contra este esquema (claves conocidas, tipos, rangos y listas
 * acotadas) antes de guardarse.
 */
declare(strict_types=1);
defined('WJ_APP') || exit;

const WJ_ACTIONS = ['NONE', 'NEXT', 'PREV', 'REPEAT', 'PAUSE', 'RESUME', 'TOGGLE_PAUSE', 'FORCE_NEXT', 'NARRATE', 'BLACK', 'MUTE_VOICE', 'TOGGLE_HUD', 'FULLSCREEN'];
const WJ_VOICE_ACTIONS = ['NEXT', 'PREV', 'REPEAT', 'PAUSE', 'RESUME', 'FORCE_NEXT', 'NARRATE', 'BLACK', 'MUTE_VOICE'];
const WJ_RESPONSE_KEYS = ['NEXT', 'PREV', 'REPEAT', 'PAUSE', 'RESUME', 'NARRATE', 'UNKNOWN'];
const WJ_GESTURES = ['swipe_left', 'swipe_right', 'Closed_Fist', 'Open_Palm', 'Pointing_Up', 'Thumb_Up', 'Thumb_Down', 'Victory', 'ILoveYou'];
const WJ_MEDIA_KEYS = ['nexttrack', 'previoustrack', 'play', 'pause', 'seekforward', 'seekbackward'];
const WJ_TRANSITIONS = ['fade', 'wipe', 'noise', 'zoom'];

function wj_default_config(): array
{
    $mp = 'wj-includes/vendor/mediapipe';
    return [
        'general' => [
            'title' => 'IA: descubrimientos que ningún humano encontró',
            'cooldownMs' => 1200,
            'hudVisible' => true,
            'logoUrl' => '',
            'syncIntervalMs' => 1000,
        ],
        'transitions' => [
            'type' => 'noise',
            'durationMs' => 1200,
        ],
        'voice' => [
            'enabled' => true,
            'engine' => 'webspeech',
            'lang' => 'es-CO',
            'wakeWord' => [
                'enabled' => true,
                'words' => ['ñaño', 'ñano', 'naño', 'nano', 'nanyo'],
                'windowMs' => 4000,
            ],
            'commands' => [
                'NEXT' => ['siguiente', 'continúa', 'avanza', 'adelante'],
                'PREV' => ['atrás', 'regresa', 'anterior', 'devuélvete'],
                'REPEAT' => ['repite', 'otra vez'],
                'PAUSE' => ['pausa', 'espera'],
                'RESUME' => ['reanuda', 'seguimos'],
                'FORCE_NEXT' => ['continuar igual', 'continúa igual', 'ya lo dije'],
                'NARRATE' => ['cuéntanos', 'tu turno', 'qué opinas', 'dinos algo'],
                'BLACK' => ['pantalla negra'],
                'MUTE_VOICE' => ['silencio'],
            ],
            'aiIntent' => [
                'enabled' => false,
                'provider' => 'claude',
                'maxWords' => 10,
            ],
            'ignoreWhileSpeaking' => 'all',
        ],
        'gestures' => [
            'enabled' => true,
            'minConfidence' => 0.7,
            'fps' => 20,
            'mirror' => true,
            'hand' => 'any',
            'zone' => ['x0' => 0.0, 'y0' => 0.0, 'x1' => 1.0, 'y1' => 1.0],
            'swipe' => ['enabled' => true, 'minDistance' => 0.22, 'maxDurationMs' => 400],
            'map' => [
                'swipe_left' => 'NEXT',
                'swipe_right' => 'PREV',
                'Closed_Fist' => 'NEXT',
                'Open_Palm' => 'PAUSE',
                'Pointing_Up' => 'NONE',
                'Thumb_Up' => 'REPEAT',
                'Thumb_Down' => 'NONE',
                'Victory' => 'NONE',
                'ILoveYou' => 'NONE',
            ],
            'holdMs' => [
                'Closed_Fist' => 800,
                'Open_Palm' => 1500,
                'Pointing_Up' => 800,
                'Thumb_Up' => 800,
                'Thumb_Down' => 800,
                'Victory' => 800,
                'ILoveYou' => 800,
            ],
            'cameraLabel' => '',
            'mediapipe' => [
                'moduleUrl' => $mp . '/vision_bundle.mjs',
                'wasmUrl' => $mp . '/wasm',
                'modelUrl' => $mp . '/gesture_recognizer.task',
                'delegate' => 'GPU',
            ],
        ],
        'mediaKeys' => [
            'enabled' => true,
            'map' => [
                'nexttrack' => 'NEXT',
                'previoustrack' => 'PREV',
                'play' => 'NONE',
                'pause' => 'NONE',
                'seekforward' => 'NONE',
                'seekbackward' => 'NONE',
            ],
        ],
        'keyboard' => [
            'enabled' => true,
            'map' => [
                'ArrowRight' => 'NEXT',
                'ArrowDown' => 'NEXT',
                'PageDown' => 'NEXT',
                'Space' => 'NEXT',
                'ArrowLeft' => 'PREV',
                'ArrowUp' => 'PREV',
                'PageUp' => 'PREV',
                'KeyB' => 'BLACK',
                'Period' => 'BLACK',
                'KeyH' => 'TOGGLE_HUD',
                'KeyF' => 'FULLSCREEN',
                'KeyR' => 'REPEAT',
                'KeyP' => 'TOGGLE_PAUSE',
                'KeyN' => 'NARRATE',
                'KeyC' => 'FORCE_NEXT',
                'KeyM' => 'MUTE_VOICE',
            ],
        ],
        'responses' => [
            'enabled' => true,
            'respondTo' => 'voice',
            'output' => 'public',
            'phrases' => [
                'NEXT' => ['Claro, avanzamos.', 'Con gusto, continuamos.', 'Listo, siguiente.'],
                'PREV' => ['Volvemos atrás.', 'Regresamos a la anterior.'],
                'REPEAT' => ['Repetimos esta parte.'],
                'PAUSE' => ['En pausa, te espero.'],
                'RESUME' => ['Seguimos.'],
                'NARRATE' => [],
                'UNKNOWN' => ['No te entendí, ¿puedes repetir?'],
            ],
        ],
        'tts' => [
            'voiceId' => '',
            'voiceName' => '',
            'modelId' => 'eleven_flash_v2_5',
            'languageCode' => 'es',
            'speed' => 1.0,
            'stability' => 0.5,
            'similarity' => 0.75,
            'style' => 0.0,
            'volume' => 1.0,
        ],
        'audio' => [
            'publicSinkLabel' => '',
            'discreetSinkLabel' => '',
        ],
        'reminders' => [
            'enabled' => true,
            'onlyHigh' => false,
            'maxPerScene' => 1,
            'output' => 'discreet',
            'provider' => 'claude',
            'checkIntervalMs' => 20000,
            'timeoutMs' => 800,
            'applyTo' => 'voice',
            'template' => 'Antes de continuar, recuerda que también tenemos este dato: {dato}',
            'saveTranscripts' => false,
        ],
        'timing' => [
            'enabled' => true,
            'output' => 'discreet',
            'oneMinute' => 'Te queda un minuto en este bloque.',
            'timeUp' => 'Tiempo cumplido.',
            'behindSeconds' => 60,
            'targetMinutes' => 15,
        ],
        'narration' => [
            'output' => 'public',
            'delayMs' => 500,
        ],
        'ai' => [
            'claudeModel' => 'claude-opus-5-5',
            'claudeEffort' => 'low',
            'geminiModel' => 'gemini-3.6-flash',
        ],
        'blocks' => [
            ['id' => 'b1', 'name' => 'Apertura en vivo', 'minutes' => 3.0],
            ['id' => 'b2', 'name' => 'IA y salud', 'minutes' => 4.0],
            ['id' => 'b3', 'name' => 'IA y matemáticas', 'minutes' => 4.0],
            ['id' => 'b4', 'name' => 'IA acelerando la ciencia + cierre', 'minutes' => 4.0],
        ],
        'scenes' => [
            wj_default_scene('s1', 'b1', 'Apertura en vivo', '¿Y si la IA ya está descubriendo cosas que ningún humano encontró?', '#FFD500', '#1F1F1F', 'Saludo y pregunta gancho. El video del dron se integra cuando se retome esa sección.'),
            wj_default_scene('s2', 'b2', 'IA y salud', 'Patógenos, antibióticos y nuevas moléculas', '#0071AC', '#FFFFFF', 'Contenido científico: Fase 2.'),
            wj_default_scene('s3', 'b2', 'Proteínas', 'La estructura que tardaba años, en minutos', '#055684', '#FFFFFF', ''),
            wj_default_scene('s4', 'b3', 'IA y matemáticas', 'Demostraciones y algoritmos nuevos', '#50398E', '#FFFFFF', ''),
            wj_default_scene('s5', 'b4', 'IA acelerando la ciencia', '¿Qué significa para Nariño?', '#10A13B', '#FFFFFF', ''),
            wj_default_scene('s6', 'b4', 'Gracias', '', '#000000', '#FFFFFF', 'Cierre y mensaje final.'),
        ],
    ];
}

function wj_default_scene(string $id, string $block, string $title, string $subtitle, string $color, string $text, string $notes): array
{
    $facts = [];
    if (in_array($id, ['s2', 's4', 's5'], true)) {
        $facts[] = [
            'id' => 'f' . substr($id, 1),
            'text' => 'Dato de ejemplo de esta escena (reemplácelo en la Fase 2).',
            'keywords' => ['ejemplo'],
            'priority' => 'alta',
        ];
    }
    return [
        'id' => $id,
        'blockId' => $block,
        'type' => 'color',
        'title' => $title,
        'subtitle' => $subtitle,
        'color' => $color,
        'textColor' => $text,
        'effect' => 'both',
        'showNumber' => true,
        'transition' => '',
        'media' => ['url' => '', 'fit' => 'cover', 'loop' => true, 'muted' => false],
        'notes' => $notes,
        'narration' => ['text' => '', 'mode' => 'off'],
        'facts' => $facts,
    ];
}

/* ------------------------------------------------------------------ */
/* Validación                                                          */
/* ------------------------------------------------------------------ */

function wj_c_bool($v, bool $def): bool
{
    if (is_bool($v)) {
        return $v;
    }
    if ($v === 1 || $v === 0 || $v === '1' || $v === '0') {
        return (bool) (int) $v;
    }
    return $def;
}

function wj_c_num($v, float $def, float $min, float $max): float
{
    if (!is_numeric($v)) {
        return $def;
    }
    $f = (float) $v;
    if (!is_finite($f)) {
        return $def;
    }
    return max($min, min($max, $f));
}

function wj_c_int($v, int $def, int $min, int $max): int
{
    return (int) round(wj_c_num($v, $def, $min, $max));
}

function wj_c_str($v, string $def, int $max = 300): string
{
    if (!is_scalar($v)) {
        return $def;
    }
    return wj_clean_text($v, $max);
}

function wj_c_enum($v, array $allowed, string $def): string
{
    return is_string($v) && in_array($v, $allowed, true) ? $v : $def;
}

function wj_c_color($v, string $def): string
{
    return is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? strtoupper($v) : $def;
}

function wj_c_id($v, string $prefix): string
{
    if (is_string($v) && preg_match('/^[A-Za-z0-9_-]{1,40}$/', $v)) {
        return $v;
    }
    return $prefix . bin2hex(random_bytes(4));
}

function wj_c_list($v, int $maxItems, int $maxLen): array
{
    if (!is_array($v)) {
        return [];
    }
    $out = [];
    foreach ($v as $item) {
        $s = wj_c_str($item, '', $maxLen);
        if ($s !== '' && !in_array($s, $out, true)) {
            $out[] = $s;
        }
        if (count($out) >= $maxItems) {
            break;
        }
    }
    return $out;
}

/** URL de medio: ruta relativa del mismo hosting o URL http(s). */
function wj_c_url($v): string
{
    $s = wj_c_str($v, '', 500);
    if ($s === '') {
        return '';
    }
    if (preg_match('#^https?://[^\s<>"\'\\\\]+$#i', $s)) {
        return $s;
    }
    if (preg_match('#^[a-z][a-z0-9+.-]*:#i', $s) || preg_match('/[<>"\'\\\\]/', $s) || preg_match('#(^|/)\.\.(/|$)#', $s)) {
        return '';
    }
    return $s;
}

function wj_sanitize_config($in): array
{
    $d = wj_default_config();
    $in = is_array($in) ? $in : [];
    $c = [];

    $g = $in['general'] ?? [];
    $c['general'] = [
        'title' => wj_c_str($g['title'] ?? null, $d['general']['title'], 160),
        'cooldownMs' => wj_c_int($g['cooldownMs'] ?? null, 1200, 200, 10000),
        'hudVisible' => wj_c_bool($g['hudVisible'] ?? null, true),
        'logoUrl' => wj_c_url($g['logoUrl'] ?? ''),
        'syncIntervalMs' => wj_c_int($g['syncIntervalMs'] ?? null, 1000, 400, 10000),
    ];

    $t = $in['transitions'] ?? [];
    $c['transitions'] = [
        'type' => wj_c_enum($t['type'] ?? null, WJ_TRANSITIONS, 'noise'),
        'durationMs' => wj_c_int($t['durationMs'] ?? null, 1200, 200, 5000),
    ];

    $v = $in['voice'] ?? [];
    $ww = $v['wakeWord'] ?? [];
    $commands = [];
    foreach (WJ_VOICE_ACTIONS as $action) {
        $commands[$action] = array_key_exists($action, $v['commands'] ?? [])
            ? wj_c_list($v['commands'][$action], 20, 60)
            : $d['voice']['commands'][$action];
    }
    $ai = $v['aiIntent'] ?? [];
    $c['voice'] = [
        'enabled' => wj_c_bool($v['enabled'] ?? null, true),
        'engine' => wj_c_enum($v['engine'] ?? null, ['webspeech', 'webspeech-local'], 'webspeech'),
        'lang' => preg_match('/^[a-z]{2}(-[A-Z]{2})?$/', (string) ($v['lang'] ?? '')) ? (string) $v['lang'] : 'es-CO',
        'wakeWord' => [
            'enabled' => wj_c_bool($ww['enabled'] ?? null, true),
            'words' => array_key_exists('words', $ww) ? wj_c_list($ww['words'], 12, 40) : $d['voice']['wakeWord']['words'],
            'windowMs' => wj_c_int($ww['windowMs'] ?? null, 4000, 1000, 15000),
        ],
        'commands' => $commands,
        'aiIntent' => [
            'enabled' => wj_c_bool($ai['enabled'] ?? null, false),
            'provider' => wj_c_enum($ai['provider'] ?? null, ['claude', 'gemini'], 'claude'),
            'maxWords' => wj_c_int($ai['maxWords'] ?? null, 10, 2, 40),
        ],
        'ignoreWhileSpeaking' => wj_c_enum($v['ignoreWhileSpeaking'] ?? null, ['all', 'public'], 'all'),
    ];

    $ge = $in['gestures'] ?? [];
    $zone = $ge['zone'] ?? [];
    $x0 = wj_c_num($zone['x0'] ?? null, 0, 0, 1);
    $x1 = wj_c_num($zone['x1'] ?? null, 1, 0, 1);
    $y0 = wj_c_num($zone['y0'] ?? null, 0, 0, 1);
    $y1 = wj_c_num($zone['y1'] ?? null, 1, 0, 1);
    if ($x1 - $x0 < 0.1) {
        [$x0, $x1] = [0.0, 1.0];
    }
    if ($y1 - $y0 < 0.1) {
        [$y0, $y1] = [0.0, 1.0];
    }
    $gmap = [];
    foreach (WJ_GESTURES as $gesture) {
        $gmap[$gesture] = wj_c_enum($ge['map'][$gesture] ?? null, WJ_ACTIONS, $d['gestures']['map'][$gesture]);
    }
    $hold = [];
    foreach ($d['gestures']['holdMs'] as $gesture => $def) {
        $hold[$gesture] = wj_c_int($ge['holdMs'][$gesture] ?? null, $def, 100, 5000);
    }
    $mp = $ge['mediapipe'] ?? [];
    $sw = $ge['swipe'] ?? [];
    $c['gestures'] = [
        'enabled' => wj_c_bool($ge['enabled'] ?? null, true),
        'minConfidence' => wj_c_num($ge['minConfidence'] ?? null, 0.7, 0.3, 0.99),
        'fps' => wj_c_int($ge['fps'] ?? null, 20, 5, 60),
        'mirror' => wj_c_bool($ge['mirror'] ?? null, true),
        'hand' => wj_c_enum($ge['hand'] ?? null, ['any', 'Right', 'Left'], 'any'),
        'zone' => ['x0' => $x0, 'y0' => $y0, 'x1' => $x1, 'y1' => $y1],
        'swipe' => [
            'enabled' => wj_c_bool($sw['enabled'] ?? null, true),
            'minDistance' => wj_c_num($sw['minDistance'] ?? null, 0.22, 0.05, 0.9),
            'maxDurationMs' => wj_c_int($sw['maxDurationMs'] ?? null, 400, 150, 1500),
        ],
        'map' => $gmap,
        'holdMs' => $hold,
        'cameraLabel' => wj_c_str($ge['cameraLabel'] ?? null, '', 200),
        'mediapipe' => [
            'moduleUrl' => wj_c_url($mp['moduleUrl'] ?? '') ?: $d['gestures']['mediapipe']['moduleUrl'],
            'wasmUrl' => wj_c_url($mp['wasmUrl'] ?? '') ?: $d['gestures']['mediapipe']['wasmUrl'],
            'modelUrl' => wj_c_url($mp['modelUrl'] ?? '') ?: $d['gestures']['mediapipe']['modelUrl'],
            'delegate' => wj_c_enum($mp['delegate'] ?? null, ['GPU', 'CPU'], 'GPU'),
        ],
    ];

    $mk = $in['mediaKeys'] ?? [];
    $mkmap = [];
    foreach (WJ_MEDIA_KEYS as $key) {
        $mkmap[$key] = wj_c_enum($mk['map'][$key] ?? null, WJ_ACTIONS, $d['mediaKeys']['map'][$key]);
    }
    $c['mediaKeys'] = ['enabled' => wj_c_bool($mk['enabled'] ?? null, true), 'map' => $mkmap];

    $kb = $in['keyboard'] ?? [];
    $kbmap = [];
    $srcMap = isset($kb['map']) && is_array($kb['map']) ? $kb['map'] : $d['keyboard']['map'];
    foreach ($srcMap as $code => $action) {
        if (is_string($code) && preg_match('/^[A-Za-z0-9]{1,24}$/', $code) && count($kbmap) < 40) {
            $kbmap[$code] = wj_c_enum($action, WJ_ACTIONS, 'NONE');
        }
    }
    // Un mapa vacío debe llegar al navegador como objeto ({}), no como lista ([]).
    $c['keyboard'] = ['enabled' => wj_c_bool($kb['enabled'] ?? null, true), 'map' => $kbmap ?: new stdClass()];

    $r = $in['responses'] ?? [];
    $phrases = [];
    foreach (WJ_RESPONSE_KEYS as $key) {
        $phrases[$key] = array_key_exists($key, $r['phrases'] ?? [])
            ? wj_c_list($r['phrases'][$key], 10, 300)
            : $d['responses']['phrases'][$key];
    }
    $c['responses'] = [
        'enabled' => wj_c_bool($r['enabled'] ?? null, true),
        'respondTo' => wj_c_enum($r['respondTo'] ?? null, ['voice', 'all'], 'voice'),
        'output' => wj_c_enum($r['output'] ?? null, ['public', 'discreet', 'both'], 'public'),
        'phrases' => $phrases,
    ];

    $tts = $in['tts'] ?? [];
    $c['tts'] = [
        'voiceId' => preg_match('/^[A-Za-z0-9]{0,64}$/', (string) ($tts['voiceId'] ?? '')) ? (string) ($tts['voiceId'] ?? '') : '',
        'voiceName' => wj_c_str($tts['voiceName'] ?? null, '', 120),
        'modelId' => preg_match('/^[a-z0-9_.-]{1,64}$/', (string) ($tts['modelId'] ?? '')) ? (string) $tts['modelId'] : 'eleven_flash_v2_5',
        'languageCode' => preg_match('/^[a-z]{2}$/', (string) ($tts['languageCode'] ?? '')) ? (string) $tts['languageCode'] : 'es',
        'speed' => wj_c_num($tts['speed'] ?? null, 1.0, 0.7, 1.2),
        'stability' => wj_c_num($tts['stability'] ?? null, 0.5, 0, 1),
        'similarity' => wj_c_num($tts['similarity'] ?? null, 0.75, 0, 1),
        'style' => wj_c_num($tts['style'] ?? null, 0, 0, 1),
        'volume' => wj_c_num($tts['volume'] ?? null, 1, 0, 1),
    ];

    $au = $in['audio'] ?? [];
    $c['audio'] = [
        'publicSinkLabel' => wj_c_str($au['publicSinkLabel'] ?? null, '', 200),
        'discreetSinkLabel' => wj_c_str($au['discreetSinkLabel'] ?? null, '', 200),
    ];

    $re = $in['reminders'] ?? [];
    $c['reminders'] = [
        'enabled' => wj_c_bool($re['enabled'] ?? null, true),
        'onlyHigh' => wj_c_bool($re['onlyHigh'] ?? null, false),
        'maxPerScene' => wj_c_int($re['maxPerScene'] ?? null, 1, 1, 5),
        'output' => wj_c_enum($re['output'] ?? null, ['discreet', 'public', 'both', 'text'], 'discreet'),
        'provider' => wj_c_enum($re['provider'] ?? null, ['claude', 'gemini', 'local'], 'claude'),
        'checkIntervalMs' => wj_c_int($re['checkIntervalMs'] ?? null, 20000, 5000, 120000),
        'timeoutMs' => wj_c_int($re['timeoutMs'] ?? null, 800, 200, 5000),
        'applyTo' => wj_c_enum($re['applyTo'] ?? null, ['voice', 'all'], 'voice'),
        'template' => str_contains((string) ($re['template'] ?? ''), '{dato}') ? wj_c_str($re['template'], $d['reminders']['template'], 200) : $d['reminders']['template'],
        'saveTranscripts' => wj_c_bool($re['saveTranscripts'] ?? null, false),
    ];

    $ti = $in['timing'] ?? [];
    $c['timing'] = [
        'enabled' => wj_c_bool($ti['enabled'] ?? null, true),
        'output' => wj_c_enum($ti['output'] ?? null, ['discreet', 'public', 'both', 'text'], 'discreet'),
        'oneMinute' => wj_c_str($ti['oneMinute'] ?? null, $d['timing']['oneMinute'], 200) ?: $d['timing']['oneMinute'],
        'timeUp' => wj_c_str($ti['timeUp'] ?? null, $d['timing']['timeUp'], 200) ?: $d['timing']['timeUp'],
        'behindSeconds' => wj_c_int($ti['behindSeconds'] ?? null, 60, 10, 600),
        'targetMinutes' => wj_c_num($ti['targetMinutes'] ?? null, 15, 1, 240),
    ];

    $na = $in['narration'] ?? [];
    $c['narration'] = [
        'output' => wj_c_enum($na['output'] ?? null, ['public', 'discreet', 'both'], 'public'),
        'delayMs' => wj_c_int($na['delayMs'] ?? null, 500, 0, 5000),
    ];

    $aiCfg = $in['ai'] ?? [];
    $c['ai'] = [
        'claudeModel' => preg_match('/^[a-z0-9][a-z0-9.\-]{2,80}$/', (string) ($aiCfg['claudeModel'] ?? '')) ? (string) $aiCfg['claudeModel'] : $d['ai']['claudeModel'],
        'claudeEffort' => wj_c_enum($aiCfg['claudeEffort'] ?? null, ['low', 'medium', 'high'], 'low'),
        'geminiModel' => preg_match('/^[a-z0-9][a-z0-9.\-]{2,80}$/', (string) ($aiCfg['geminiModel'] ?? '')) ? (string) $aiCfg['geminiModel'] : $d['ai']['geminiModel'],
    ];

    // Bloques
    $blocks = [];
    $blockIds = [];
    foreach (is_array($in['blocks'] ?? null) ? $in['blocks'] : $d['blocks'] as $b) {
        if (!is_array($b) || count($blocks) >= 12) {
            continue;
        }
        $id = wj_c_id($b['id'] ?? null, 'b');
        if (isset($blockIds[$id])) {
            $id = wj_c_id(null, 'b');
        }
        $blockIds[$id] = true;
        $blocks[] = [
            'id' => $id,
            'name' => wj_c_str($b['name'] ?? null, 'Bloque', 120) ?: 'Bloque',
            'minutes' => round(wj_c_num($b['minutes'] ?? null, 4, 0.25, 120), 2),
        ];
    }
    if (!$blocks) {
        $blocks = $d['blocks'];
        $blockIds = array_fill_keys(array_column($blocks, 'id'), true);
    }
    $c['blocks'] = $blocks;

    // Escenas
    $scenes = [];
    $sceneIds = [];
    $factIds = [];
    foreach (is_array($in['scenes'] ?? null) ? $in['scenes'] : $d['scenes'] as $s) {
        if (!is_array($s) || count($scenes) >= 60) {
            continue;
        }
        $id = wj_c_id($s['id'] ?? null, 's');
        if (isset($sceneIds[$id])) {
            $id = wj_c_id(null, 's');
        }
        $sceneIds[$id] = true;
        $facts = [];
        foreach (is_array($s['facts'] ?? null) ? $s['facts'] : [] as $f) {
            if (!is_array($f) || count($facts) >= 12) {
                continue;
            }
            $text = wj_c_str($f['text'] ?? null, '', 400);
            if ($text === '') {
                continue;
            }
            $fid = wj_c_id($f['id'] ?? null, 'f');
            if (isset($factIds[$fid])) {
                $fid = wj_c_id(null, 'f');
            }
            $factIds[$fid] = true;
            $facts[] = [
                'id' => $fid,
                'text' => $text,
                'keywords' => wj_c_list($f['keywords'] ?? [], 12, 120),
                'priority' => wj_c_enum($f['priority'] ?? null, ['alta', 'media'], 'media'),
            ];
        }
        $media = is_array($s['media'] ?? null) ? $s['media'] : [];
        $narr = is_array($s['narration'] ?? null) ? $s['narration'] : [];
        $blockId = (string) ($s['blockId'] ?? '');
        $scenes[] = [
            'id' => $id,
            'blockId' => isset($blockIds[$blockId]) ? $blockId : $blocks[0]['id'],
            'type' => wj_c_enum($s['type'] ?? null, ['color', 'media'], 'color'),
            'title' => wj_c_str($s['title'] ?? null, '', 160),
            'subtitle' => wj_c_str($s['subtitle'] ?? null, '', 300),
            'color' => wj_c_color($s['color'] ?? null, '#10A13B'),
            'textColor' => wj_c_color($s['textColor'] ?? null, '#FFFFFF'),
            'effect' => wj_c_enum($s['effect'] ?? null, ['both', 'particles', 'gradient', 'none'], 'both'),
            'showNumber' => wj_c_bool($s['showNumber'] ?? null, true),
            'transition' => wj_c_enum($s['transition'] ?? null, array_merge([''], WJ_TRANSITIONS), ''),
            'media' => [
                'url' => wj_c_url($media['url'] ?? ''),
                'fit' => wj_c_enum($media['fit'] ?? null, ['cover', 'contain'], 'cover'),
                'loop' => wj_c_bool($media['loop'] ?? null, true),
                'muted' => wj_c_bool($media['muted'] ?? null, false),
            ],
            'notes' => wj_c_str($s['notes'] ?? null, '', 2000),
            'narration' => [
                'text' => wj_c_str($narr['text'] ?? null, '', 1500),
                'mode' => wj_c_enum($narr['mode'] ?? null, ['off', 'auto', 'cue'], 'off'),
            ],
            'facts' => $facts,
        ];
    }
    if (!$scenes) {
        wj_fail('Debe existir al menos una escena.');
    }
    $c['scenes'] = $scenes;

    return $c;
}

/** Configuración vigente (validada). Se guarda en config.json junto con su versión. */
function wj_config_get(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $stored = wj_store_read('config');
    return $cache = wj_sanitize_config(is_array($stored['config'] ?? null) ? $stored['config'] : wj_default_config());
}

function wj_config_version(): int
{
    return (int) (wj_store_read('config')['version'] ?? 1);
}

/** Valida y guarda la configuración; devuelve la nueva versión. */
function wj_config_save(array $cfg): int
{
    $clean = wj_sanitize_config($cfg);
    return (int) wj_store_update('config', static function (array &$data) use ($clean): int {
        $data['version'] = (int) ($data['version'] ?? 1) + 1;
        $data['updated'] = gmdate('c');
        $data['config'] = $clean;
        return $data['version'];
    }, [], true);
}
