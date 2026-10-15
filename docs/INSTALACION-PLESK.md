# Instalación en Plesk

Guía paso a paso para publicar la presentación en un dominio administrado con Plesk (Linux o Windows). No necesita base de datos, Composer, Node ni compilar nada.

## 1. Requisitos

| Requisito | Dónde se revisa en Plesk | Notas |
|---|---|---|
| PHP 8.0 o superior (recomendado 8.2+) | Sitios web y dominios › *dominio* › Configuración de PHP | Modo «FPM servido por Apache» o «FastCGI servido por Apache». |
| Extensiones `openssl` y `curl` | Configuración de PHP › extensiones | Vienen activas casi siempre. `mbstring` es opcional. |
| Certificado SSL (HTTPS) | SSL/TLS Certificates › Let's Encrypt | Obligatorio: sin HTTPS el navegador no deja usar cámara ni micrófono. Active también «Redirección SEO 301 de HTTP a HTTPS». |
| Salida a internet desde el servidor | — | PHP debe poder conectarse a `api.elevenlabs.io`, `api.anthropic.com` y `generativelanguage.googleapis.com` (puerto 443). |

En el computador de la presentación: **Google Chrome de escritorio** actualizado (reconocimiento de voz, `setSinkId` para AirPods y WebGL).

## 2. Subir los archivos

1. En GitHub, abra el repositorio › **Code** › **Download ZIP**.
2. Plesk › **Archivos** › entre a `httpdocs`.
3. (Opcional) Cree una subcarpeta, por ejemplo `ponencia`, y entre en ella.
4. **Cargar** › elija el ZIP › clic derecho sobre el ZIP › **Extraer archivos**.
5. Si quedó una carpeta intermedia (por ejemplo `demo-app-main`), renómbrela a un nombre corto (`ponencia`) o mueva su contenido.

La aplicación funciona en la raíz del dominio o en cualquier subcarpeta: todas las rutas son relativas.

### Películas web en carpetas

Suba cada película (carpeta con su `index.html`) **dentro de la carpeta de la presentación**, por ejemplo `httpdocs/ctIA-26/fagosEvo/`. Así queda en la misma dirección base (`https://tic.narino.gov.co/ctIA-26/fagosEvo/`) y el panel la lista en *Escenas › Elegir película o archivo…*. Debe estar en el mismo dominio: el `.htaccess` permite incrustar páginas solo del mismo sitio (`X-Frame-Options: SAMEORIGIN`) y así el teclado y el clicker siguen funcionando dentro de la película.

## 3. Permisos de escritura

PHP necesita escribir en dos carpetas:

- `wj-content/data/` — configuración, usuarios, llaves cifradas, estado en vivo.
- `wj-admin/cache/tts/` — audios generados por ElevenLabs.

Con la extracción de Plesk, el dueño de los archivos ya es el usuario del sitio y no hay que cambiar nada. Si el panel muestra un error de permisos: Archivos › clic derecho en la carpeta › **Cambiar permisos** › el usuario del sitio debe tener *lectura, escritura y ejecución*.

## 4. Crear el administrador

Abra `https://su-dominio/ponencia/wj-admin/`.

La primera visita genera `wj-content/data/keys.php`, que contiene:

- la **llave maestra de cifrado** (no la comparta; si se pierde, las llaves API guardadas no se podrán leer y habrá que pegarlas de nuevo);
- el **código de instalación**, en un comentario: `// Código de instalación (solo para crear el primer administrador): XXXX-XXXX-XXXX`.

Ábralo con el editor del Administrador de archivos de Plesk, copie el código y complete el formulario (usuario y contraseña de al menos 10 caracteres).

**Alternativa con `.env`**: copie `.env.example` como `.env` en la carpeta de la aplicación y defina `ADMIN_USER` y `ADMIN_PASSWORD`. El administrador se crea en la primera visita; después **borre `ADMIN_PASSWORD`** del archivo (el panel lo recuerda en *General › Diagnóstico*).

## 5. Configurar las APIs

