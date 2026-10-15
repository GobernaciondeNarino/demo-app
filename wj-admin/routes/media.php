<?php
/**
 * Lista los archivos multimedia de wj-content/media (protegido) para
 * asignarlos a las escenas desde el panel. Se suben por FTP o con el
 * Administrador de archivos de Plesk.
 */
declare(strict_types=1);
require dirname(__DIR__) . '/bootstrap.php';

wj_require_auth();

$allowed = [
    'mp4' => 'video', 'webm' => 'video', 'mov' => 'video', 'm4v' => 'video',
    'jpg' => 'image', 'jpeg' => 'image', 'png' => 'image', 'webp' => 'image', 'gif' => 'image', 'avif' => 'image',
    'mp3' => 'audio', 'wav' => 'audio', 'ogg' => 'audio', 'm4a' => 'audio',
];
$files = [];
if (is_dir(WJ_MEDIA_DIR)) {
    $base = realpath(WJ_MEDIA_DIR);
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $file) {
        if (count($files) >= 500 || !$file->isFile()) {
            continue;
        }
        $real = $file->getRealPath();
        $ext = strtolower($file->getExtension());
        if ($real === false || !str_starts_with($real, $base . DIRECTORY_SEPARATOR) || !isset($allowed[$ext])) {
            continue;
        }
        $rel = str_replace(DIRECTORY_SEPARATOR, '/', substr($real, strlen($base) + 1));
        $files[] = [
            'url' => 'wj-content/media/' . implode('/', array_map('rawurlencode', explode('/', $rel))),
            'name' => $rel,
            'kind' => $allowed[$ext],
            'bytes' => $file->getSize(),
            'modified' => $file->getMTime(),
        ];
    }
}
usort($files, static fn ($a, $b) => strcmp($a['name'], $b['name']));
wj_json(['ok' => true, 'files' => $files]);
