<?php
// Solo para pruebas: redirige las APIs externas al servidor simulado.
// Se carga con: php -d auto_prepend_file=tests/mock-api/prepend.php -S ...
$mock = getenv('WJ_MOCK_API') ?: 'http://127.0.0.1:8091';
define('WJ_ELEVENLABS_BASE', $mock);
define('WJ_ANTHROPIC_BASE', $mock);
define('WJ_GEMINI_BASE', $mock);
