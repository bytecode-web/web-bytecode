import { useEffect, useRef } from 'react';
import './HeroGalaxy.css';

/** Cached layers: expensive star/nebula drawing happens only at setup or resize. */
export default function HeroGalaxy() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    let seed = 73;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const galaxy = document.createElement('canvas');
    galaxy.width = galaxy.height = 1024;
    const g = galaxy.getContext('2d');
    if (!g) return;
    const glow = (x: number, y: number, radius: number, color: string, alpha: number) => {
      const gradient = g.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(${color},${alpha})`);
      gradient.addColorStop(.35, `rgba(${color},${alpha * .35})`);
      gradient.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = gradient;
      g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    g.globalCompositeOperation = 'lighter';
    // Soft gas arms give volume without blur filters or thousands of animated objects.
    for (let arm = 0; arm < 3; arm++) {
      for (let step = 0; step < 95; step++) {
        const radius = 30 + step * 4.3;
        const angle = arm * Math.PI * 2 / 3 + radius * .012;
        glow(512 + Math.cos(angle) * radius, 512 + Math.sin(angle) * radius,
          24 + radius * .13, arm === 1 ? '103,91,231' : '16,161,210', .045);
      }
    }
    for (let i = 0; i < 6500; i++) {
      const radius = Math.pow(random(), .7) * 450;
      const angle = (i % 3) * Math.PI * 2 / 3 + radius * .012 + (random() - .5) * .62;
      const spread = (random() - .5) * (12 + radius * .13);
      const x = 512 + Math.cos(angle) * (radius + spread);
      const y = 512 + Math.sin(angle) * (radius + spread);
      const alpha = .14 + random() * .48;
      g.fillStyle = radius < 100 ? `rgba(225,237,255,${alpha})` : `rgba(110,204,247,${alpha})`;
      g.beginPath(); g.arc(x, y, .25 + random() * .75, 0, Math.PI * 2); g.fill();
      if (i % 100 === 0) glow(x, y, 7, '134,217,255', .35);
    }
    glow(512, 512, 165, '71,119,222', .5);
    glow(512, 512, 80, '174,214,255', .65);
    glow(512, 512, 29, '244,242,255', .95);

    const stars = document.createElement('canvas');
    const s = stars.getContext('2d');
    let width = 1;
    let height = 1;
    let ratio = 1;
    let visible = false;
    let disposed = false;
    let angle = 0;
    let lastTime = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const draw = () => {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(stars, 0, 0);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.save();
      // Match the former camera at (0, 1, 6), looking at (0, -1, 0):
      // a horizontal, nearly edge-on disk with its core above the center.
      const focalLength = height / (2 * Math.tan(75 * Math.PI / 360));
      context.translate(width * .5, height * .5 - focalLength * 3 / 19);
      context.scale(1, 1 / Math.sqrt(37));
      context.rotate(angle);
      context.globalCompositeOperation = 'lighter';
      const size = Math.max(width * 1.12, height * 1.8);
      context.drawImage(galaxy, -size / 2, -size / 2, size, size);
      context.restore();
    };
    const stop = () => { clearTimeout(timer); cancelAnimationFrame(frame); frame = 0; lastTime = 0; };
    const canAnimate = () => visible && !document.hidden && !reduced.matches && !connection?.saveData;
    const tick = (now: number) => {
      if (disposed || !canAnimate()) return;
      if (lastTime) angle += Math.min(now - lastTime, 100) * .000012;
      lastTime = now;
      draw();
      timer = setTimeout(() => { frame = requestAnimationFrame(tick); }, width < 768 ? 50 : 40);
    };
    const sync = () => { stop(); if (canAnimate()) frame = requestAnimationFrame(tick); };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height));
      // At most one million pixels, including on Retina and ultrawide displays.
      ratio = Math.min(window.devicePixelRatio || 1, 1.25, Math.sqrt(1000000 / (width * height)));
      canvas.width = stars.width = Math.max(1, Math.round(width * ratio));
      canvas.height = stars.height = Math.max(1, Math.round(height * ratio));
      if (s) {
        seed = 117;
        s.clearRect(0, 0, stars.width, stars.height);
        s.setTransform(ratio, 0, 0, ratio, 0, 0);
        const count = Math.min(450, Math.round(width * height / 2300));
        for (let i = 0; i < count; i++) {
          const x = random() * width, y = random() * height;
          const radius = .35 + random() * .8;
          s.fillStyle = `rgba(184,218,255,${.16 + random() * .55})`;
          s.beginPath(); s.arc(x, y, radius, 0, Math.PI * 2); s.fill();
          if (i % 27 === 0) {
            const halo = s.createRadialGradient(x, y, 0, x, y, 9);
            halo.addColorStop(0, 'rgba(130,211,255,.5)'); halo.addColorStop(1, 'rgba(130,211,255,0)');
            s.fillStyle = halo; s.fillRect(x - 9, y - 9, 18, 18);
          }
        }
      }
      draw();
      sync();
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    const resizeObserver = new ResizeObserver(resize);
    observer.observe(canvas);
    resizeObserver.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    resize();
    return () => {
      disposed = true; stop(); observer.disconnect(); resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', sync); reduced.removeEventListener('change', sync);
      galaxy.width = galaxy.height = stars.width = stars.height = 0;
    };
  }, []);
  return (
    <div className="hero-galaxy" aria-hidden="true">
      <div className="hero-galaxy-menu-background">
        <div
          className="hero-galaxy-menu-stars"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}vectors/designs/stardust.png)` }}
        />
        <div
          className="hero-galaxy-menu-stars hero-galaxy-menu-stars-reversed"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}vectors/designs/stardust.png)` }}
        />
      </div>
      <canvas ref={ref} />
      <div className="hero-galaxy-vignette" />
    </div>
  );
}
