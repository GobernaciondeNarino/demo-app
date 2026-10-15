/**
 * Control del tiempo de la ponencia (sección 0.1):
 * - cronómetro por bloque y total (solo en la vista de presentador);
 * - avisos "te queda un minuto" y "tiempo cumplido" por bloque;
 * - retraso acumulado (si supera el umbral, el asistente solo recuerda
 *   datos de prioridad alta);
 * - resumen final: tiempo real por bloque vs. planeado.
 */
export class BlockTimer extends EventTarget {
  constructor() {
    super();
    this.blocks = [];
    this.reset();
  }

  configure(blocks, timing) {
    this.blocks = blocks.map((b) => ({ id: b.id, name: b.name, planned: Math.round(b.minutes * 60) }));
    this.timing = timing;
    for (const b of this.blocks) this.spent[b.id] ??= 0;
  }

  now() {
    return Date.now() / 1000;
  }

  reset() {
    this.running = false;
    this.paused = false;
    this.ended = false;
    this.startedAt = null;
    this.endedAt = null;
    this.elapsedBefore = 0;
    this.runStart = null;
    this.spent = {};
    this.firstEntry = {};
    this.currentBlock = this.currentBlock || null;
    this.segmentStart = null;
    this.warned = {};
    for (const b of this.blocks || []) this.spent[b.id] = 0;
    this.emit();
  }

  /** Inicia el cronómetro (si ya corría, no hace nada). */
  start(blockId = this.currentBlock) {
    if (this.running) return;
    this.reset();
    this.running = true;
    this.startedAt = new Date().toISOString();
    this.runStart = this.now();
    this.currentBlock = blockId;
    this.segmentStart = this.runStart;
    if (blockId) this.firstEntry[blockId] = 0;
    this.emit();
  }

  totalElapsed() {
    if (!this.running && !this.ended) return 0;
    const live = this.runStart !== null && !this.paused && !this.ended ? this.now() - this.runStart : 0;
    return this.elapsedBefore + live;
  }

  closeSegment() {
    if (this.segmentStart !== null && this.currentBlock && !this.paused && !this.ended) {
      this.spent[this.currentBlock] = (this.spent[this.currentBlock] || 0) + (this.now() - this.segmentStart);
    }
    this.segmentStart = this.paused || this.ended ? null : this.now();
  }

  setBlock(blockId) {
    if (blockId === this.currentBlock) return;
    if (this.running) {
      this.closeSegment();
      if (!(blockId in this.firstEntry)) this.firstEntry[blockId] = this.totalElapsed();
    }
    this.currentBlock = blockId;
    this.emit();
  }

  pause() {
    if (!this.running || this.paused || this.ended) return;
    this.closeSegment();
    this.elapsedBefore += this.now() - this.runStart;
    this.runStart = null;
    this.paused = true;
    this.segmentStart = null;
    this.emit();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.runStart = this.now();
    this.segmentStart = this.runStart;
    this.emit();
  }

  end() {
    if (!this.running || this.ended) return null;
    if (this.paused) this.resume();
    this.closeSegment();
    this.elapsedBefore += this.now() - this.runStart;
    this.runStart = null;
    this.ended = true;
    this.endedAt = new Date().toISOString();
    this.emit();
    return this.summary();
  }

  blockSpent(id) {
    let s = this.spent[id] || 0;
    if (id === this.currentBlock && this.segmentStart !== null && this.running && !this.paused && !this.ended) {
      s += this.now() - this.segmentStart;
    }
    return s;
  }

  plannedStart(id) {
    let acc = 0;
    for (const b of this.blocks) {
      if (b.id === id) return acc;
      acc += b.planned;
    }
    return acc;
  }

  /** Retraso en segundos (negativo = adelantado). */
  delay() {
    const b = this.blocks.find((x) => x.id === this.currentBlock);
    if (!b || !this.running) return 0;
    const spent = this.blockSpent(b.id);
    return this.totalElapsed() - this.plannedStart(b.id) - Math.min(spent, b.planned);
  }

  /** Revisa los avisos; se llama ~cada 250 ms. */
  tick() {
    if (!this.running || this.paused || this.ended || !this.timing?.enabled) return;
    const b = this.blocks.find((x) => x.id === this.currentBlock);
    if (!b) return;
    const remaining = b.planned - this.blockSpent(b.id);
    const w = (this.warned[b.id] ||= {});
    if (b.planned > 90 && remaining <= 60 && remaining > 0 && !w.oneMinute) {
      w.oneMinute = true;
      this.dispatchEvent(new CustomEvent('warning', { detail: { kind: 'oneMinute', block: b } }));
    }
    if (remaining <= 0 && !w.timeUp) {
      w.timeUp = true;
      w.oneMinute = true;
      this.dispatchEvent(new CustomEvent('warning', { detail: { kind: 'timeUp', block: b } }));
    }
  }

  get behind() {
    return this.delay() > (this.timing?.behindSeconds ?? 60);
  }

  snapshot() {
    const total = this.totalElapsed();
    const planned = this.blocks.reduce((s, b) => s + b.planned, 0);
    const cur = this.blocks.find((b) => b.id === this.currentBlock);
    return {
      running: this.running,
      paused: this.paused,
      ended: this.ended,
      startedAt: this.startedAt,
      total: Math.round(total),
      planned,
      delay: Math.round(this.delay()),
      behind: this.behind,
      block: cur ? { id: cur.id, name: cur.name, planned: cur.planned, spent: Math.round(this.blockSpent(cur.id)) } : null,
      blocks: this.blocks.map((b) => ({ id: b.id, name: b.name, planned: b.planned, spent: Math.round(this.blockSpent(b.id)) })),
    };
  }

  summary() {
    const s = this.snapshot();
    return {
      startedAt: this.startedAt,
      endedAt: this.endedAt || new Date().toISOString(),
      plannedSeconds: s.planned,
      actualSeconds: s.total,
      blocks: s.blocks.map((b) => ({ ...b, diff: b.spent - b.planned })),
    };
  }

  emit() {
    this.dispatchEvent(new CustomEvent('change'));
  }
}
