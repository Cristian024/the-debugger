const TAU = Math.PI * 2;
const GRID = 9;

const TONES = {
  teal: '70, 240, 196',
  blue: '90, 169, 255',
  warning: '255, 200, 87',
  core: '157, 255, 230',
};

const RACKS = [
  { x: 1.3, y: 1.3, size: 1.1, height: 50, tone: 'teal' },
  { x: 6.5, y: 1.4, size: 1.1, height: 72, tone: 'blue' },
  { x: 1.4, y: 6.5, size: 1.1, height: 62, tone: 'teal' },
  { x: 6.5, y: 6.5, size: 1.1, height: 44, tone: 'warning' },
];

const CORE = { x: 4.05, y: 4.05, size: 0.9, height: 92, tone: 'core', core: true };

function lerp(from, to, amount) {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

export class IsoEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas?.getContext('2d') ?? null;
    this.running = false;
    this.frameId = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.tile = 40;
    this.originX = 0;
    this.originY = 0;
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.particles = Array.from({ length: 24 }, (_, index) => ({
      x: (((index * 37) % 80) / 10) + 0.5,
      y: (((index * 53) % 80) / 10) + 0.5,
      z: (index * 29) % 120,
      radius: 0.7 + ((index * 7) % 10) / 10,
    }));

    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);

    if (this.canvas) {
      this.observer = new ResizeObserver(this.resize);
      this.observer.observe(this.canvas);
    }

    this.resize();
  }

  resize() {
    if (!this.canvas || !this.context) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(rect.width * dpr);
    const pixelHeight = Math.round(rect.height * dpr);

    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }

    this.dpr = dpr;
    this.width = rect.width;
    this.height = rect.height;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.tile = Math.min(rect.width / 11, rect.height / 6.4);
    this.originX = rect.width * 0.5;
    this.originY = rect.height * 0.3;

    if (!this.running || this.reduceMotion) {
      this.render(performance.now());
    }
  }

  start() {
    if (!this.context || this.running) {
      return;
    }

    this.running = true;
    this.resize();

    if (this.reduceMotion) {
      this.render(performance.now());
      return;
    }

    this.frameId = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.frameId);
  }

  loop(time) {
    if (!this.running) {
      return;
    }

    this.render(time);
    this.frameId = requestAnimationFrame(this.loop);
  }

  project(x, y, z = 0) {
    return {
      x: this.originX + (x - y) * this.tile * 0.5,
      y: this.originY + (x + y) * this.tile * 0.25 - z,
    };
  }

  render(time) {
    if (!this.context || !this.width || !this.height) {
      return;
    }

    const ctx = this.context;
    const width = this.width;
    const height = this.height;
    const seconds = time / 1000;

    const background = ctx.createRadialGradient(
      width * 0.5,
      height * 0.08,
      8,
      width * 0.5,
      height * 0.7,
      Math.max(width, height),
    );
    background.addColorStop(0, 'rgba(11, 38, 38, 0.95)');
    background.addColorStop(0.52, '#04100f');
    background.addColorStop(1, '#020607');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    this.drawFloor(ctx, seconds);
    this.drawRings(ctx, seconds);

    const racks = [...RACKS, CORE].sort((left, right) => left.x + left.y - (right.x + right.y));
    racks.forEach((rack) => this.drawRack(ctx, rack, seconds));

    this.drawParticles(ctx, seconds);
  }

  drawFloor(ctx, seconds) {
    ctx.save();
    ctx.lineWidth = 1;

    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        const a = this.project(x, y);
        const b = this.project(x + 1, y);
        const c = this.project(x + 1, y + 1);
        const d = this.project(x, y + 1);
        const pulse = 0.5 + 0.5 * Math.sin(seconds * 1.4 - (x + y) * 0.6);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.fillStyle = `rgba(70, 240, 196, ${(0.014 + pulse * 0.028).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(70, 240, 196, ${(0.04 + pulse * 0.045).toFixed(3)})`;
        ctx.stroke();
      }
    }

    const corners = [this.project(0, 0), this.project(GRID, 0), this.project(GRID, GRID), this.project(0, GRID)];
    ctx.beginPath();
    corners.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(70, 240, 196, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  drawRings(ctx, seconds) {
    const center = this.project(GRID / 2, GRID / 2);
    const radius = this.tile * 2.7;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 12]);
    ctx.lineDashOffset = -seconds * 18;
    ctx.strokeStyle = 'rgba(70, 240, 196, 0.22)';
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, radius, radius * 0.5, 0, 0, TAU);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(90, 169, 255, 0.15)';
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, radius * 1.3, radius * 0.65, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawRack(ctx, rack, seconds) {
    const rgb = TONES[rack.tone] ?? TONES.teal;
    const a = this.project(rack.x, rack.y);
    const b = this.project(rack.x + rack.size, rack.y);
    const c = this.project(rack.x + rack.size, rack.y + rack.size);
    const d = this.project(rack.x, rack.y + rack.size);

    const height = rack.core ? rack.height * (0.98 + 0.04 * Math.sin(seconds * 1.6)) : rack.height;
    const lift = (point) => ({ x: point.x, y: point.y - height });
    const aTop = lift(a);
    const bTop = lift(b);
    const cTop = lift(c);
    const dTop = lift(d);

    ctx.save();

    if (rack.core) {
      ctx.shadowColor = `rgba(${rgb}, 0.55)`;
      ctx.shadowBlur = 24;
    }

    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(cTop.x, cTop.y);
    ctx.lineTo(dTop.x, dTop.y);
    ctx.closePath();
    ctx.fillStyle = `rgba(${rgb}, ${rack.core ? 0.2 : 0.09})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${rgb}, 0.5)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(cTop.x, cTop.y);
    ctx.lineTo(bTop.x, bTop.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(2, 9, 10, 0.65)';
    ctx.fill();
    ctx.strokeStyle = `rgba(${rgb}, 0.32)`;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(aTop.x, aTop.y);
    ctx.lineTo(bTop.x, bTop.y);
    ctx.lineTo(cTop.x, cTop.y);
    ctx.lineTo(dTop.x, dTop.y);
    ctx.closePath();
    ctx.fillStyle = `rgba(${rgb}, ${rack.core ? 0.35 : 0.16})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${rgb}, 0.72)`;
    ctx.stroke();

    ctx.shadowBlur = 0;

    ctx.strokeStyle = `rgba(${rgb}, 0.16)`;
    for (let seam = 1; seam <= 3; seam += 1) {
      const amount = seam / 4;
      const leftBottom = lerp(d, c, amount);
      const leftTop = lerp(dTop, cTop, amount);
      ctx.beginPath();
      ctx.moveTo(leftBottom.x, leftBottom.y);
      ctx.lineTo(leftTop.x, leftTop.y);
      ctx.stroke();
    }

    const led = lerp(d, c, 0.5);
    const ledPoint = { x: led.x, y: led.y - height * 0.62 };
    const glow = 0.55 + 0.45 * Math.sin(seconds * 3 + rack.x);

    ctx.fillStyle = `rgba(${rgb}, ${(0.45 + glow * 0.5).toFixed(3)})`;
    ctx.shadowColor = `rgba(${rgb}, 0.8)`;
    ctx.shadowBlur = rack.core ? 16 : 8;
    ctx.beginPath();
    ctx.arc(ledPoint.x, ledPoint.y, rack.core ? 4 : 2.4, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  drawParticles(ctx, seconds) {
    ctx.save();
    for (const particle of this.particles) {
      const z = (particle.z + seconds * 16) % 120;
      const point = this.project(particle.x, particle.y, z);
      const pulse = 0.5 + 0.5 * Math.sin((z / 120) * Math.PI);
      const alpha = 0.08 + 0.42 * pulse;

      ctx.fillStyle = `rgba(157, 255, 230, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, particle.radius, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
