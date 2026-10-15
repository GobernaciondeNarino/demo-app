/**
 * Gestos con la cámara usando MediaPipe GestureRecognizer (corre localmente
 * en el navegador, sin enviar video a ningún servidor).
 *
 * - Gestos nativos sostenidos: Closed_Fist, Open_Palm, Pointing_Up,
 *   Thumb_Up, Thumb_Down, Victory, ILoveYou (tiempo de sostenido por gesto).
 * - Swipe calculado aparte: desplazamiento horizontal de la palma mayor que
 *   el umbral en menos de N ms.
 * - Filtros: confianza mínima, mano dominante, zona activa del encuadre.
 * - El video no se muestra en la presentación; el panel puede pasar un canvas
 *   para ver la vista previa con el esqueleto de la mano.
 */
export const GESTURE_LABELS = {
  swipe_left: 'Swipe a la izquierda',
  swipe_right: 'Swipe a la derecha',
  Closed_Fist: 'Puño cerrado',
  Open_Palm: 'Palma abierta',
  Pointing_Up: 'Índice arriba',
  Thumb_Up: 'Pulgar arriba',
  Thumb_Down: 'Pulgar abajo',
  Victory: 'Victoria (V)',
  ILoveYou: 'Te quiero (🤟)',
};

const PALM = [0, 5, 9, 13, 17];

export class GestureInput extends EventTarget {
  /**
   * @param {{dispatch:Function, resolveUrl:Function, canvas?:HTMLCanvasElement}} opts
   */
  constructor({ dispatch, resolveUrl, canvas = null }) {
    super();
    this.dispatch = dispatch;
    this.resolveUrl = resolveUrl;
    this.canvas = canvas;
    this.status = 'off';
    this.running = false;
    this.track = [];
    this.hold = { gesture: 'None', start: 0, fired: false };
    this.swipeBlockUntil = 0;
    this.last = { gesture: 'None', score: 0, hand: '' };
    this.loop = this.loop.bind(this);
  }

  configure(cfg) {
    const prev = this.cfg;
    this.cfg = cfg;
    if (!this.wantStart) return;
    if (!cfg.enabled) return this.stop(true);
    const needsRestart = !prev || !this.running
      || prev.cameraLabel !== cfg.cameraLabel
      || JSON.stringify(prev.mediapipe) !== JSON.stringify(cfg.mediapipe);
    if (needsRestart) {
      this.stop(true);
      this.start();
    }
  }

  async start() {
    this.wantStart = true;
    if (!this.cfg?.enabled) return this.setStatus('off');
    if (this.running || this.starting) return this.status;
    this.starting = true;
    this.setStatus('loading', 'abriendo cámara');
    try {
      await this.openCamera();
      this.setStatus('loading', 'cargando modelo de gestos');
      await this.loadModel();
      this.running = true;
      this.setStatus('on');
      this.lastFrameAt = 0;
      requestAnimationFrame(this.loop);
    } catch (err) {
      console.warn('GestureInput', err);
      this.closeCamera();
      this.setStatus('error', err?.name === 'NotAllowedError' ? 'permiso de cámara denegado' : err?.message || 'no se pudo iniciar');
    } finally {
      this.starting = false;
    }
    return this.status;
  }

  stop(keepIntent = false) {
    if (!keepIntent) this.wantStart = false;
    this.running = false;
    this.closeCamera();
    this.setStatus('off');
  }

