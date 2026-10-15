<?php
/**
 * Panel admin (interfaz). La lógica está en wj-includes/admin/ y la API en routes/.
 */
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

// Política de seguridad de contenidos: solo recursos propios, más los hosts
// que se hayan configurado para MediaPipe (si se usa un CDN).
$hosts = [];
try {
    foreach (wj_config_get()['gestures']['mediapipe'] as $url) {
        if (is_string($url) && preg_match('#^https://([a-z0-9.-]+)#i', $url, $m)) {
            $hosts['https://' . strtolower($m[1])] = true;
        }
    }
} catch (Throwable $e) {
    // Primera ejecución: aún no hay configuración.
}
$extra = $hosts ? ' ' . implode(' ', array_keys($hosts)) : '';
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'{$extra}; connect-src 'self'{$extra}; style-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
header('X-Frame-Options: SAMEORIGIN');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
?><!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Panel de la presentación</title>
  <link rel="stylesheet" href="../wj-includes/css/fonts.css">
  <link rel="stylesheet" href="../wj-includes/css/admin.css">
  <script type="module" src="../wj-includes/admin/AdminApp.js"></script>
</head>
<body>
  <a class="skip" href="#content">Saltar al contenido</a>
  <div id="admin"><p class="boot">Cargando panel…</p></div>
  <noscript><p class="boot">El panel necesita JavaScript.</p></noscript>
</body>
</html>
