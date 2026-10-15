/** Sección 13: seguridad de la cuenta. */
import { h, toast } from '../../ui/dom.js';
import { card, note } from './ui.js';

export default {
  id: 'seguridad',
  title: 'Seguridad',
  render(ctx) {
    const err = h('p', { class: 'form-error', role: 'alert' });
    const form = h('form', { class: 'form-grid' },
      h('label', { class: 'field' }, 'Contraseña actual', h('input', { name: 'current', type: 'password', autocomplete: 'current-password', required: true })),
      h('label', { class: 'field' }, 'Nueva contraseña (mínimo 10 caracteres)', h('input', { name: 'new', type: 'password', autocomplete: 'new-password', required: true, minlength: 10 })),
      h('label', { class: 'field' }, 'Repita la nueva contraseña', h('input', { name: 'new2', type: 'password', autocomplete: 'new-password', required: true, minlength: 10 })),
      err,
      h('div', { class: 'inline' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Cambiar contraseña')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const d = new FormData(form);
      if (d.get('new') !== d.get('new2')) {
        err.textContent = 'Las contraseñas nuevas no coinciden.';
        return;
      }
      try {
        await ctx.api.post('session', { action: 'password', current: d.get('current'), new: d.get('new') });
        // La respuesta trae un token CSRF nuevo; se recarga para usar la nueva sesión.
        toast('Contraseña cambiada. Las demás sesiones se cerraron.', 'ok');
        setTimeout(() => location.reload(), 1200);
      } catch (ex) {
        err.textContent = ex.message;
      }
    });
    const exp = ctx.app.session.expires ? new Date(ctx.app.session.expires * 1000) : null;
    return h('div', { class: 'stack' },
      card('Cambiar contraseña', form,
        note('Al cambiarla se cierran las sesiones abiertas en otros equipos (incluida la presentación: vuelva a iniciar sesión allí).')),
      card('Sesión',
        h('p', {}, exp ? `Su sesión expira el ${exp.toLocaleString('es-CO')} (8 horas después de iniciar sesión).` : ''),
        note('Inicie sesión poco antes del evento para que la sesión cubra toda la ponencia.')),
      card('Cómo se protege la información',
        h('ul', { class: 'plain' },
          h('li', {}, 'Contraseñas con bcrypt; bloqueo de 15 minutos tras 5 intentos fallidos.'),
          h('li', {}, 'Sesión en cookie cifrada (AES-256-GCM), httpOnly y SameSite=Strict; token CSRF en cada cambio.'),
          h('li', {}, 'Llaves API cifradas en el servidor; el navegador solo recibe una versión enmascarada.'),
          h('li', {}, 'Datos en archivos JSON dentro de una carpeta privada con nombre aleatorio, bloqueada por .htaccess / web.config.'),
          h('li', {}, 'Las peticiones a ElevenLabs, Claude y Gemini salen desde el servidor (proxy).'))));
  },
};