  async openCamera() {
    let deviceId;
    if (this.cfg.cameraLabel) {
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const dev = devices.find((d) => d.kind === 'videoinput' && d.label === this.cfg.cameraLabel);
      deviceId = dev?.deviceId;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
      },
    });
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  closeCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }

  async loadModel() {
    const mp = this.cfg.mediapipe;
    const key = JSON.stringify(mp);
    if (this.recognizer && this.modelKey === key) return;
    this.recognizer?.close?.();
    const vision = await import(this.resolveUrl(mp.moduleUrl));
    this.connections = vision.GestureRecognizer.HAND_CONNECTIONS;
    const fileset = await vision.FilesetResolver.forVisionTasks(this.resolveUrl(mp.wasmUrl));
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: this.resolveUrl(mp.modelUrl), delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
    try {
      this.recognizer = await vision.GestureRecognizer.createFromOptions(fileset, options(mp.delegate));
    } catch (err) {
      if (mp.delegate !== 'GPU') throw err;
      this.recognizer = await vision.GestureRecognizer.createFromOptions(fileset, options('CPU'));
    }
    this.modelKey = key;
  }

  loop(now) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const interval = 1000 / (this.cfg.fps || 20);
    if (now - this.lastFrameAt < interval || !this.video || this.video.readyState < 2) return;
    this.lastFrameAt = now;
    let res;
    try {
      res = this.recognizer.recognizeForVideo(this.video, now);
    } catch (err) {
      return;
    }
    const hands = this.readHands(res);
    const hand = hands.find((h) => h.eligible) || null;
    this.updateSwipe(hand, now);
    this.updateHold(hand, now);
    this.last = hand ? { gesture: hand.gesture, score: hand.score, hand: hand.hand } : { gesture: 'None', score: 0, hand: '' };
    if (this.canvas) this.draw(hands, now);
    if (!this.lastEmit || now - this.lastEmit > 250) {
      this.lastEmit = now;
      this.dispatchEvent(new CustomEvent('frame', { detail: this.last }));
    }
  }

  readHands(res) {
    const cfg = this.cfg;
    const z = cfg.zone;
    return (res.landmarks || []).map((lm, i) => {
      const pts = lm.map((p) => ({ x: cfg.mirror ? 1 - p.x : p.x, y: p.y }));
      const cx = PALM.reduce((s, k) => s + pts[k].x, 0) / PALM.length;
      const cy = PALM.reduce((s, k) => s + pts[k].y, 0) / PALM.length;
      // MediaPipe etiqueta la mano suponiendo imagen de espejo; la cámara entrega
      // la imagen sin voltear, así que la mano real es la contraria.
      const label = res.handedness?.[i]?.[0]?.categoryName || '';
      const hand = label === 'Left' ? 'Right' : label === 'Right' ? 'Left' : '';
      const g = res.gestures?.[i]?.[0];
      const inZone = cx >= z.x0 && cx <= z.x1 && cy >= z.y0 && cy <= z.y1;
      const handOk = cfg.hand === 'any' || cfg.hand === hand;
      return { pts, cx, cy, hand, gesture: g?.categoryName || 'None', score: g?.score || 0, eligible: inZone && handOk };
    });
  }

  updateHold(h, now) {
    const g = h && h.score >= this.cfg.minConfidence ? h.gesture : 'None';
    if (g !== this.hold.gesture) {
      this.hold = { gesture: g, start: now, fired: false };
      return;
    }
    if (g === 'None' || this.hold.fired) return;
    const action = this.cfg.map[g];
    if (!action || action === 'NONE') return;
    if (now - this.hold.start >= (this.cfg.holdMs[g] ?? 800)) {
      this.hold.fired = true;
      this.dispatch({ action, source: 'gesture', confidence: h.score, meta: { gesture: g } });
      this.emitDetected(g, action);
    }
  }

  updateSwipe(h, now) {
    const sw = this.cfg.swipe;
    if (!sw.enabled || !h) {
      this.track = [];
      return;
    }
    this.track.push({ x: h.cx, y: h.cy, t: now });
    while (this.track.length && now - this.track[0].t > sw.maxDurationMs) this.track.shift();
    if (now < this.swipeBlockUntil || this.track.length < 3) return;
    const first = this.track[0];
    const dx = h.cx - first.x;
    const dy = h.cy - first.y;
    if (Math.abs(dx) >= sw.minDistance && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const name = dx < 0 ? 'swipe_left' : 'swipe_right';
      const action = this.cfg.map[name];
      this.track = [];
      this.swipeBlockUntil = now + 700;
      this.hold.fired = true;
      if (action && action !== 'NONE') {
        this.dispatch({ action, source: 'gesture', confidence: Math.min(1, Math.abs(dx) / sw.minDistance * 0.8), meta: { gesture: name } });
      }
      this.emitDetected(name, action);
    }
  }

  emitDetected(gesture, action) {
    this.dispatchEvent(new CustomEvent('gesture', { detail: { gesture, action } }));
  }

  /** Vista previa para el panel: video, zona activa y esqueleto de la mano. */
  draw(hands, now) {
    const c = this.canvas;
    const v = this.video;
    const w = v.videoWidth || 640;
    const h = v.videoHeight || 480;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d');
    ctx.save();
    if (this.cfg.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, w, h);
    ctx.restore();

    const z = this.cfg.zone;
    ctx.strokeStyle = 'rgba(255,213,0,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(z.x0 * w, z.y0 * h, (z.x1 - z.x0) * w, (z.y1 - z.y0) * h);
    ctx.setLineDash([]);

    for (const hand of hands) {
      const color = hand.eligible ? '#10A13B' : 'rgba(255,255,255,0.5)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      for (const { start, end } of this.connections || []) {
        const a = hand.pts[start];
        const b = hand.pts[end];
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
        ctx.stroke();
      }
      ctx.fillStyle = '#FFD500';
      for (const p of hand.pts) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      const label = `${GESTURE_LABELS[hand.gesture] || hand.gesture} ${(hand.score * 100).toFixed(0)}% · mano ${hand.hand === 'Right' ? 'derecha' : hand.hand === 'Left' ? 'izquierda' : '?'}`;
      ctx.font = '600 16px "Source Sans 3", sans-serif';
      const tx = Math.min(w - 260, Math.max(8, hand.cx * w - 60));
      const ty = Math.max(24, hand.cy * h - 70);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(tx - 6, ty - 18, ctx.measureText(label).width + 12, 26);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, tx, ty);
    }

    // Progreso del gesto sostenido.
    if (this.hold.gesture !== 'None' && !this.hold.fired && this.cfg.map[this.hold.gesture] !== 'NONE') {
      const need = this.cfg.holdMs[this.hold.gesture] ?? 800;
      const p = Math.min(1, (now - this.hold.start) / need);
      ctx.strokeStyle = '#FFD500';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(w - 40, 40, 22, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
      ctx.stroke();
    }
  }

  setStatus(status, detail = '') {
    this.status = status;
    this.statusDetail = detail;
    this.dispatchEvent(new CustomEvent('status', { detail: { status, detail } }));
    return status;
  }
}
