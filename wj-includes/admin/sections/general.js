/** Sección 10: ajustes generales, diagnóstico del servidor y copia de seguridad. */
import { h, toast } from '../../ui/dom.js';
import { card, grid, note, asyncButton, fmtBytes, statusPill } from './ui.js';

export default {
  id: 'general',
  title: 'General',
  render(ctx) {
    const { f } = ctx;
    const diag = h('div', { class: 'diag' }, h('p', { class: 'hint' }, 'Consultando el servidor…'));

    const runDiag = async () => {
      try {
        const s = await ctx.api.get('status');
        // La carpeta de datos NO debe poder leerse desde el navegador.
        let exposed = null;
        try {
          const r = await fetch(ctx.resolveUrl('wj-content/data/canary.json'), { cache: 'no-store' });
          const text = r.ok ? await r.text() : '';
          exposed = r.ok && text.includes('aviso');
        } catch { exposed = false; }
        const row = (label, ok, detail = '') => h('li', {}, statusPill(ok, 'OK', 'Revisar'), ` ${label}`, detail ? h('small', {}, detail) : null);
        diag.replaceChildren(h('ul', { class: 'plain' },
          row(`PHP ${s.php}`, s.phpOk, s.phpOk ? '' : 'Se requiere PHP 8.0 o superior.'),
          ...Object.entries(s.extensions).map(([ext, ok]) => row(`Extensión ${ext}`, ok || ext === 'mbstring', ok ? '' : ext === 'mbstring' ? 'Opcional.' : 'Actívela en Plesk › Configuración de PHP.')),
          row('HTTPS', s.https, s.https ? '' : 'La cámara y el micrófono solo funcionan con HTTPS (o localhost). Active el certificado SSL en Plesk.'),
          row('Carpeta de datos con permiso de escritura', s.dataWritable),
          row('Caché de audio con permiso de escritura', s.cacheWritable, `${s.ttsCache.files} audios · ${fmtBytes(s.ttsCache.bytes)}`),
          row('Carpeta de datos protegida (no se puede descargar)', exposed === false, exposed ? '¡Atención! El servidor está entregando archivos de wj-content/data. Verifique que Apache lea los .htaccess o bloquee esa carpeta en Plesk.' : ''),
          row('Sin contraseña en .env', !s.envAdminPassword, s.envAdminPassword ? 'El administrador ya existe: borre ADMIN_PASSWORD del archivo .env.' : ''),
          h('li', {}, h('small', {}, `Carpeta pública: ${s.basePath} · Servidor: ${s.server || 'desconocido'} · Versión ${s.version}`))));
      } catch (err) {
        diag.replaceChildren(h('p', { class: 'callout callout-warn' }, err.message));
      }
    };
    runDiag();

    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const cfg = data.config || data;
        if (!Array.isArray(cfg.scenes)) throw new Error('El archivo no parece una configuración de la presentación.');
        if (!confirm('¿Reemplazar la configuración actual por la del archivo? (las llaves API no se tocan)')) return;
        const r = await ctx.api.post('config', { action: 'save', config: cfg });
        toast(`Configuración importada (versión ${r.version}).`, 'ok');
        await ctx.app.loadConfig();
        ctx.rerender();
      } catch (err) {
        toast(err.message, 'error', 6000);
      } finally {
        fileInput.value = '';
      }
    });

    return h('div', { class: 'stack' },
      card('Presentación',
        grid(
          f.text('Título', 'general.title', { maxlength: 160, hint: 'Se ve en la pantalla de inicio y en la pestaña del navegador.' }),
          f.number('Cooldown global', 'general.cooldownMs', { min: 200, max: 10000, step: 100, suffix: 'ms', hint: 'Evita que un gesto y una palabra casi simultáneos salten dos escenas.' }),
          f.toggle('HUD visible al iniciar (tecla H)', 'general.hudVisible'),
          f.text('Logo en las escenas (opcional)', 'general.logoUrl', { maxlength: 500, placeholder: 'wj-content/media/logo-gobernacion.png', hint: 'Use el logo oficial según el Manual de Identidad Visual. Vacío = sin logo.' }),
          f.number('Frecuencia de sincronización', 'general.syncIntervalMs', { min: 400, max: 10000, step: 100, suffix: 'ms', hint: 'Cada cuánto la presentación consulta al servidor (comandos remotos y cambios del panel).' }))),
      card('Diagnóstico del servidor', diag, h('div', { class: 'inline' }, asyncButton('Volver a comprobar', runDiag))),
      card('Caché de audios',
        h('p', { class: 'hint' }, 'Los mp3 generados por ElevenLabs se guardan en wj-admin/cache/tts. Vaciarla obliga a generarlos de nuevo (consume créditos).'),
        h('div', { class: 'inline' }, asyncButton('Vaciar caché', async () => {
          if (!confirm('¿Borrar todos los audios generados?')) return;
          const r = await ctx.api.post('tts', { action: 'clear' });
          toast(`${r.deleted} audios borrados.`, 'ok');
          runDiag();
        }))),
      card('Copia de seguridad',
        h('p', { class: 'hint' }, 'Exporta o importa la configuración (escenas, bloques, frases…). Las llaves API nunca se incluyen.'),
        h('div', { class: 'inline' },
          h('button', {
            class: 'btn btn-ghost', type: 'button',
            onclick: () => {
              const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), config: ctx.saved }, null, 2)], { type: 'application/json' });
              const a = h('a', { href: URL.createObjectURL(blob), download: `presentacion-config-${new Date().toISOString().slice(0, 10)}.json` });
              document.body.append(a);
              a.click();
              a.remove();
            },
          }, 'Exportar JSON'),
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => fileInput.click() }, 'Importar JSON'),
          fileInput,
          asyncButton('Restaurar valores por defecto', async () => {
            if (!confirm('¿Restaurar toda la configuración por defecto? Se perderán escenas y frases personalizadas (las llaves API se conservan).')) return;
            await ctx.api.post('config', { action: 'reset' });
            await ctx.app.loadConfig();
            ctx.rerender();
            toast('Configuración restaurada.', 'ok');
          })),
        note('Los datos del panel se guardan en archivos JSON dentro de wj-content/data (sin base de datos). Para respaldar todo, incluidas las llaves cifradas, copie esa carpeta completa con el archivo keys.php.')));
  },
};
