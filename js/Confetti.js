const CONFETTI_COLORS = ['#2ecc71', '#f4c542', '#e8eaf0', '#7ddc98'];
const PARTICLE_COUNT = 80;
const GRAVITY = 0.015;
const FADE_START_MS = 2600;
const FADE_RATE = 0.018;

export class Confetti {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.frameId = null;
    this.startTime = 0;
  }

  /** @param {string[]} words Solved words whose letters become confetti particles */
  burst(words) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.destroy();
    this.spawnCanvas();
    this.particles = this.createParticles(words.join('').split(''));
    this.startTime = performance.now();
    this.tick();
  }

  spawnCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    this.canvas = canvas;
    this.ctx = ctx;
  }

  /** @param {string[]} letters Pool of letters to draw particles from @returns {object[]} Particle list */
  createParticles(letters) {
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: -40 - Math.random() * window.innerHeight * 0.6,
        vx: (Math.random() - 0.5) * 1.2,
        vy: 2.2 + Math.random() * 3.4,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.16,
        size: 15 + Math.random() * 17,
        letter: letters[Math.floor(Math.random() * letters.length)],
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        alpha: 1
      });
    }
    return particles;
  }

  tick() {
    this.frameId = requestAnimationFrame(() => this.tick());
    const elapsed = performance.now() - this.startTime;
    const { ctx } = this;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    let alive = false;
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += GRAVITY;
      p.rot += p.vr;
      if (elapsed > FADE_START_MS) p.alpha -= FADE_RATE;
      if (p.alpha <= 0 || p.y > window.innerHeight + 40) continue;
      alive = true;
      ctx.save();
      ctx.globalAlpha = Math.max(p.alpha, 0);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.font = `700 ${p.size}px 'Space Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(p.letter, 0, 0);
      ctx.restore();
    }

    if (!alive) this.destroy();
  }

  destroy() {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
      this.ctx = null;
    }
    this.particles = [];
  }
}
