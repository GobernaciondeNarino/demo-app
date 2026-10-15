/** Sección 9: dron (en pausa). Información para retomar el diseño. */
import { h } from '../../ui/dom.js';
import { card, note } from './ui.js';

export default {
  id: 'dron',
  title: 'Dron',
  intro: 'Sección en pausa: el conteo del público con dron se diseñará cuando se retome.',
  render() {
    return h('div', { class: 'stack' },
      note('En pausa. La arquitectura de escenas ya admite video (escenas de tipo «medio»), de modo que la escena del dron se podrá agregar sin cambiar el resto del sistema.', 'warn'),
      card('Lo que se tiene previsto',
        h('ul', { class: 'plain' },
          h('li', {}, 'DJI Mini → transmisión RTMP desde la app de vuelo → MediaMTX convierte a WebRTC (< 1 s de retraso) → textura de video en la presentación.'),
          h('li', {}, 'Conteo estable: el dron se mantiene fijo frente al público; se toma la mediana de varios segundos.'),
          h('li', {}, 'Plan B: cámara gran angular fija detrás del escenario, con el mismo flujo; cifra manual como último recurso.'),
          h('li', {}, 'El piloto inicia y detiene el conteo; la voz y los gestos solo cambian de escena, nunca mueven el dron.'))),
      card('Antes de identificar hombres y mujeres',
        h('p', {}, 'Clasificar a las personas por sexo o género a partir de su imagen es una inferencia biométrica sobre datos sensibles (Ley 1581 de 2012). Exige autorización previa, expresa e informada de cada asistente, y estos modelos se equivocan más con algunos grupos de personas.'),
        h('p', {}, 'Alternativa con el mismo efecto visual y sin datos sensibles: entregar al ingreso tarjetas o manillas de dos colores y pedir que el público las levante; la IA cuenta los colores, no a las personas.')),
      card('Permisos y seguridad',
        h('ul', { class: 'plain' },
          h('li', {}, 'No volar sobre las personas; solo frente a ellas, a distancia segura.'),
          h('li', {}, 'Permiso escrito del auditorio y revisión de la normativa vigente de la Aerocivil.'),
          h('li', {}, 'Avisar al público que se está grabando y si el video se guarda o no.'),
          h('li', {}, 'Ensayo previo en el mismo lugar: en interiores no hay GPS y el dron puede derivar.'))));
  },
};
