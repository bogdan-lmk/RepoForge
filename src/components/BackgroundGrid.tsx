"use client";

import { useEffect, useRef, useCallback } from "react";

const PARTICLE_COUNT = 180;
const CONNECTION_DISTANCE = 200;
const MOUSE_RADIUS = 280;
const MOUSE_FORCE = 0.035;
const DEPTH_LAYERS = 3;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  radius: number;
  opacity: number;
  layer: number;
  phase: number;
  speed: number;
  glowIntensity: number;
}

export function BackgroundGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const timeRef = useRef(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;

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

    const createParticles = (): Particle[] =>
      Array.from({ length: PARTICLE_COUNT }, () => {
        const layer = Math.floor(Math.random() * DEPTH_LAYERS);
        const depthFactor = 0.4 + (layer / DEPTH_LAYERS) * 0.6;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.35 * depthFactor,
          vy: (Math.random() - 0.5) * 0.35 * depthFactor,
          baseRadius: (Math.random() * 2.0 + 0.8) * depthFactor,
          radius: 0,
          opacity: (Math.random() * 0.45 + 0.2) * depthFactor,
          layer,
          phase: Math.random() * Math.PI * 2,
          speed: 0.0006 + Math.random() * 0.0012,
          glowIntensity: Math.random() * 0.5 + 0.25,
        };
      });

    const drawGlow = (
      x: number,
      y: number,
      radius: number,
      alpha: number
    ) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 6);
      gradient.addColorStop(0, `rgba(20, 184, 166, ${alpha * 0.8})`);
      gradient.addColorStop(0.3, `rgba(20, 184, 166, ${alpha * 0.35})`);
      gradient.addColorStop(0.6, `rgba(20, 184, 166, ${alpha * 0.1})`);
      gradient.addColorStop(1, `rgba(20, 184, 166, 0)`);
      ctx.beginPath();
      ctx.arc(x, y, radius * 6, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    };

    const drawNodeGlow = (
      x: number,
      y: number,
      radius: number,
      alpha: number
    ) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 3);
      gradient.addColorStop(0, `rgba(20, 184, 166, ${alpha * 1.2})`);
      gradient.addColorStop(0.5, `rgba(20, 184, 166, ${alpha * 0.4})`);
      gradient.addColorStop(1, `rgba(20, 184, 166, 0)`);
      ctx.beginPath();
      ctx.arc(x, y, radius * 3, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    };

    const drawConnection = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      alpha: number,
      isMouseConnection: boolean
    ) => {
      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      if (isMouseConnection) {
        gradient.addColorStop(0, `rgba(20, 184, 166, ${alpha * 2})`);
        gradient.addColorStop(0.5, `rgba(20, 184, 166, ${alpha * 1.2})`);
        gradient.addColorStop(1, `rgba(20, 184, 166, ${alpha * 2})`);
      } else {
        gradient.addColorStop(0, `rgba(20, 184, 166, ${alpha})`);
        gradient.addColorStop(0.5, `rgba(20, 184, 166, ${alpha * 1.3})`);
        gradient.addColorStop(1, `rgba(20, 184, 166, ${alpha})`);
      }
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = isMouseConnection ? 1.2 : 0.6;
      ctx.stroke();
    };

    const animate = () => {
      timeRef.current += 1;
      const t = timeRef.current;
      const mouse = mouseRef.current;
      const particles = particlesRef.current;

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        const wave =
          Math.sin(t * p.speed + p.phase) * 0.18 +
          Math.cos(t * p.speed * 0.7 + p.phase * 1.3) * 0.12;
        p.vx += wave * 0.012;
        p.vy += Math.cos(t * p.speed + p.phase) * 0.012;

        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MOUSE_RADIUS && dist > 0) {
          const force = (1 - dist / MOUSE_RADIUS) * MOUSE_FORCE;
          p.vx += dx * force * 0.012;
          p.vy += dy * force * 0.012;
        }

        p.vx *= 0.988;
        p.vy *= 0.988;

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -30) p.x = w + 30;
        if (p.x > w + 30) p.x = -30;
        if (p.y < -30) p.y = h + 30;
        if (p.y > h + 30) p.y = -30;

        p.radius =
          p.baseRadius +
          Math.sin(t * p.speed * 2 + p.phase) * p.baseRadius * 0.35;

        const mouseProximity =
          dist < MOUSE_RADIUS ? (1 - dist / MOUSE_RADIUS) : 0;
        const alpha = p.opacity + mouseProximity * p.glowIntensity * 0.8;

        ctx.globalCompositeOperation = "lighter";

        if (mouseProximity > 0.05) {
          drawGlow(p.x, p.y, p.radius, alpha * mouseProximity * 0.6);
        }

        drawNodeGlow(p.x, p.y, p.radius, alpha * 0.35);

        ctx.globalCompositeOperation = "source-over";

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(20, 184, 166, ${Math.min(alpha * 1.4, 0.95)})`;
        ctx.fill();
      }

      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const isNearMouse =
          Math.sqrt((p.x - mouse.x) ** 2 + (p.y - mouse.y) ** 2) <
          MOUSE_RADIUS;

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          if (Math.abs(p.layer - p2.layer) > 1) continue;

          const ddx = p.x - p2.x;
          const ddy = p.y - p2.y;
          const d = Math.sqrt(ddx * ddx + ddy * ddy);

          const connDist = isNearMouse
            ? CONNECTION_DISTANCE * 1.4
            : CONNECTION_DISTANCE;

          if (d < connDist) {
            const baseAlpha = (1 - d / connDist) * 0.08 * (1 + (p.opacity + p2.opacity));
            drawConnection(p.x, p.y, p2.x, p2.y, baseAlpha, isNearMouse);
          }
        }
      }

      ctx.globalCompositeOperation = "source-over";

      animationRef.current = requestAnimationFrame(animate);
    };

    resize();
    particlesRef.current = createParticles();
    animate();

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [handleMouseMove]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}
