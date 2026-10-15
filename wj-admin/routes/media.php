<?php
/**
 * Lista el contenido que se puede asignar a las escenas (protegido):
 *
 *  1. Carpetas junto a la presentación con una página (index.html), por ejemplo
 *     /ctIA-26/fagosEvo/ → «fagosEvo/». Son las «películas» web.
 *  2. Videos, imágenes y páginas .html dentro de esas carpetas.
 *  3. Archivos de wj-content/media.
 *
 * Las URL se devuelven relativas a la carpeta de la presentación, así la
 * configuración sigue funcionando si el sitio se mueve de carpeta o de dominio.
 * Los archivos se suben por FTP o con el Administrador de archivos de Plesk.
 */
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';

wj_require_auth();

const WJ_MEDIA_EXT = [
    'mp4' => 'video', 'webm' => 'video', 'mov' => 'video', 'm4v' => 'video',
    'jpg' => 'image', 'jpeg' => 'image', 'png' => 'image', 'webp' => 'image', 'gif' => 'image', 'avif' => 'image',
    'html' => 'web', 'htm' => 'web',
];
const WJ_SKIP_DIRS = ['wj-admin', 'wj-includes', 'wj-content', 'tests', 'docs', 'node_modules'];
const WJ_MEDIA_LIMIT = 500;

$files = [];

function wj_rel_url(string $rel): string
{
    return implode('/', array_map('rawurlencode', explode('/', $rel)));
}

/** Recorre $dir (hasta $depth niveles) y agrega los archivos reconocidos. */
function wj_scan(string $base, string $dir, string $prefix, int $depth, string $group, array &$files): void
{
    $items = @scandir($dir) ?: [];
    foreach ($items as $name) {
        if (count($files) >= WJ_MEDIA_LIMIT || $name === '' || $name[0] === '.') {
            continue;
        }
        $path = $dir . '/' . $name;
        $real = realpath($path);
        if ($real === false || !str_starts_with($real, $base . DIRECTORY_SEPARATOR)) {
            continue; // enlaces simbólicos que salen de la carpeta
        }
        if (is_dir($path)) {
            if ($depth > 1) {
                wj_scan($base, $path, $prefix . $name . '/', $depth - 1, $group, $files);
            }
            continue;
        }
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $kind = WJ_MEDIA_EXT[$ext] ?? null;
        if ($kind === null || ($kind === 'web' && in_array(strtolower($name), ['index.html', 'index.htm'], true))) {
            continue; // los index.* se listan como la carpeta
        }
        $files[] = [
            'url' => wj_rel_url($prefix . $name),
            'name' => $prefix . $name,
            'kind' => $kind,
            'group' => $group,
            'bytes' => (int) @filesize($path),
            'modified' => (int) @filemtime($path),
        ];
    }
}

$root = realpath(WJ_ROOT);

// 1 y 2: carpetas junto a la presentación.
foreach (@scandir($root) ?: [] as $name) {
    if ($name === '' || $name[0] === '.' || in_array($name, WJ_SKIP_DIRS, true) || !is_dir($root . '/' . $name)) {
        continue;
    }
    $dir = $root . '/' . $name;
    $real = realpath($dir);
    if ($real === false || !str_starts_with($real, $root . DIRECTORY_SEPARATOR)) {
        continue;
    }
    foreach (['index.html', 'index.htm', 'index.php'] as $index) {
        if (is_file($dir . '/' . $index)) {
            $files[] = [
                'url' => rawurlencode($name) . '/',
                'name' => $name . '/',
                'kind' => 'web',
                'group' => 'folder',
                'bytes' => (int) filesize($dir . '/' . $index),
                'modified' => (int) filemtime($dir . '/' . $index),
            ];
            break;
        }
    }
    wj_scan($real, $dir, $name . '/', 2, 'folder', $files);
}

// 3: wj-content/media.
if (is_dir(WJ_MEDIA_DIR)) {
    $base = realpath(WJ_MEDIA_DIR);
    wj_scan($base, $base, 'wj-content/media/', 3, 'media', $files);
}

usort($files, static fn ($a, $b) => [$a['group'] === 'media', $a['kind'] !== 'web', $a['name']] <=> [$b['group'] === 'media', $b['kind'] !== 'web', $b['name']]);
wj_json(['ok' => true, 'files' => $files]);
