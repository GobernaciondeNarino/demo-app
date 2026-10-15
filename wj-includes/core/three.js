/**
 * Punto único de importación de three.js.
 * Se desactiva la gestión de color para que los colores HEX de la marca
 * (#10A13B, #FFD500…) se vean en pantalla exactamente como están definidos.
 */
import * as THREE from '../vendor/three/three.module.js';

THREE.ColorManagement.enabled = false;

export { THREE };
