"use client";

import { useEffect, useRef } from "react";

class SimplexNoise {
  private perm: Uint8Array;
  private grad3: number[][];

  constructor(seed = 0) {
    this.grad3 = [
      [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
      [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
      [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
    ];
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807 + 0) % 2147483647;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise2D(x: number, y: number): number {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const dot = (g: number[], x: number, y: number) => g[0] * x + g[1] * y;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      const gi0 = this.perm[ii + this.perm[jj]] % 12;
      n0 = t0 * t0 * dot(this.grad3[gi0], x0, y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
      n1 = t1 * t1 * dot(this.grad3[gi1], x1, y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12;
      n2 = t2 * t2 * dot(this.grad3[gi2], x2, y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  noise3D(x: number, y: number, z: number): number {
    return (this.noise2D(x, y) + this.noise2D(y + 31.416, z + 47.853) + this.noise2D(z + 13.719, x + 91.237)) / 3;
  }
}

const BAND_COUNT = 6;
const SEGMENTS = 80;

export function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const noise = new SimplexNoise(42);
    const noise2 = new SimplexNoise(137);
    let w = 0;
    let h = 0;
    let t = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawBand = (
      bandIndex: number,
      time: number,
      color: [number, number, number],
      baseY: number,
      amplitude: number,
      thickness: number,
      opacity: number,
      speed: number,
      xScroll: number
    ) => {
      const points: { x: number; y: number }[] = [];

      for (let i = 0; i <= SEGMENTS; i++) {
        const xRatio = i / SEGMENTS;
        const x = xRatio * (w + 200) - 100;

        const n1 = noise.noise3D(xRatio * 2 + xScroll + bandIndex * 0.7, time * speed, bandIndex * 1.3);
        const n2 = noise2.noise3D(xRatio * 3.5 + xScroll * 0.6, time * speed * 0.7 + bandIndex * 0.5, bandIndex * 2.1);
        const n3 = noise.noise2D(xRatio * 5 + xScroll * 1.2, time * speed * 1.5 + bandIndex);

        const combinedWave = n1 * 0.6 + n2 * 0.3 + n3 * 0.1;

        const y = baseY + combinedWave * amplitude + Math.sin(xRatio * Math.PI) * amplitude * 0.2;

        points.push({ x, y });
      }

      const [r, g, b] = color;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      for (let layer = 0; layer < 4; layer++) {
        const layerThickness = thickness * (1 + layer * 0.8);
        const layerOpacity = opacity * (1 - layer * 0.25) * 0.6;

        const gradient = ctx.createLinearGradient(0, baseY - layerThickness, 0, baseY + layerThickness);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
        gradient.addColorStop(0.25, `rgba(${r}, ${g}, ${b}, ${layerOpacity * 0.4})`);
        gradient.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, ${layerOpacity * 0.9})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${layerOpacity})`);
        gradient.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${layerOpacity * 0.9})`);
        gradient.addColorStop(0.75, `rgba(${r}, ${g}, ${b}, ${layerOpacity * 0.4})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y - layerThickness / 2);

        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const cpx = (prev.x + curr.x) / 2;
          ctx.quadraticCurveTo(prev.x, prev.y - layerThickness / 2, cpx, (prev.y + curr.y) / 2 - layerThickness / 2);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y + layerThickness / 2);

        for (let i = points.length - 2; i >= 0; i--) {
          const next = points[i + 1];
          const curr = points[i];
          const cpx = (next.x + curr.x) / 2;
          ctx.quadraticCurveTo(next.x, next.y + layerThickness / 2, cpx, (next.y + curr.y) / 2 + layerThickness / 2);
        }
        ctx.closePath();

        ctx.fillStyle = gradient;
        ctx.fill();
      }

      ctx.restore();
    };

    const drawStars = (time: number) => {
      ctx.save();
      for (let i = 0; i < 40; i++) {
        const seed = i * 7919 + 1;
        const sx = ((seed * 13) % 10000) / 10000 * w;
        const sy = ((seed * 17) % 10000) / 10000 * h * 0.6;
        const sr = ((seed * 23) % 10000) / 10000 * 1.2 + 0.3;
        const twinkle = Math.sin(time * 0.002 + seed * 0.1) * 0.5 + 0.5;
        const alpha = twinkle * 0.35 + 0.05;

        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(20, 184, 166, ${alpha})`;
        ctx.fill();

        if (alpha > 0.25) {
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 5);
          glow.addColorStop(0, `rgba(20, 184, 166, ${alpha * 0.3})`);
          glow.addColorStop(1, `rgba(20, 184, 166, 0)`);
          ctx.beginPath();
          ctx.arc(sx, sy, sr * 5, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }
      }
      ctx.restore();
    };

    const bands = [
      { color: [20, 184, 166] as [number, number, number], yRatio: 0.2, amplitude: 100, thickness: 160, opacity: 0.18, speed: 0.0003, xScroll: 0 },
      { color: [45, 212, 191] as [number, number, number], yRatio: 0.32, amplitude: 130, thickness: 200, opacity: 0.14, speed: 0.00025, xScroll: 0.5 },
      { color: [20, 184, 166] as [number, number, number], yRatio: 0.44, amplitude: 80, thickness: 140, opacity: 0.12, speed: 0.00035, xScroll: 1.2 },
      { color: [15, 118, 110] as [number, number, number], yRatio: 0.56, amplitude: 150, thickness: 220, opacity: 0.16, speed: 0.0002, xScroll: 2.1 },
      { color: [94, 234, 212] as [number, number, number], yRatio: 0.68, amplitude: 90, thickness: 130, opacity: 0.10, speed: 0.00028, xScroll: 3.0 },
      { color: [13, 148, 136] as [number, number, number], yRatio: 0.78, amplitude: 70, thickness: 110, opacity: 0.08, speed: 0.00032, xScroll: 4.0 },
    ];

    const animate = () => {
      t++;
      ctx.clearRect(0, 0, w, h);

      drawStars(t);

      for (let i = 0; i < BAND_COUNT; i++) {
        const band = bands[i];
        drawBand(
          i,
          t,
          band.color,
          h * band.yRatio,
          band.amplitude,
          band.thickness,
          band.opacity,
          band.speed,
          t * 0.00008
        );
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    resize();
    animate();

    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}