Panel › **APIs**:

1. **ElevenLabs**: pegue la llave › *Guardar llave* › *Probar conexión* › elija la voz (las masculinas aparecen primero) › modelo (Flash v2.5 por defecto).
2. **Claude** y/o **Gemini**: pegue la llave › *Guardar llave* › *Probar conexión*.
3. Pulse **Guardar cambios** (barra inferior). El servidor genera los audios de todas las frases; el avance aparece en la barra.

Las llaves se guardan cifradas con AES-256-GCM y nunca se envían al navegador.

## 6. Comprobar la instalación

Panel › **General › Diagnóstico del servidor** debe mostrar todo en «OK»:

- PHP y extensiones.
- HTTPS.
- Carpetas con permiso de escritura.
- **Carpeta de datos protegida**: el panel intenta descargar `wj-content/data/canary.json`; si lo logra, el servidor está entregando archivos privados (ver abajo).

### Si la carpeta de datos aparece expuesta

Plesk usa nginx delante de Apache. Los `.htaccess` funcionan para todo lo que pasa por Apache, pero si en *Configuración de Apache y nginx* está activo «Servir archivos estáticos directamente mediante nginx» con extensiones como `json`, nginx podría entregarlos sin consultar el `.htaccess`. Opciones:

- Quite `json` de la lista de extensiones estáticas de nginx, **o**
- agregue en *Directivas adicionales de nginx*:

```nginx
location ~ /wj-content/data/ { deny all; return 404; }
location ~ /wj-admin/(lib|cache)/ { deny all; return 404; }
```

(Si la aplicación está en una subcarpeta, la expresión igual coincide.)

Aunque la carpeta quedara expuesta, los datos están en una subcarpeta con nombre aleatorio, las llaves van cifradas y `keys.php` se ejecuta en lugar de descargarse; aun así, corríjalo.

### Plesk en Windows (IIS)

El archivo `web.config` incluido bloquea `data`, `lib`, `cache` y `tests`, agrega los tipos MIME de `.mjs`, `.wasm`, `.task` y `.woff2`, y define `index.html` como documento por defecto.

## 7. Actualizar a una versión nueva

1. Descargue el ZIP nuevo.
2. **No borre** `wj-content/data/` (configuración, usuarios y llaves) ni `wj-admin/cache/tts/` (audios).
3. Extraiga el ZIP encima, reemplazando los archivos.
4. Recargue el panel y la presentación (Ctrl+Shift+R si el navegador guardó versiones viejas).

## 8. Respaldo

- Panel › General › **Exportar JSON**: configuración (escenas, bloques, frases) sin llaves.
- Respaldo completo: copie la carpeta `wj-content/data/` entera (incluye `keys.php`; sin ese archivo las llaves cifradas no se pueden leer).

## 9. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| «La carpeta wj-content/data no tiene permisos de escritura» | Permisos | Paso 3. |
| La cámara o el micrófono no se activan | La página no está en HTTPS | Active SSL y la redirección a HTTPS. |
| «Configure la llave de ElevenLabs» en la presentación | Falta la llave o la voz | Panel › APIs. Mientras tanto se usa la voz del navegador. |
| ElevenLabs responde 401 | Llave inválida o sin permisos | Cree una llave con permisos de *Text to Speech* y *Voices*. |
| «sin conexión o tiempo agotado» al probar APIs | El servidor no tiene salida a internet o un firewall la bloquea | Pida al proveedor del hosting habilitar conexiones HTTPS salientes. |
| La voz no reconoce «Ñaño» | El reconocimiento lo escribe distinto | Panel › Voz › agregue la variante que aparece en *Monitor › Último texto escuchado*. |
| Los AirPods no avanzan | Otra pestaña o app tiene la sesión multimedia | Cierre otras pestañas con audio (YouTube, Spotify) y la prueba de AirPods del panel. |
| Las teclas multimedia van a otra app | macOS envía las teclas a la última app que reprodujo audio | Haga clic en la presentación y pulse una vez reproducir/pausar desde el Centro de control. |
